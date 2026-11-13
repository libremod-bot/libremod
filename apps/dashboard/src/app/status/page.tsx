import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  BACKUP_WARN_H,
  botOnline,
  getInstanceStatus,
  isInstanceOwner,
  updatePending,
  updateRunning,
  updaterOnline,
} from "@/lib/instance";
import type { InstanceStatus } from "@libremod/db";
import { isNewerVersion } from "@libremod/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Notice } from "@/components/Notice";
import { requestUpdate, saveAutoUpdate } from "./actions";
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

function UpdateCard({ status, now }: { status: InstanceStatus; now: number }) {
  const current = status.version || pkg.version;
  const newer = isNewerVersion(status.latestVersion, current);
  const pending = updatePending(status);
  const running = updateRunning(status, now);
  const updater = updaterOnline(status, now);
  const lastDone =
    status.updateFinishedAt &&
    (!status.updateStartedAt || status.updateFinishedAt >= status.updateStartedAt);

  return (
    <section className="card" style={{ marginBottom: "1rem" }} id="updates">
      <h2>{t("Updates")}</h2>

      {(pending || running) && <AutoRefresh seconds={5} />}
      {pending && (
        <div className="toast" role="status" style={{ display: "block" }}>
          {updater
            ? t("Update angefordert. Der Server beginnt innerhalb einer Minute damit.")
            : t("Update angefordert, aber der Update-Dienst auf dem Server meldet sich gerade nicht.")}
        </div>
      )}
      {running && (
        <div className="toast" role="status" style={{ display: "block" }}>
          {t("Das Update läuft seit {n0}. Bot und Dashboard sind dabei kurz nicht erreichbar, diese Seite lädt sich von selbst neu.", { n0: ago(status.updateStartedAt!, now) })}
        </div>
      )}

      {newer ? (
        <p>
          <span className="badge on">{t("Neu")}</span>{" "}
          {t("Version {latest} ist erschienen, installiert ist {current}.", { latest: status.latestVersion, current })}{" "}
          {status.latestUrl && (
            <a href={status.latestUrl} target="_blank" rel="noreferrer">
              {t("Was ist neu?")}
            </a>
          )}
        </p>
      ) : (
        <p>
          {status.latestCheckedAt
            ? t("Libremod ist auf dem neuesten Stand (Version {current}). Zuletzt geprüft {n0}.", { current, n0: ago(status.latestCheckedAt, now) })
            : t("Installiert ist Version {current}. Ob es eine neuere gibt, prüft der Bot einmal am Tag.", { current })}
        </p>
      )}

      {!pending && !running && (newer || updater) && (
        updater ? (
          <form action={requestUpdate} style={{ marginBottom: "1rem" }}>
            <button type="submit" className={newer ? undefined : "secondary"}>
              {newer
                ? t("Jetzt auf {latest} aktualisieren", { latest: status.latestVersion })
                : t("Neu herunterladen und neu starten")}
            </button>
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              {t("Vorher wird automatisch gesichert. Bot und Dashboard sind dabei 1 bis 2 Minuten nicht erreichbar.")}
            </p>
          </form>
        ) : (
          <p className="muted small">
            {t("Auf dem Server aktualisierst du mit")}{" "}<code>{t("libremod update")}</code>.{" "}
            {t("Danach geht es auch hier per Knopfdruck.")}
          </p>
        )
      )}

      {lastDone && (
        <details style={{ marginBottom: "1rem" }}>
          <summary>
            {status.updateOk
              ? t("Letztes Update {n0} erfolgreich", { n0: ago(status.updateFinishedAt!, now) })
              : t("Letztes Update {n0} fehlgeschlagen", { n0: ago(status.updateFinishedAt!, now) })}
            {status.updateSource === "auto" ? t(" (automatisch)") : ""}
          </summary>
          {status.updateLog ? (
            <pre className="small" style={{ whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: "20rem" }}>
              {status.updateLog}
            </pre>
          ) : (
            <p className="muted small">{t("Keine Ausgabe.")}</p>
          )}
        </details>
      )}

      {updater ? (
        <form action={saveAutoUpdate} className="inline-form" style={{ alignItems: "center" }}>
          <label htmlFor="auto-hours">{t("Automatisch aktualisieren")}</label>
          <select id="auto-hours" name="hours" defaultValue={String(Math.max(0, status.autoUpdateHours))} style={{ maxWidth: "14rem" }}>
            <option value="0">{t("Aus")}</option>
            <option value="24">{t("Alle 24 Stunden")}</option>
            <option value="48">{t("Alle 48 Stunden")}</option>
          </select>
          <button type="submit" className="secondary">{t("Speichern")}</button>
        </form>
      ) : null}
      <p className="muted small" style={{ marginTop: "0.5rem" }}>
        {updater
          ? t("Automatische Updates laufen nachts zwischen 4 und 5 Uhr (Zeit des Servers), nur wenn es eine neue Version gibt, und immer mit Sicherung vorher.")
          : t("Für Updates per Knopfdruck und automatische Updates braucht es den Update-Dienst des Install-Skripts. Er wird bei der Installation und bei jedem „libremod update“ eingerichtet.")}{" "}
        {status.systemUpdates
          ? t("Sicherheitsupdates für System und Docker installiert der Server selbst.")
          : updater
            ? t("Sicherheitsupdates für System und Docker installiert der Server nicht automatisch (einschalten mit „libremod autoupdate system an“).")
            : ""}
      </p>
    </section>
  );
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const query = await searchParams;
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

      <Notice saved={query.gespeichert} error={query.fehler} />

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

      <UpdateCard status={status} now={now} />

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
              [t("libremod autoupdate"), t("Automatische Updates ein- oder ausschalten")],
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
