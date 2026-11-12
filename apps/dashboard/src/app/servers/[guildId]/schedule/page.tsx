import { asc, eq, scheduledMessages } from "@libremod/db";
import { describeSchedule, toSchedule, WEEKDAY_NAMES } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { createScheduled, deleteScheduled, toggleScheduled } from "../actions";

export const metadata = { title: "Geplante Nachrichten · Libremod" };

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "schedule");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [items, channels] = await Promise.all([
    db.select().from(scheduledMessages).where(eq(scheduledMessages.guildId, guildId)).orderBy(asc(scheduledMessages.nextRunAt)),
    getGuildChannels(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";

  return (
    <>
      <PageHeader
        icon="clock"
        title="Geplante Nachrichten"
        description="Libremod postet Nachrichten regelmäßig von selbst, z. B. Erinnerungen, Regeln oder Event-Hinweise. Alle Zeiten in deutscher Zeit."
      />
      <Notice saved={gespeichert} error={fehler} />

      {items.length > 0 && (
        <div className="filters">
          {items.map((m) => (
            <div className="card" key={m.id} style={m.enabled ? undefined : { opacity: 0.65 }}>
              <div className="filter-head">
                <div className="module-icon">
                  <Icon name="clock" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{describeSchedule(toSchedule(m))}</h3>
                  <div className="small muted">
                    #{channelName(m.channelId)} · {m.enabled ? `nächste: ${when.format(m.nextRunAt)}` : "pausiert"}
                  </div>
                </div>
                {m.embed && <span className="badge info">Embed</span>}
              </div>
              <p className="preview">{m.embedTitle ? <strong>{m.embedTitle}: </strong> : null}{m.content}</p>
              <div className="panel-actions">
                <form action={toggleScheduled.bind(null, guildId, m.id)}>
                  <button className="secondary small" type="submit">
                    {m.enabled ? "Pausieren" : "Fortsetzen"}
                  </button>
                </form>
                <form action={deleteScheduled.bind(null, guildId, m.id)} style={{ marginLeft: "auto" }}>
                  <button className="danger small" type="submit">
                    <Icon name="trash" size={15} /> Löschen
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>Neue geplante Nachricht</h2>
        </div>
        <form action={createScheduled.bind(null, guildId)}>
          <div className="field">
            <label htmlFor="channelId">Kanal</label>
            <select id="channelId" name="channelId" required defaultValue="">
              <option value="" disabled>
                Kanal wählen …
              </option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="content">Nachricht</label>
            <textarea id="content" name="content" required maxLength={2000} placeholder="Denkt an den Spieleabend heute um 20 Uhr!" />
          </div>
          <div className="grid-2">
            <label className="check-inline">
              <input type="checkbox" name="embed" />
              Als Embed (Karte) posten
            </label>
            <div className="field">
              <label htmlFor="embedTitle">Embed-Überschrift</label>
              <input id="embedTitle" name="embedTitle" type="text" maxLength={256} placeholder="optional" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="kind">Wie oft?</label>
            <select id="kind" name="kind" defaultValue="daily">
              <option value="daily">Täglich zu einer Uhrzeit</option>
              <option value="weekly">Wöchentlich an einem Tag</option>
              <option value="interval">In festen Abständen</option>
            </select>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="timeOfDay">Uhrzeit (täglich/wöchentlich)</label>
              <input id="timeOfDay" name="timeOfDay" type="time" defaultValue="18:00" />
            </div>
            <div>
              <label htmlFor="weekday">Wochentag (wöchentlich)</label>
              <select id="weekday" name="weekday" defaultValue="5">
                {WEEKDAY_NAMES.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intervalValue">Abstand (feste Abstände)</label>
              <div className="inline-form" style={{ flexWrap: "nowrap" }}>
                <input id="intervalValue" name="intervalValue" type="number" min={1} max={1000} defaultValue={6} style={{ width: 90 }} />
                <select name="intervalUnit" defaultValue="hours" aria-label="Einheit">
                  <option value="minutes">Minuten</option>
                  <option value="hours">Stunden</option>
                  <option value="days">Tage</option>
                </select>
              </div>
            </div>
          </div>
          <div className="hint">Es zählen nur die Felder, die zur gewählten Art passen. Feste Abstände mindestens 10 Minuten.</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Planen</button>
          </div>
        </form>
      </section>
    </>
  );
}
