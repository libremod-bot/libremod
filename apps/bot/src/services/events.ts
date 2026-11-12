import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type Client,
  type Guild,
} from "discord.js";
import {
  and,
  asc,
  eq,
  eventRsvps,
  guildEvents,
  gt,
  lte,
  ne,
  sql,
  type Db,
  type GuildEvent,
} from "@libremod/db";
import {
  RSVP_REPLY,
  buildEventMessage,
  eventReminderText,
  parseEventCustomId,
  rsvpStatus,
  type EventRsvps,
  type RsvpChoice,
} from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";
import { inGuildLocale } from "../i18n.js";

export const isEventInteraction = (customId: string) =>
  customId.startsWith("lmev:");

const isGone = (err: unknown) =>
  err instanceof DiscordAPIError &&
  [
    RESTJSONErrorCodes.UnknownMessage,
    RESTJSONErrorCodes.UnknownChannel,
    RESTJSONErrorCodes.MissingAccess,
  ].includes(err.code as number);

export const eventLink = (
  e: Pick<GuildEvent, "guildId" | "channelId" | "messageId">,
) =>
  e.messageId
    ? `https://discord.com/channels/${e.guildId}/${e.channelId}/${e.messageId}`
    : null;

export async function loadRsvps(db: Db, eventId: number): Promise<EventRsvps> {
  const rows = await db
    .select({ userId: eventRsvps.userId, status: eventRsvps.status })
    .from(eventRsvps)
    .where(eq(eventRsvps.eventId, eventId))
    .orderBy(asc(eventRsvps.updatedAt));
  const r: EventRsvps = { yes: [], maybe: [], no: [], waitlist: [] };
  for (const row of rows) r[row.status].push(row.userId);
  return r;
}

export async function eventMessage(db: Db, e: GuildEvent) {
  return buildEventMessage(e, await loadRsvps(db, e.id));
}

async function refreshMessage(client: Client, db: Db, e: GuildEvent) {
  if (!e.messageId) return;
  const body = await eventMessage(db, e);
  await client.rest
    .patch(`/channels/${e.channelId}/messages/${e.messageId}`, { body })
    .catch((err) => {
      if (!isGone(err))
        logger.warn({ err, event: e.id }, "Event-Nachricht nicht aktualisiert");
    });
}

// Viele Klicks kurz hintereinander lösen nur eine Bearbeitung aus.
const pendingRefresh = new Map<number, NodeJS.Timeout>();
function scheduleRefresh(client: Client, db: Db, id: number, delay = 3000) {
  if (pendingRefresh.has(id)) return;
  pendingRefresh.set(
    id,
    setTimeout(() => {
      pendingRefresh.delete(id);
      void db
        .select()
        .from(guildEvents)
        .where(eq(guildEvents.id, id))
        .then(([e]) => (e ? refreshMessage(client, db, e) : undefined))
        .catch((err) =>
          logger.warn({ err, event: id }, "Event-Nachricht nicht aktualisiert"),
        );
    }, delay),
  );
}

export interface NewEvent {
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  slots?: number;
  hostId: string;
  roleId?: string | null;
  remindMinutes?: number;
}

/** Legt ein Event an und postet die Nachricht. Schlägt das Posten fehl, wird es wieder gelöscht. */
export async function createEvent(client: Client, db: Db, input: NewEvent) {
  const [e] = await db
    .insert(guildEvents)
    .values({
      ...input,
      description: input.description ?? "",
      location: input.location ?? "",
      slots: input.slots ?? 0,
      remindMinutes: input.remindMinutes ?? 30,
    })
    .returning();
  try {
    const msg = (await client.rest.post(`/channels/${e!.channelId}/messages`, {
      body: buildEventMessage(e!, { yes: [], maybe: [], no: [], waitlist: [] }),
    })) as {
      id: string;
    };
    const [saved] = await db
      .update(guildEvents)
      .set({ messageId: msg.id })
      .where(eq(guildEvents.id, e!.id))
      .returning();
    return saved!;
  } catch (err) {
    await db.delete(guildEvents).where(eq(guildEvents.id, e!.id));
    throw err;
  }
}

/**
 * Setzt die Antwort einer Person. Wird ein Platz frei, rückt die am längsten Wartende nach.
 * Alles in einer Transaktion mit gesperrter Event-Zeile, damit volle Events nicht überbucht werden.
 */
