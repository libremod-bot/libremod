import { and, count, desc, eq, eventRsvps, guildEvents, inArray, ne } from "@libremod/db";
import { DEFAULT_EVENT_MINUTES, EVENT_REMINDERS, MAX_ACTIVE_EVENTS, MAX_EVENT_DESCRIPTION, MAX_EVENT_LOCATION, MAX_EVENT_SLOTS, MAX_EVENT_TITLE } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { cancelEventRequest, createEvent, deleteEvent } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Events") }) };
}

const when = dateFmt({ dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "events");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [upcoming, past, channels, roles] = await Promise.all([
    db.select().from(guildEvents).where(and(eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open"))).orderBy(guildEvents.startsAt),
    db.select().from(guildEvents).where(and(eq(guildEvents.guildId, guildId), ne(guildEvents.state, "open"))).orderBy(desc(guildEvents.startsAt)).limit(15),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const ids = [...upcoming, ...past].map((e) => e.id);
  const counts = ids.length
    ? await db
        .select({ id: eventRsvps.eventId, status: eventRsvps.status, n: count() })
        .from(eventRsvps)
        .where(inArray(eventRsvps.eventId, ids))
        .groupBy(eventRsvps.eventId, eventRsvps.status)
    : [];
  const n = (id: number, status: string) => counts.find((c) => c.id === id && c.status === status)?.n ?? 0;
  const people = await getMembers(guildId, [...new Set([...upcoming, ...past].map((e) => e.hostId))]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? t("gelöschter Kanal");
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? t("gelöschte Rolle");
  const reminderLabel = (m: number) => t(EVENT_REMINDERS.find((r) => r.value === m)?.label) || t("{m} Minuten vorher", { m });

  return (
    <>
      <PageHeader
        icon="calendar"
        title={t("Events")}
        description={t("Spieleabende, Turniere oder Treffen planen: Mitglieder sagen per Knopf zu oder ab, Libremod führt eine Warteliste und erinnert alle Zusagen vor Beginn.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <section className="card">
        <div className="card-title">
          <Icon name="calendar" />
          <h2>{t("Geplante Events")}</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Noch nichts geplant. Lege unten ein Event an oder im Chat mit")}{" "}<code>{t("/event create")}</code>.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Event")}</th>
                  <th>{t("Beginn")}</th>
                  <th>{t("Zusagen")}</th>
                  <th>{t("Vielleicht")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.title}</strong> <span className="muted small">#{e.id}</span>
                      <div className="small muted">
                        #{channelName(e.channelId)} · {reminderLabel(e.remindMinutes)}
                        {e.roleId && t(" · Rolle @{roleId}", { roleId: roleName(e.roleId) })}
                        {e.location && ` · ${e.location}`}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.startsAt <= new Date() ? t("läuft gerade") : when.format(e.startsAt)}</td>
                    <td>
                      {n(e.id, "yes")}
                      {e.slots > 0 && ` / ${e.slots}`}
                      {n(e.id, "waitlist") > 0 && <div className="small muted">{n(e.id, "waitlist")} {" "}{t("auf der Warteliste")}</div>}
                    </td>
                    <td>{n(e.id, "maybe")}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {e.cancelRequested ? (
                        <span className="muted small">{t("wird abgesagt …")}</span>
                      ) : (
                        <form action={cancelEventRequest.bind(null, guildId, e.id)} style={{ display: "inline" }}>
                          <button className="danger small" type="submit">
                            {t("Absagen")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint">{t("Beim Absagen bekommen alle mit Zusage, „Vielleicht“ oder Wartelistenplatz eine Direktnachricht.")}</div>
      </section>

      {upcoming.length < MAX_ACTIVE_EVENTS && (
        <form action={createEvent.bind(null, guildId)} className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>{t("Neues Event")}</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="title">{t("Titel")}</label>
              <input id="title" name="title" type="text" required maxLength={MAX_EVENT_TITLE} placeholder={t("z. B. Spieleabend")} />
            </div>
            <div>
              <label htmlFor="startsAt">{t("Beginn (deutsche Zeit)")}</label>
              <input id="startsAt" name="startsAt" type="datetime-local" required />
            </div>
            <div>
              <label htmlFor="duration">{t("Dauer")}</label>
              <input id="duration" name="duration" type="text" maxLength={20} placeholder="z. B. 90m, 3h" defaultValue={`${DEFAULT_EVENT_MINUTES / 60}h`} />
            </div>
            <div>
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
            <div>
              <label htmlFor="slots">{t("Plätze")}</label>
              <input id="slots" name="slots" type="number" min={0} max={MAX_EVENT_SLOTS} defaultValue={0} />
            </div>
            <div>
              <label htmlFor="remindMinutes">{t("Erinnerung")}</label>
              <select id="remindMinutes" name="remindMinutes" defaultValue="30">
                {EVENT_REMINDERS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.label)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="location">{t("Ort (freiwillig)")}</label>
              <input id="location" name="location" type="text" maxLength={MAX_EVENT_LOCATION} placeholder={t("z. B. Sprachkanal Lobby")} />
            </div>
            <div>
              <label htmlFor="roleId">{t("Rolle für Zusagen (freiwillig)")}</label>
              <select id="roleId" name="roleId" defaultValue="">
                <option value="">{t("Keine Rolle")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="description">{t("Beschreibung (freiwillig)")}</label>
          <textarea id="description" name="description" rows={3} maxLength={MAX_EVENT_DESCRIPTION} placeholder={t("Was ist geplant, was sollte man mitbringen?")} />
          <div className="hint">
            {t("Plätze 0 bedeutet unbegrenzt. Ist das Event voll, kommen weitere Zusagen auf die Warteliste und rücken automatisch nach. Die Rolle wird nach dem Event wieder entfernt, so lässt sich zum Beispiel ein eigener Kanal nur für Teilnehmende freischalten.")}</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">
              <Icon name="calendar" size={16} /> {" "}{t("Event planen")}</button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>{t("Vergangen und abgesagt")}</h2>
        </div>
        {past.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Noch keine vergangenen Events.")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Event")}</th>
                  <th>{t("Beginn")}</th>
                  <th>{t("Zusagen")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {past.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.title}</strong> <span className="muted small">#{e.id}</span>
                      <div className="small muted">
                        {e.state === "cancelled" ? "abgesagt" : "vorbei"} {" "}{t("· von")}{" "}{name(e.hostId)}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{when.format(e.startsAt)}</td>
                    <td>{n(e.id, "yes")}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteEvent.bind(null, guildId, e.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label={t("{title} entfernen", { title: e.title })}>
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
