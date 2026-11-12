import { asc, eq, scheduledMessages } from "@libremod/db";
import { describeSchedule, toSchedule, WEEKDAY_NAMES } from "@libremod/shared";
import { EmbedEditor } from "@/components/EmbedEditor";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { createScheduled, deleteScheduled, toggleScheduled } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Geplante Nachrichten") }) };
}

const when = dateFmt({ dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

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
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? t("gelöschter Kanal");

  return (
    <>
      <PageHeader
        icon="clock"
        title={t("Geplante Nachrichten")}
        description={t("Libremod postet Nachrichten regelmäßig von selbst, z. B. Erinnerungen, Regeln oder Event-Hinweise. Alle Zeiten in deutscher Zeit.")}
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
                    #{channelName(m.channelId)} · {m.enabled ? t("nächste: {n0}", { n0: when.format(m.nextRunAt) }) : "pausiert"}
                  </div>
                </div>
                {m.embed && <span className="badge info">{t("Embed")}</span>}
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
                    <Icon name="trash" size={15} /> {" "}{t("Löschen")}</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>{t("Neue geplante Nachricht")}</h2>
        </div>
        <form action={createScheduled.bind(null, guildId)}>
          <div className="field">
            <label htmlFor="channelId">{t("Kanal")}</label>
            <select id="channelId" name="channelId" required defaultValue="">
              <option value="" disabled>
                {t("Kanal wählen …")}</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="content">{t("Nachricht")}</label>
            <textarea id="content" name="content" required maxLength={2000} placeholder={t("Denkt an den Spieleabend heute um 20 Uhr!")} />
          </div>
          <label className="check-inline">
            <input type="checkbox" name="embed" />
            {t("Als Karte (Embed) posten")}</label>
          <EmbedEditor name="design" textareaId="content" toggleName="embed" defaults={{ thumbnail: "none" }} placeholders={false} />

          <div className="field">
            <label htmlFor="kind">{t("Wie oft?")}</label>
            <select id="kind" name="kind" defaultValue="daily">
              <option value="daily">{t("Täglich zu einer Uhrzeit")}</option>
              <option value="weekly">{t("Wöchentlich an einem Tag")}</option>
              <option value="interval">{t("In festen Abständen")}</option>
            </select>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="timeOfDay">{t("Uhrzeit (täglich/wöchentlich)")}</label>
              <input id="timeOfDay" name="timeOfDay" type="time" defaultValue="18:00" />
            </div>
            <div>
              <label htmlFor="weekday">{t("Wochentag (wöchentlich)")}</label>
              <select id="weekday" name="weekday" defaultValue="5">
                {WEEKDAY_NAMES.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intervalValue">{t("Abstand (feste Abstände)")}</label>
              <div className="inline-form" style={{ flexWrap: "nowrap" }}>
                <input id="intervalValue" name="intervalValue" type="number" min={1} max={1000} defaultValue={6} style={{ width: 90 }} />
                <select name="intervalUnit" defaultValue="hours" aria-label={t("Einheit")}>
                  <option value="minutes">{t("Minuten")}</option>
                  <option value="hours">{t("Stunden")}</option>
                  <option value="days">{t("Tage")}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="hint">{t("Es zählen nur die Felder, die zur gewählten Art passen. Feste Abstände mindestens 10 Minuten.")}</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">{t("Planen")}</button>
          </div>
        </form>
      </section>
    </>
  );
}