export async function setRsvp(
  db: Db,
  eventId: number,
  userId: string,
  choice: RsvpChoice | "remove",
) {
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(guildEvents)
      .where(eq(guildEvents.id, eventId))
      .for("update");
    if (!e) return null;
    const [before] = await tx
      .select()
      .from(eventRsvps)
      .where(
        and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)),
      );
    const previous = before?.status ?? null;

    let status: (typeof eventRsvps.$inferSelect)["status"] | null = null;
    if (choice === "remove") {
      if (before)
        await tx
          .delete(eventRsvps)
          .where(
            and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)),
          );
    } else if (
      choice === "yes" &&
      (previous === "yes" || previous === "waitlist")
    ) {
      status = previous; // nochmal gedrückt: Platz in der Reihe bleibt
    } else {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(eventRsvps)
        .where(
          and(
            eq(eventRsvps.eventId, eventId),
            eq(eventRsvps.status, "yes"),
            ne(eventRsvps.userId, userId),
          ),
        );
      status = rsvpStatus(choice, n, e.slots);
      await tx
        .insert(eventRsvps)
        .values({ eventId, userId, status })
        .onConflictDoUpdate({
          target: [eventRsvps.eventId, eventRsvps.userId],
          set: { status, updatedAt: new Date() },
        });
    }

    let promoted: string | null = null;
    if (previous === "yes" && status !== "yes" && e.slots > 0) {
      const [next] = await tx
        .select({ userId: eventRsvps.userId })
        .from(eventRsvps)
        .where(
          and(
            eq(eventRsvps.eventId, eventId),
            eq(eventRsvps.status, "waitlist"),
          ),
        )
        .orderBy(asc(eventRsvps.updatedAt))
        .limit(1);
      if (next) {
        await tx
          .update(eventRsvps)
          .set({ status: "yes" })
          .where(
            and(
              eq(eventRsvps.eventId, eventId),
              eq(eventRsvps.userId, next.userId),
            ),
          );
        promoted = next.userId;
      }
    }
    return { event: e, previous, status, promoted };
  });
}

async function setRole(
  guild: Guild,
  roleId: string | null,
  userId: string,
  give: boolean,
  reason: string,
) {
  if (!roleId) return;
  const role = guild.roles.cache.get(roleId);
  if (!role || !role.editable) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await (
    give ? member.roles.add(role, reason) : member.roles.remove(role, reason)
  ).catch((err) =>
    logger.warn(
      { err, guildId: guild.id, roleId },
      "Event-Rolle nicht geändert",
    ),
  );
}

export async function handleEventButton(
  interaction: ButtonInteraction,
  db: Db,
) {
  const parsed = parseEventCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return;
  const reply = (content: string) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  const [e] = await db
    .select()
    .from(guildEvents)
    .where(
      and(
        eq(guildEvents.id, parsed.id),
        eq(guildEvents.guildId, interaction.guildId),
      ),
    );
  if (!e) return void (await reply(t("Dieses Event gibt es nicht mehr.")));
  if (e.state === "cancelled" || e.cancelRequested)
    return void (await reply(t("Dieses Event wurde abgesagt.")));
  if (e.state === "done" || e.endsAt <= new Date())
    return void (await reply(t("Dieses Event ist schon vorbei.")));

  const result = await setRsvp(db, e.id, interaction.user.id, parsed.choice);
  if (!result) return void (await reply(t("Dieses Event gibt es nicht mehr.")));
  await reply(t(RSVP_REPLY[result.status!]));

  const reason = t("Event #{id}", { id: e.id });
  if (result.status === "yes" && result.previous !== "yes")
    await setRole(
      interaction.guild,
      e.roleId,
      interaction.user.id,
      true,
      reason,
    );
  if (result.previous === "yes" && result.status !== "yes")
    await setRole(
      interaction.guild,
      e.roleId,
      interaction.user.id,
      false,
      reason,
    );
  if (result.promoted)
    await welcomeFromWaitlist(
      interaction.client,
      interaction.guild,
      e,
      result.promoted,
    );
  if (result.previous !== result.status)
    scheduleRefresh(interaction.client, db, e.id);
}

async function welcomeFromWaitlist(
  client: Client,
  guild: Guild,
  e: GuildEvent,
  userId: string,
) {
  await setRole(
    guild,
    e.roleId,
    userId,
    true,
    t("Event #{id}: von der Warteliste nachgerückt", { id: e.id }),
  );
  const user = await client.users.fetch(userId).catch(() => null);
  const link = eventLink(e);
  await user
    ?.send(
      t(
        "🎉 Ein Platz ist frei geworden: Du bist jetzt bei **{title}** auf **{name}** dabei.{n2}",
        { title: e.title, name: guild.name, n2: link ? `\n${link}` : "" },
      ),
    )
    .catch(() => {});
}

/** Sagt ein Event ab: Nachricht anpassen, Rollen entfernen, Zusagen per DM informieren. */
export async function cancelEvent(client: Client, db: Db, id: number) {
  const [e] = await db
    .update(guildEvents)
    .set({ state: "cancelled" })
    .where(and(eq(guildEvents.id, id), eq(guildEvents.state, "open")))
    .returning();
  if (!e) return null;
  await refreshMessage(client, db, e);
  const r = await loadRsvps(db, e.id);
  const guild = client.guilds.cache.get(e.guildId);
  if (guild) {
    for (const userId of r.yes)
      await setRole(
        guild,
        e.roleId,
        userId,
        false,
        t("Event #{id} abgesagt", { id: e.id }),
      );
    for (const userId of [...r.yes, ...r.maybe, ...r.waitlist]) {
      const user = await client.users.fetch(userId).catch(() => null);
      await user
        ?.send(
          t(
            "❌ Das Event **{title}** auf **{name}** <t:{n2}:F> wurde abgesagt.",
            {
              title: e.title,
              name: guild.name,
              n2: Math.floor(e.startsAt.getTime() / 1000),
            },
          ),
        )
        .catch(() => {});
    }
  }
  return e;
}

