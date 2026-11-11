import { autoPurgeChannels, autoSlowmodeChannels, eq, highlightSettings } from "@libremod/db";
import { formatSeconds, PURGE_INTERVALS, purgeIntervalLabel, SLOWMODE_STEPS } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { createPurge, createSlowmode, deletePurge, deleteSlowmode, saveHighlights } from "../actions";

export const metadata = { title: "Highlights & Kanal-Pflege · Libremod" };

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function ToolsPage({
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
  const [[hl], purges, slows, channels] = await Promise.all([
    db.select().from(highlightSettings).where(eq(highlightSettings.guildId, guildId)),
    db.select().from(autoPurgeChannels).where(eq(autoPurgeChannels.guildId, guildId)),
    db.select().from(autoSlowmodeChannels).where(eq(autoSlowmodeChannels.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";
  const emoji = hl?.emoji ?? "⭐";
  const customEmoji = /^\d+$/.test(emoji);
  const channelOptions = (
    <>
      <option value="" disabled>
        Kanal wählen …
      </option>
      {textChannels.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
    </>
  );

  return (
    <>
      <PageHeader
        icon="sparkle"
        title="Highlights & Kanal-Pflege"
        description="Beliebte Nachrichten in einem eigenen Kanal sammeln, Kanäle regelmäßig aufräumen und den Langsam-Modus an die Aktivität anpassen."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveHighlights.bind(null, guildId)} className="card">
        <div className="card-title">
          <Icon name="sparkle" />
          <h2>Highlight-Kanal</h2>
        </div>
        <Switch
          name="enabled"
          defaultChecked={hl?.enabled ?? false}
          label="Highlights sammeln"
          description="Bekommt eine Nachricht genug Reaktionen mit dem gewählten Emoji, postet Libremod sie mit Link im Highlight-Kanal."
        />
        <div className="grid-3" style={{ marginTop: "1rem" }}>
          <div>
            <label htmlFor="channelId">Highlight-Kanal</label>
            <select id="channelId" name="channelId" defaultValue={hl?.channelId ?? ""}>
              {channelOptions}
            </select>
          </div>
          <div>
            <label htmlFor="emoji">Emoji</label>
            <div className="inline-form" style={{ flexWrap: "nowrap" }}>
              {customEmoji && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`https://cdn.discordapp.com/emojis/${emoji}.webp?size=48`} alt="" width={28} height={28} />
              )}
              <input id="emoji" name="emoji" type="text" maxLength={80} defaultValue={customEmoji ? `<:emoji:${emoji}>` : emoji} />
            </div>
          </div>
          <div>
            <label htmlFor="threshold">Ab so vielen Reaktionen</label>
            <input id="threshold" name="threshold" type="number" min={1} max={100} defaultValue={hl?.threshold ?? 5} />
          </div>
        </div>
        <div className="hint">
          Ein Server-Emoji gibst du in Discord mit vorangestelltem Backslash ein (<code>\:name:</code>), das Ergebnis wie{" "}
          <code>&lt;:name:123…&gt;</code> kopierst du hierher.
        </div>
        <div className="grid-2" style={{ marginTop: ".75rem" }}>
          <label className="check-inline">
            <input type="checkbox" name="countSelf" defaultChecked={hl?.countSelf ?? false} />
            Eigene Reaktion des Verfassers zählt mit
          </label>
          <label className="check-inline">
            <input type="checkbox" name="allowNsfw" defaultChecked={hl?.allowNsfw ?? false} />
            Auch Nachrichten aus NSFW-Kanälen
          </label>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="broom" />
          <h2>Kanäle automatisch leeren</h2>
        </div>
        <p className="card-sub">
          Praktisch für Bot-, Meme- oder Sammelkanäle. Discord erlaubt das gesammelte Löschen nur für Nachrichten, die jünger als 14 Tage sind;
          ältere bleiben stehen.
        </p>
        {purges.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Kanal</th>
                  <th>Wie oft</th>
                  <th>Nächstes Mal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {purges.map((p) => (
                  <tr key={p.channelId}>
                    <td>
                      #{channelName(p.channelId)}
                      {p.keepPinned && <span className="muted small"> · Angepinnte bleiben</span>}
                    </td>
                    <td>{purgeIntervalLabel(p.intervalHours)}</td>
                    <td className="small">
                      {when.format(p.nextRunAt)}
                      {p.lastDeleted !== null && <div className="muted">zuletzt {p.lastDeleted} gelöscht</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deletePurge.bind(null, guildId, p.channelId)}>
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
        )}
        <form action={createPurge.bind(null, guildId)}>
          <div className="grid-3">
            <div>
              <label htmlFor="purgeChannelId">Kanal</label>
              <select id="purgeChannelId" name="purgeChannelId" required defaultValue="">
                {channelOptions}
              </select>
            </div>
            <div>
              <label htmlFor="intervalHours">Wie oft</label>
              <select id="intervalHours" name="intervalHours" defaultValue="24">
                {PURGE_INTERVALS.map((i) => (
                  <option key={i.hours} value={i.hours}>
                    {i.label[0]!.toUpperCase() + i.label.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <label className="check-inline" style={{ alignSelf: "end" }}>
              <input type="checkbox" name="keepPinned" defaultChecked />
              Angepinnte behalten
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> Kanal hinzufügen
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="gauge" />
          <h2>Automatischer Langsam-Modus</h2>
        </div>
        <p className="card-sub">
          Libremod prüft jede Minute, wie viel los ist. Ab der Schwelle wird der Langsam-Modus eingeschaltet, bei doppelt so viel Aktivität eine Stufe
          strenger. Wird es ruhiger, geht es Stufe für Stufe zurück.
        </p>
        {slows.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Kanal</th>
                  <th>Ab</th>
                  <th>Bereich</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slows.map((s) => (
                  <tr key={s.channelId}>
                    <td>#{channelName(s.channelId)}</td>
                    <td>{s.messagesPerMinute} Nachrichten/Min.</td>
                    <td>
                      {formatSeconds(s.minSeconds)} bis {formatSeconds(s.maxSeconds)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteSlowmode.bind(null, guildId, s.channelId)}>
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
        )}
        <form action={createSlowmode.bind(null, guildId)}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="slowChannelId">Kanal</label>
              <select id="slowChannelId" name="slowChannelId" required defaultValue="">
                {channelOptions}
              </select>
            </div>
            <div className="field">
              <label htmlFor="messagesPerMinute">Ab Nachrichten pro Minute</label>
              <input id="messagesPerMinute" name="messagesPerMinute" type="number" min={2} max={1000} defaultValue={20} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="minSeconds">Mindestens</label>
              <select id="minSeconds" name="minSeconds" defaultValue="0">
                {SLOWMODE_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {formatSeconds(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="maxSeconds">Höchstens</label>
              <select id="maxSeconds" name="maxSeconds" defaultValue="30">
                {SLOWMODE_STEPS.filter((s) => s > 0).map((s) => (
                  <option key={s} value={s}>
                    {formatSeconds(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> Kanal hinzufügen
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
