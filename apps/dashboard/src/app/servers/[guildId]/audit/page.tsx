import Link from "next/link";
import { and, dashboardAudit, desc, eq, type SQL } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { REDO_PREFIX, UNDO_PREFIX } from "@/lib/undo";
import { undoChange } from "../actions";
import { requireGuildAccess } from "@/lib/access";
import { AREAS, areaLabel } from "@/lib/areas";
import { database } from "@/lib/db";
import { t, dateFmt, initLocale } from "@/lib/i18n";

/** Gespeichert wird der deutsche Text, angezeigt in der Sprache der Person (Details hinter „: “ bleiben, wie sie sind). */
function actionLabel(action: string): string {
  for (const prefix of [UNDO_PREFIX, REDO_PREFIX]) {
    if (action.startsWith(prefix)) return `${t(prefix)}${actionLabel(action.slice(prefix.length))}`;
  }
  const i = action.indexOf(": ");
  return i < 0 ? t(action) : `${t(action.slice(0, i))}: ${action.slice(i + 2)}`;
}

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Änderungsprotokoll") }) };
}

const PAGE_SIZE = 50;
const when = dateFmt({ dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ bereich?: string; person?: string; seite?: string; fehler?: string; rueckgaengig?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "audit");
  const { bereich, person, seite, fehler, rueckgaengig } = await searchParams;
  const page = Math.max(1, Math.min(1000, Number(seite) || 1));
  const { db } = database();
  const where: SQL[] = [eq(dashboardAudit.guildId, guildId)];
  if (bereich && AREAS.some((a) => a.key === bereich)) where.push(eq(dashboardAudit.area, bereich));
  if (person && /^\d{17,20}$/.test(person)) where.push(eq(dashboardAudit.userId, person));
  const rows = await db
    .select()
    .from(dashboardAudit)
    .where(and(...where))
    .orderBy(desc(dashboardAudit.createdAt), desc(dashboardAudit.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const more = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const base = `/servers/${guildId}/audit`;
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (bereich) q.set("bereich", bereich);
    if (person) q.set("person", person);
    if (p > 1) q.set("seite", String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <PageHeader
        icon="file"
        title={t("Änderungsprotokoll")}
        description={t("Wer hat wann im Dashboard was geändert. Einträge bleiben ein Jahr gespeichert. Einstellungen lassen sich mit einem Klick zurückdrehen.")}
      />
      <Notice error={fehler} />
      {rueckgaengig && (
        <div className="toast" role="status">
          {t("Rückgängig gemacht. Libremod übernimmt den alten Stand sofort. Panels oder Nachrichten in Discord postest du bei Bedarf neu.")}
        </div>
      )}

      <form className="card filterbar" method="get" action={base}>
        <div className="grid-3">
          <div>
            <label htmlFor="bereich">{t("Bereich")}</label>
            <select id="bereich" name="bereich" defaultValue={bereich ?? ""}>
              <option value="">{t("Alle Bereiche")}</option>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {t(a.label)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="person">{t("Nutzer-ID")}</label>
            <input id="person" name="person" type="text" inputMode="numeric" defaultValue={person ?? ""} placeholder="optional" />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="submit" className="secondary">
              {t("Filtern")}</button>
          </div>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="file" />
          <h2>{t("Änderungen")}</h2>
        </div>
        {shown.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Noch keine Änderungen")}{bereich || person ? t(" für diesen Filter") : ""}.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Wann")}</th>
                  <th>{t("Wer")}</th>
                  <th>{t("Bereich")}</th>
                  <th>{t("Was")}</th>
                  <th aria-label={t("Rückgängig")} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{when.format(r.createdAt)}</td>
                    <td>
                      <Link href={`${base}?person=${r.userId}`}>{r.userName}</Link>
                    </td>
                    <td>
                      <Link href={`${base}?bereich=${r.area}`}>{t(areaLabel(r.area))}</Link>
                    </td>
                    <td>{actionLabel(r.action)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.undoneAt ? (
                        <span className="badge" title={t("von {name}", { name: r.undoneBy ?? "?" })}>
                          {t("zurückgenommen")}
                        </span>
                      ) : r.before && r.after ? (
                        <form action={undoChange.bind(null, guildId, r.id)}>
                          <button type="submit" className="secondary small">
                            <Icon name="undo" size={16} /> {t("Rückgängig")}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(page > 1 || more) && (
          <div className="savebar">
            {page > 1 ? <Link className="button secondary" href={link(page - 1)}>{t("Neuere")}</Link> : <span />}
            {more && <Link className="button secondary" href={link(page + 1)}>{t("Ältere")}</Link>}
          </div>
        )}
      </section>
    </>
  );
}