/** Erinnert alle Zusagen per DM. Wer keine DMs annimmt, wird einmal im Event-Kanal erwähnt. */
export async function runEventReminders(
  client: Client,
  db: Db,
  now = new Date(),
) {
  const due = await db
    .select({ id: guildEvents.id, guildId: guildEvents.guildId })
    .from(guildEvents)
    .where(
      and(
        eq(guildEvents.state, "open"),
        eq(guildEvents.reminded, false),
        gt(guildEvents.remindMinutes, 0),
        gt(guildEvents.startsAt, now),
        sql`${guildEvents.startsAt} - make_interval(mins => ${guildEvents.remindMinutes}) <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(10);
  for (const { id, guildId } of due) {
    await inGuildLocale(guildId, async () => {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      // Erst markieren, dann senden: lieber einmal verpasst als doppelt.
      const [e] = await db
        .update(guildEvents)
        .set({ reminded: true })
        .where(and(eq(guildEvents.id, id), eq(guildEvents.reminded, false)))
        .returning();
      if (!e) return;
      const { yes } = await loadRsvps(db, e.id);
      const text = eventReminderText(e, guild.name, eventLink(e));
      const missed: string[] = [];
      for (const userId of yes) {
        const user = await client.users.fetch(userId).catch(() => null);
        const sent = await user?.send(text).then(
          () => true,
          () => false,
        );
        if (!sent) missed.push(userId);
      }
      if (missed.length) {
        const mentions = missed.slice(0, 50);
        await client.rest
          .post(`/channels/${e.channelId}/messages`, {
            body: {
              content: t("⏰ **{title}** beginnt <t:{n1}:R>. {n2}", {
                title: e.title,
                n1: Math.floor(e.startsAt.getTime() / 1000),
                n2: mentions.map((u) => `<@${u}>`).join(" "),
              }),
              allowed_mentions: { users: mentions },
            },
          })
          .catch((err) =>
            logger.warn(
              { err, event: e.id },
              "Event-Erinnerung im Kanal nicht gesendet",
            ),
          );
      }
    });
  }
}

/** Schließt vorbei gegangene Events ab und entfernt die Event-Rolle wieder. */
export async function runFinishedEvents(
  client: Client,
  db: Db,
  now = new Date(),
) {
  const due = await db
    .select({ id: guildEvents.id, guildId: guildEvents.guildId })
    .from(guildEvents)
    .where(and(eq(guildEvents.state, "open"), lte(guildEvents.endsAt, now)))
    .limit(20);
  for (const { id, guildId } of due) {
    await inGuildLocale(guildId, async () => {
      if (!client.guilds.cache.has(guildId)) return;
      const [e] = await db
        .update(guildEvents)
        .set({ state: "done" })
        .where(and(eq(guildEvents.id, id), eq(guildEvents.state, "open")))
        .returning();
      if (!e) return;
      await refreshMessage(client, db, e);
      const guild = client.guilds.cache.get(guildId)!;
      if (e.roleId)
        for (const userId of (await loadRsvps(db, e.id)).yes)
          await setRole(
            guild,
            e.roleId,
            userId,
            false,
            t("Event #{id} vorbei", { id: e.id }),
          );
    });
  }
}

/** Im Dashboard abgesagte Events vollständig absagen. */
export async function runCancelRequests(client: Client, db: Db) {
  const due = await db
    .select({ id: guildEvents.id, guildId: guildEvents.guildId })
    .from(guildEvents)
    .where(
      and(eq(guildEvents.state, "open"), eq(guildEvents.cancelRequested, true)),
    )
    .limit(10);
  for (const { id, guildId } of due) {
    await inGuildLocale(guildId, async () => {
      if (!client.guilds.cache.has(guildId)) return;
      await cancelEvent(client, db, id).catch((err) =>
        logger.error({ err, event: id }, "Event absagen fehlgeschlagen"),
      );
    });
  }
}

export function startEventJobs(client: Client, db: Db): NodeJS.Timeout {
  return setInterval(() => {
    void runCancelRequests(client, db)
      .then(() => runEventReminders(client, db))
      .then(() => runFinishedEvents(client, db))
      .catch((err) => logger.error({ err }, "Events fehlgeschlagen"));
  }, 30_000);
}

/** Wird ein Event im Dashboard geändert, Nachricht sofort neu zeichnen. */
export function refreshEventSoon(client: Client, db: Db, id: number) {
  scheduleRefresh(client, db, id, 500);
}
