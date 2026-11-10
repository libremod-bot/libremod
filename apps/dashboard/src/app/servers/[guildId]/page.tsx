import { eq, guildSettings, warnEscalations } from "@libremod/db";
import { formatDuration } from "@libremod/shared";
import { Notice } from "@/components/Notice";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { addEscalation, removeEscalation, saveModeration } from "./actions";

const ACTION_LABELS = { timeout: "Timeout", kick: "Kick", ban: "Ban" } as const;

export default async function ModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [[settings], rules, channels] = await Promise.all([
    db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)),
    db.select().from(warnEscalations).where(eq(warnEscalations.guildId, guildId)).orderBy(warnEscalations.warnCount),
    getGuildChannels(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);

  return (
    <>
      <h1>Moderation</h1>
      <Notice saved={gespeichert} error={fehler} />

      <form className="card" action={saveModeration.bind(null, guildId)}>
        <h2>Allgemein</h2>
        <div className="field">
          <label htmlFor="modLogChannelId">Mod-Log-Kanal</label>
          <select id="modLogChannelId" name="modLogChannelId" defaultValue={settings?.modLogChannelId ?? ""}>
            <option value="">Aus</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <div className="hint">Hier landet jede Moderationsaktion, auch automatische.</div>
        </div>
        <div className="field">
          <label className="check">
            <input type="checkbox" name="dmOnAction" defaultChecked={settings?.dmOnAction ?? true} />
            Betroffene per Direktnachricht informieren
          </label>
        </div>
        <button type="submit">Speichern</button>
      </form>

      <section className="card">
        <h2>Verwarnungsstufen</h2>
        <p className="muted">Erreicht ein Mitglied eine bestimmte Anzahl aktiver Verwarnungen, greift Libremod automatisch durch.</p>
        {rules.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Verwarnungen</th>
                  <th>Aktion</th>
                  <th>Dauer</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.warnCount}>
                    <td>{r.warnCount}</td>
                    <td>{ACTION_LABELS[r.action]}</td>
                    <td>{r.durationSeconds ? formatDuration(r.durationSeconds) : r.action === "ban" ? "dauerhaft" : "–"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={removeEscalation.bind(null, guildId, r.warnCount)}>
                        <button className="danger" type="submit">
                          Entfernen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={addEscalation.bind(null, guildId)}>
          <div className="row">
            <div className="field">
              <label htmlFor="warnCount">Ab Verwarnungen</label>
              <input id="warnCount" name="warnCount" type="number" min={1} max={100} required placeholder="3" />
            </div>
            <div className="field">
              <label htmlFor="action">Aktion</label>
              <select id="action" name="action" defaultValue="timeout">
                <option value="timeout">Timeout</option>
                <option value="kick">Kick</option>
                <option value="ban">Ban</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="duration">Dauer</label>
              <input id="duration" name="duration" type="text" placeholder="z. B. 1h, 7d" />
              <div className="hint">Bei Timeout nötig, bei Ban leer = dauerhaft.</div>
            </div>
          </div>
          <button type="submit" className="secondary">
            Stufe hinzufügen
          </button>
        </form>
      </section>
    </>
  );
}
