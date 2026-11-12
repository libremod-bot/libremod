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
import { t, dateFmt, numFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Status") }) };
}
export const dynamic = "force-dynamic";

const nf = numFmt();
const dt = dateFmt({
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

function ago(date: Date, now: number) {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 90) return t("vor {s} Sekunden", { s });
  const m = Math.round(s / 60);
  if (m < 90) return t("vor {m} Minuten", { m });
  const h = Math.round(m / 60);
  if (h < 36) return t("vor {h} Stunden", { h });
  return t("vor {n0} Tagen", { n0: Math.round(h / 24) });
}

function duration(ms: number) {
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return t("{d} {n1}, {h} Std.", { d, n1: d === 1 ? "Tag" : "Tagen", h });
  if (h) return t("{h} Std., {n1} Min.", { h, n1: m % 60 });
  return t("{m} Min.", { m });
}

function size(bytes: number) {
  if (bytes < 1024 * 1024)
    return t("{n0} KB", { n0: nf.format(Math.max(1, Math.round(bytes / 1024))) });
  return t("{n0} MB", { n0: numFmt({ maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) });
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
          title={t("Status")}
          description={t("Zustand dieser Libremod-Installation.")}
        />
        <div className="toast warn-box" role="status">
          {t("Der Bot hat sich noch nicht gemeldet. Läuft er? Auf dem Server zeigt")}{" "}
          <code>{t("libremod status")}</code> {" "}{t("den Zustand und")}{" "}
          <code>{t("libremod logs bot")}</code> {" "}{t("die Meldungen.")}</div>
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
          {t("← Deine Server")}</Link>
      </p>
      <PageHeader
        icon="gauge"
        title={t("Status")}
        description={t("Zustand dieser Libremod-Installation. Nur die Besitzer der Bot-Anwendung im Discord Developer Portal sehen diese Seite.")}
      />

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        {!online && (
          <div
            className="toast error"
            role="alert"
            style={{ display: "block", fontWeight: 500 }}
          >
            {t("Der Bot ist offline")}{status.heartbeatAt
              ? t(" (letzte Meldung {n0})", { n0: ago(status.heartbeatAt, now) })
              : ""}
            {t(". Auf dem Server zeigt")}{" "}<code>{t("libremod logs bot")}</code>{t(", was los ist.")}{" "}
            <code>{t("libremod restart")}</code> {" "}{t("startet ihn neu.")}</div>
        )}
        {versionMismatch && (
          <div className="toast warn-box" role="status">
            {t("Bot (")}{status.version}{t(") und Dashboard (")}{dashboardVersion}{t(") haben unterschiedliche Versionen.")}{" "}<code>{t("libremod update")}</code> {" "}{t("bringt beide auf den neuesten Stand.")}</div>
        )}
        {(backupAge === null || backupAge > BACKUP_WARN_H) && (
          <div className="toast warn-box" role="status">
            {backupAge === null
              ? t("Es gibt noch keine Datensicherung.")
              : t("Die letzte Datensicherung ist {n0} gelaufen.", { n0: ago(status.lastBackupAt!, now) })}{" "}
            {t("Die Installation mit dem Install-Skript sichert jede Nacht automatisch, von Hand geht es mit")}{" "}<code>{t("libremod backup")}</code>.
          </div>
        )}
      </div>

      <div className="stats stats-4" style={{ marginBottom: "1rem" }}>
        <div className="card stat">
          <div className="stat-label">{t("Bot")}</div>
          <div className="stat-value">
            <span className={online ? "badge on" : "badge danger"}>
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Läuft seit")}</div>
          <div className="stat-value">
            {online && status.startedAt
              ? duration(now - status.startedAt.getTime())
              : "–"}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Server")}</div>
          <div className="stat-value">{nf.format(status.guilds)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Ping zu Discord")}</div>
          <div className="stat-value">
            {online && status.pingMs ? t("{n0} ms", { n0: nf.format(status.pingMs) }) : "–"}
          </div>
        </div>
      </div>

      <section className="card">
        <h2>{t("Details")}</h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">{t("Version Bot")}</th>
              <td>{status.version || "unbekannt"}</td>
            </tr>
            <tr>
              <th scope="row">{t("Version Dashboard")}</th>
              <td>{dashboardVersion}</td>
            </tr>
            <tr>
              <th scope="row">{t("Letzte Meldung des Bots")}</th>
              <td>
                {status.heartbeatAt
                  ? `${dt.format(status.heartbeatAt)} (${ago(status.heartbeatAt, now)})`
                  : t("noch nie")}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("Gestartet")}</th>
              <td>{status.startedAt ? dt.format(status.startedAt) : "–"}</td>
            </tr>
            <tr>
              <th scope="row">{t("Bekannte Betrugsdomains")}</th>
              <td>
                {status.phishingDomains
                  ? nf.format(status.phishingDomains)
                  : t("keine Listen geladen")}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("Letzte Datensicherung")}</th>
              <td>
                {status.lastBackupAt
                  ? `${dt.format(status.lastBackupAt)} (${ago(status.lastBackupAt, now)})${status.lastBackupBytes ? `, ${size(status.lastBackupBytes)}` : ""}`
                  : t("noch keine")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("Befehle auf dem Server")}</h2>
        <p className="muted small">
          {t("Wenn du Libremod mit dem Install-Skript eingerichtet hast, gibt es auf dem Server den Befehl")}{" "}<code>{t("libremod")}</code>:
        </p>
        <table>
          <tbody>
            {[
              [t("libremod status"), t("Zeigt, ob alles läuft")],
              [
                t("libremod update"),
                t("Holt die neueste Version (mit Sicherung vorher)"),
              ],
              [t("libremod backup"), t("Sichert die Datenbank sofort")],
              [t("libremod logs bot"), t("Zeigt die Meldungen des Bots")],
              [t("libremod restart"), t("Startet alles neu")],
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
