import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { importSettingsFile } from "../actions";

export const metadata = { title: "Export & Import · Libremod" };

export default async function BackupPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ fehler?: string; importiert?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "backup");
  const { fehler, importiert } = await searchParams;

  return (
    <>
      <PageHeader
        icon="server"
        title="Export & Import"
        description="Alle Einstellungen als Datei sichern und später wiederherstellen oder auf einen anderen Server übertragen."
      />
      <Notice error={fehler} />
      {importiert && (
        <div className="toast" role="status">
          Import fertig: {importiert}
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="arrow" />
          <h2>Exportieren</h2>
        </div>
        <p>
          Lädt alle Einstellungen dieses Servers als JSON-Datei herunter: Moderation, Auto-Mod, Logging, Begrüßung, Rollen, Level, Tickets,
          Währung und Shop, Benachrichtigungen, eigene Befehle, Team-Zugänge und alles Weitere.
        </p>
        <p className="small muted">
          Nicht enthalten sind Daten von Mitgliedern wie XP, Kontostände, Fälle, Tickets, Zitate oder Geburtstage.
        </p>
        <a className="button" href={`/servers/${guildId}/backup/export`} download>
          <Icon name="file" size={16} /> Einstellungen herunterladen
        </a>
      </section>

      <form action={importSettingsFile.bind(null, guildId)} className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>Importieren</h2>
        </div>
        <label htmlFor="file">Einstellungsdatei (.json)</label>
        <input id="file" name="file" type="file" accept="application/json,.json" required />
        <div className="hint">
          Die bisherigen Einstellungen dieses Servers werden ersetzt. Stammt die Datei von einem anderen Server, entfernt Libremod Kanäle und
          Rollen, die es hier nicht gibt. Rollen-Auswahlen, Ticket-Panels und die Verifizierungs-Nachricht musst du danach neu posten. Fallnummern,
          Zählerstände und Saisons bleiben, wie sie sind.
        </div>
        <label className="check-inline" style={{ marginTop: "0.75rem" }}>
          <input type="checkbox" name="confirm" required /> Ja, die aktuellen Einstellungen ersetzen
        </label>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit" className="danger">
            Einstellungen importieren
          </button>
        </div>
      </form>
    </>
  );
}
