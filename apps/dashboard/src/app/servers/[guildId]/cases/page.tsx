import { and, desc, eq, modCases, type CaseType } from "@libremod/db";
import { Notice } from "@/components/Notice";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { revokeWarning } from "../actions";

export const metadata = { title: "Fallakte · Libremod" };

const LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function CasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ nutzer?: string; gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { nutzer, gespeichert, fehler } = await searchParams;
  const userFilter = nutzer && /^\d{17,20}$/.test(nutzer.trim()) ? nutzer.trim() : undefined;

  const { db } = database();
  const cases = await db
    .select()
    .from(modCases)
    .where(userFilter ? and(eq(modCases.guildId, guildId), eq(modCases.targetId, userFilter)) : eq(modCases.guildId, guildId))
    .orderBy(desc(modCases.caseNumber))
    .limit(100);

  return (
    <>
      <h1>Fallakte</h1>
      <Notice saved={gespeichert} error={fehler} />

      <form className="card" method="get">
        <div className="field">
          <label htmlFor="nutzer">Nach Nutzer-ID filtern</label>
          <input id="nutzer" name="nutzer" type="text" inputMode="numeric" defaultValue={userFilter ?? ""} placeholder="z. B. 123456789012345678" />
          <div className="hint">Die ID bekommst du in Discord per Rechtsklick auf die Person → „Nutzer-ID kopieren“ (Entwicklermodus).</div>
        </div>
        <div className="actions">
          <button type="submit" className="secondary">
            Filtern
          </button>
          {userFilter && <a href="?">Filter entfernen</a>}
        </div>
      </form>

      <div className="card table-wrap">
        {cases.length === 0 ? (
          <p className="muted">Noch keine Fälle{userFilter ? " für diese Person" : ""}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Art</th>
                <th>Person</th>
                <th>Grund</th>
                <th>Wann</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.caseNumber}</td>
                  <td>
                    <span className="badge">{LABELS[c.type]}</span>
                    {c.automatic && <div className="small muted">automatisch</div>}
                    {!c.active && (c.type === "warn" || c.type === "ban") && <div className="small muted">nicht mehr aktiv</div>}
                  </td>
                  <td>
                    <a className="mono" href={`?nutzer=${c.targetId}`}>
                      {c.targetId}
                    </a>
                  </td>
                  <td>{c.reason || <span className="muted">Kein Grund</span>}</td>
                  <td className="small">{dateFormat.format(c.createdAt)}</td>
                  <td>
                    {c.type === "warn" && c.active && (
                      <form action={revokeWarning.bind(null, guildId, c.caseNumber)}>
                        <button className="danger small" type="submit">
                          Zurücknehmen
                        </button>
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
