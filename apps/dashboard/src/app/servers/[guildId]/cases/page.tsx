import { and, count, desc, eq, gte, memberNotes, modCases, sql, type CaseType } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { getMembers } from "@/lib/discord";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { addMemberNote, deleteMemberNote, revokeWarning } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Fallakte") }) };
}

const LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};

const dateFormat = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function CasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ nutzer?: string; gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "cases");
  const { nutzer, gespeichert, fehler } = await searchParams;
  const userFilter = nutzer && /^\d{17,20}$/.test(nutzer.trim()) ? nutzer.trim() : undefined;

  const { db } = database();
  const cases = await db
    .select()
    .from(modCases)
    .where(userFilter ? and(eq(modCases.guildId, guildId), eq(modCases.targetId, userFilter)) : eq(modCases.guildId, guildId))
    .orderBy(desc(modCases.caseNumber))
    .limit(100);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stats, notes] = await Promise.all([
    userFilter
      ? []
      : db
          .select({
            moderatorId: modCases.moderatorId,
            total: count(),
            warns: sql<number>`count(*) filter (where ${modCases.type} = 'warn')`.mapWith(Number),
            timeouts: sql<number>`count(*) filter (where ${modCases.type} = 'timeout')`.mapWith(Number),
            kicks: sql<number>`count(*) filter (where ${modCases.type} = 'kick')`.mapWith(Number),
            bans: sql<number>`count(*) filter (where ${modCases.type} = 'ban')`.mapWith(Number),
          })
          .from(modCases)
          .where(and(eq(modCases.guildId, guildId), eq(modCases.automatic, false), gte(modCases.createdAt, since)))
          .groupBy(modCases.moderatorId)
          .orderBy(desc(count()))
          .limit(10),
    userFilter
      ? db.select().from(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.userId, userFilter))).orderBy(desc(memberNotes.createdAt)).limit(50)
      : [],
  ]);
  const people = await getMembers(guildId, [...new Set([...stats.map((s) => s.moderatorId), ...notes.map((n) => n.authorId), ...(userFilter ? [userFilter] : [])])]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <PageHeader icon="list" title={t("Fallakte")} description={t("Alle Moderationsaktionen auf deinem Server, die neuesten zuerst.")} />
      <Notice saved={gespeichert} error={fehler} />

      <form className="card" method="get">
        <div className="field">
          <label htmlFor="nutzer">{t("Nach Nutzer-ID filtern")}</label>
          <input id="nutzer" name="nutzer" type="text" inputMode="numeric" defaultValue={userFilter ?? ""} placeholder="z. B. 123456789012345678" />
          <div className="hint">{t("Die ID bekommst du in Discord per Rechtsklick auf die Person → „Nutzer-ID kopieren“ (Entwicklermodus).")}</div>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.85rem" }}>
          <button type="submit" className="secondary">
            {t("Filtern")}</button>
          {userFilter && <a href="?">{t("Filter entfernen")}</a>}
        </div>
      </form>

      {stats.length > 0 && (
        <section className="card">
          <div className="card-title">
            <Icon name="users" />
            <h2>{t("Team in den letzten 30 Tagen")}</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Moderator")}</th>
                  <th>{t("Fälle")}</th>
                  <th>{t("Verwarnungen")}</th>
                  <th>{t("Timeouts")}</th>
                  <th>{t("Kicks")}</th>
                  <th>{t("Bans")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((r) => (
                  <tr key={r.moderatorId}>
                    <td>{name(r.moderatorId)}</td>
                    <td>
                      <strong>{r.total}</strong>
                    </td>
                    <td>{r.warns}</td>
                    <td>{r.timeouts}</td>
                    <td>{r.kicks}</td>
                    <td>{r.bans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint">{t("Automatische Fälle durch Auto-Mod und Verwarnungsstufen zählen hier nicht mit. Im Chat:")}{" "}<code>{t("/modstats")}</code>.</div>
        </section>
      )}

      {userFilter && (
        <section className="card">
          <div className="card-title">
            <Icon name="note" />
            <h2>{t("Team-Notizen zu")}{" "}{name(userFilter)}</h2>
          </div>
          {notes.length === 0 ? (
            <p className="empty" style={{ paddingTop: 0 }}>
              {t("Noch keine Notizen. Nur das Team sieht sie, die Person selbst nicht.")}</p>
          ) : (
            <ul className="notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <div className="small muted">
                    #{n.id} · {dateFormat.format(n.createdAt)} · {name(n.authorId)}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
                  <form action={deleteMemberNote.bind(null, guildId, n.id)}>
                    <button className="danger small" type="submit" aria-label={t("Notiz {id} löschen", { id: n.id })}>
                      <Icon name="trash" size={15} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addMemberNote.bind(null, guildId, userFilter)}>
            <label htmlFor="note">{t("Neue Notiz")}</label>
            <textarea id="note" name="note" rows={2} maxLength={1000} required placeholder={t("z. B. Hat sich im Ticket entschuldigt, beim nächsten Mal direkt Timeout.")} />
            <button type="submit" className="secondary" style={{ marginTop: ".75rem" }}>
              <Icon name="plus" size={16} /> {" "}{t("Notiz speichern")}</button>
          </form>
        </section>
      )}

      <div className="card table-wrap">
        {cases.length === 0 ? (
          <p className="empty">{t("Noch keine Fälle")}{userFilter ? t(" für diese Person") : ""}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("Art")}</th>
                <th>{t("Person")}</th>
                <th>{t("Grund")}</th>
                <th>{t("Wann")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.caseNumber}</td>
                  <td>
                    <span className={`badge ${c.type === "ban" ? "danger" : c.type === "unban" || c.type === "untimeout" ? "on" : "warn"}`}>{t(LABELS[c.type])}</span>
                    {c.automatic && <div className="small muted">{t("automatisch")}</div>}
                    {!c.active && (c.type === "warn" || c.type === "ban") && <div className="small muted">{t("nicht mehr aktiv")}</div>}
                  </td>
                  <td>
                    <a className="mono" href={`?nutzer=${c.targetId}`}>
                      {c.targetId}
                    </a>
                  </td>
                  <td>{c.reason || <span className="muted">{t("Kein Grund")}</span>}</td>
                  <td className="small">{dateFormat.format(c.createdAt)}</td>
                  <td>
                    {c.type === "warn" && c.active && (
                      <form action={revokeWarning.bind(null, guildId, c.caseNumber)}>
                        <button className="danger small" type="submit">
                          {t("Zurücknehmen")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
