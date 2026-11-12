import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  BACKUP_WARN_H,
  botOnline,
  getInstanceStatus,
  isInstanceOwner,
} from "@/lib/instance";
import { getUser } from "@/lib/session";
import pkg from "../../../package.json";

export const metadata = { title: "Status · Libremod" };
export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("de-DE");
const dt = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

function ago(date: Date, now: number) {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 90) return `vor ${s} Sekunden`;
  const m = Math.round(s / 60);
  if (m < 90) return `vor ${m} Minuten`;
  const h = Math.round(m / 60);
  if (h < 36) return `vor ${h} Stunden`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

function duration(ms: number) {
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d} ${d === 1 ? "Tag" : "Tagen"}, ${h} Std.`;
  if (h) return `${h} Std., ${m % 60} Min.`;
  return `${m} Min.`;
}

function size(bytes: number) {
  if (bytes < 1024 * 1024)
    return `${nf.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

export default async function StatusPage() {
  const session = await getUser();
  if (!session) redirect("/");
  const status = await getInstanceStatus().catch(() => null);
  const now = Date.now();

  // Solange sich der Bot nie gemeldet hat, sind die Besitzer unbekannt: dann nur diesen Hinweis zeigen.
  if (!status || !status.ownerIds.length) {
    return (
      <>
        <PageHeader
          icon="gauge"
          title="Status"
          description="Zustand dieser Libremod-Installation."
        />
        <div className="toast warn-box" role="status">
          Der Bot hat sich noch nicht gemeldet. Läuft er? Auf dem Server zeigt{" "}
          <code>libremod status</code> den Zustand und{" "}
          <code>libremod logs bot</code> die Meldungen.
        </div>
      </>
    );
  }
  if (!isInstanceOwner(status, session.user.id)) notFound();

  const online = botOnline(status, now);
  const dashboardVersion = pkg.version;
  const versionMismatch = status.version && status.version !== dashboardVersion;
  const backupAge = status.lastBackupAt
    ? (now - status.lastBackupAt.getTime()) / 3_600_000
    : null;

  return (
    <>
      <p>
        <Link href="/servers" className="small">
          ← Deine Server
        </Link>
      </p>
      <PageHeader
        icon="gauge"
        title="Status"
        description="Zustand dieser Libremod-Installation. Nur die Besitzer der Bot-Anwendung im Discord Developer Portal sehen diese Seite."
      />

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        {!online && (
          <div
            className="toast error"
            role="alert"
            style={{ display: "block", fontWeight: 500 }}
          >
            Der Bot ist offline
            {status.heartbeatAt
              ? ` (letzte Meldung ${ago(status.heartbeatAt, now)})`
              : ""}
            . Auf dem Server zeigt <code>libremod logs bot</code>, was los ist.{" "}
            <code>libremod restart</code> startet ihn neu.
          </div>
        )}
        {versionMismatch && (
          <div className="toast warn-box" role="status">
            Bot ({status.version}) und Dashboard ({dashboardVersion}) haben
            unterschiedliche Versionen. <code>libremod update</code> bringt
            beide auf den neuesten Stand.
          </div>
        )}
        {(backupAge === null || backupAge > BACKUP_WARN_H) && (
          <div className="toast warn-box" role="status">
            {backupAge === null
              ? "Es gibt noch keine Datensicherung."
              : `Die letzte Datensicherung ist ${ago(status.lastBackupAt!, now)} gelaufen.`}{" "}
            Die Installation mit dem Install-Skript sichert jede Nacht
            automatisch, von Hand geht es mit <code>libremod backup</code>.
          </div>
        )}
      </div>

      <div className="stats stats-4" style={{ marginBottom: "1rem" }}>
        <div className="card stat">
          <div className="stat-label">Bot</div>
          <div className="stat-value">
            <span className={online ? "badge on" : "badge danger"}>
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Läuft seit</div>
          <div className="stat-value">
            {online && status.startedAt
              ? duration(now - status.startedAt.getTime())
              : "–"}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Server</div>
          <div className="stat-value">{nf.format(status.guilds)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Ping zu Discord</div>
          <div className="stat-value">
            {online && status.pingMs ? `${nf.format(status.pingMs)} ms` : "–"}
          </div>
        </div>
      </div>

      <section className="card">
        <h2>Details</h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">Version Bot</th>
              <td>{status.version || "unbekannt"}</td>
            </tr>
            <tr>
              <th scope="row">Version Dashboard</th>
              <td>{dashboardVersion}</td>
            </tr>
            <tr>
              <th scope="row">Letzte Meldung des Bots</th>
              <td>
                {status.heartbeatAt
                  ? `${dt.format(status.heartbeatAt)} (${ago(status.heartbeatAt, now)})`
                  : "noch nie"}
              </td>
            </tr>
            <tr>
              <th scope="row">Gestartet</th>
              <td>{status.startedAt ? dt.format(status.startedAt) : "–"}</td>
            </tr>
            <tr>
              <th scope="row">Bekannte Betrugsdomains</th>
              <td>
                {status.phishingDomains
                  ? nf.format(status.phishingDomains)
                  : "keine Listen geladen"}
              </td>
            </tr>
            <tr>
              <th scope="row">Letzte Datensicherung</th>
              <td>
                {status.lastBackupAt
                  ? `${dt.format(status.lastBackupAt)} (${ago(status.lastBackupAt, now)})${status.lastBackupBytes ? `, ${size(status.lastBackupBytes)}` : ""}`
                  : "noch keine"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Befehle auf dem Server</h2>
        <p className="muted small">
          Wenn du Libremod mit dem Install-Skript eingerichtet hast, gibt es auf
          dem Server den Befehl <code>libremod</code>:
        </p>
        <table>
          <tbody>
            {[
              ["libremod status", "Zeigt, ob alles läuft"],
              [
                "libremod update",
                "Holt die neueste Version (mit Sicherung vorher)",
              ],
              ["libremod backup", "Sichert die Datenbank sofort"],
              ["libremod logs bot", "Zeigt die Meldungen des Bots"],
              ["libremod restart", "Startet alles neu"],
            ].map(([cmd, what]) => (
              <tr key={cmd}>
                <td>
                  <code>{cmd}</code>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
