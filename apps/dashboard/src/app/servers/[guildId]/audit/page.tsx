import Link from "next/link";
import { and, dashboardAudit, desc, eq, type SQL } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { AREAS, areaLabel } from "@/lib/areas";
import { database } from "@/lib/db";

export const metadata = { title: "Änderungsprotokoll · Libremod" };

const PAGE_SIZE = 50;
const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ bereich?: string; person?: string; seite?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "audit");
  const { bereich, person, seite } = await searchParams;
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
        title="Änderungsprotokoll"
        description="Wer hat wann im Dashboard was geändert. Einträge bleiben ein Jahr gespeichert."
      />

      <form className="card filterbar" method="get" action={base}>
        <div className="grid-3">
          <div>
            <label htmlFor="bereich">Bereich</label>
            <select id="bereich" name="bereich" defaultValue={bereich ?? ""}>
              <option value="">Alle Bereiche</option>
              {AREAS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="person">Nutzer-ID</label>
            <input id="person" name="person" type="text" inputMode="numeric" defaultValue={person ?? ""} placeholder="optional" />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="submit" className="secondary">
              Filtern
            </button>
          </div>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="file" />
          <h2>Änderungen</h2>
        </div>
        {shown.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch keine Änderungen{bereich || person ? " für diesen Filter" : ""}.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wann</th>
                  <th>Wer</th>
                  <th>Bereich</th>
                  <th>Was</th>
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
                      <Link href={`${base}?bereich=${r.area}`}>{areaLabel(r.area)}</Link>
                    </td>
                    <td>{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(page > 1 || more) && (
          <div className="savebar">
            {page > 1 ? <Link className="button secondary" href={link(page - 1)}>Neuere</Link> : <span />}
            {more && <Link className="button secondary" href={link(page + 1)}>Ältere</Link>}
          </div>
        )}
      </section>
    </>
  );
}
