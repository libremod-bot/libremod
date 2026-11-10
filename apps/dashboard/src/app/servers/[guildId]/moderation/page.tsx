import { eq, guildSettings, warnEscalations } from "@libremod/db";
import { formatDuration } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { addEscalation, removeEscalation, saveModeration } from "../actions";

export const metadata = { title: "Moderation · Libremod" };

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
      <PageHeader
        icon="gavel"
        title="Moderation"
        description="Wohin Strafen protokolliert werden und was nach mehreren Verwarnungen automatisch passiert."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form className="card" action={saveModeration.bind(null, guildId)}>
        <div className="card-title">
          <Icon name="log" />
          <h2>Mod-Log und Benachrichtigungen</h2>
        </div>
        <p className="card-sub">Jede Aktion von Moderatoren und der Auto-Mod landet mit Fallnummer im Mod-Log.</p>
        <div className="field">
          <label htmlFor="modLogChannelId">Mod-Log-Kanal</label>
          <select id="modLogChannelId" name="modLogChannelId" defaultValue={settings?.modLogChannelId ?? ""}>
            <option value="">Kein Mod-Log</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <div className="hint">Tipp: Ein Kanal, den nur dein Team sehen kann, z. B. #mod-log.</div>
        </div>
        <div className="divider" />
        <Switch
          name="dmOnAction"
          defaultChecked={settings?.dmOnAction ?? true}
          label="Betroffene per Direktnachricht informieren"
          description="Bei Verwarnung, Timeout, Kick und Ban bekommt die Person den Grund geschickt."
        />
        <div className="divider" />
        <button type="submit">Speichern</button>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="steps" />
          <h2>Verwarnungsstufen</h2>
        </div>
        <p className="card-sub">
          Erreicht ein Mitglied eine bestimmte Anzahl aktiver Verwarnungen, greift Libremod automatisch durch. Beispiel: ab 3
          Verwarnungen 1 Stunde Timeout, ab 5 Ban.
        </p>

        {rules.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Ab Verwarnungen</th>
                  <th>Aktion</th>
                  <th>Dauer</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.warnCount}>
                    <td>
                      <strong>{r.warnCount}</strong>
                    </td>
                    <td>
                      <span className={`badge ${r.action === "ban" ? "danger" : "warn"}`}>{ACTION_LABELS[r.action]}</span>
                    </td>
                    <td>{r.durationSeconds ? formatDuration(r.durationSeconds) : r.action === "ban" ? "dauerhaft" : "–"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={removeEscalation.bind(null, guildId, r.warnCount)}>
                        <button className="danger small" type="submit">
                          Entfernen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch keine Stufen. Verwarnungen haben dann keine automatischen Folgen.
          </p>
        )}

        <form action={addEscalation.bind(null, guildId)}>
          <div className="grid-3">
            <div>
              <label htmlFor="warnCount">Ab Verwarnungen</label>
              <input id="warnCount" name="warnCount" type="number" min={1} max={100} required placeholder="3" />
            </div>
            <div>
              <label htmlFor="action">Aktion</label>
              <select id="action" name="action" defaultValue="timeout">
                <option value="timeout">Timeout</option>
                <option value="kick">Kick</option>
                <option value="ban">Ban</option>
              </select>
            </div>
            <div>
              <label htmlFor="duration">Dauer</label>
              <input id="duration" name="duration" type="text" placeholder="z. B. 1h oder 7d" />
            </div>
          </div>
          <div className="hint">Timeout braucht eine Dauer (höchstens 28 Tage). Bei Ban bedeutet leer: dauerhaft.</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> Stufe hinzufügen
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
