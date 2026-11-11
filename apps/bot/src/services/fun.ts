import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type Client,
  type Guild,
  type MessageCreateOptions,
} from "discord.js";
import {
  and,
  birthdays,
  birthdaySettings,
  count,
  eq,
  giveawayEntries,
  giveaways,
  lte,
  memberXp,
  or,
  reminders,
  sql,
  type BirthdaySettings,
  type Db,
  type Giveaway,
} from "@libremod/db";
import {
  ageOn,
  birthdayKeysOn,
  buildGiveawayMessage,
  giveawayCustomId,
  giveawayResultText,
  localDate,
  parseGiveawayCustomId,
  pickWinners,
  renderBirthdayMessage,
} from "@libremod/shared";
import { logger } from "../logger.js";

// =============== Gewinnspiele ===============

export const isGiveawayInteraction = (customId: string) => customId.startsWith("lmgw:");

async function entrantCount(db: Db, giveawayId: number) {
  const [row] = await db.select({ n: count() }).from(giveawayEntries).where(eq(giveawayEntries.giveawayId, giveawayId));
  return row?.n ?? 0;
}

async function giveawayMessage(db: Db, g: Giveaway) {
  return buildGiveawayMessage(g, await entrantCount(db, g.id));
}

/** Bearbeitet die Gewinnspiel-Nachricht. Ist sie weg, wird das still hingenommen. */
async function refreshMessage(client: Client, db: Db, g: Giveaway) {
  if (!g.messageId) return;
  const body = await giveawayMessage(db, g);
  await client.rest.patch(`/channels/${g.channelId}/messages/${g.messageId}`, { body }).catch((err) => {
    if (!isGone(err)) logger.warn({ err, giveaway: g.id }, "Gewinnspiel-Nachricht nicht aktualisiert");
  });
}

const isGone = (err: unknown) =>
  err instanceof DiscordAPIError &&
  [RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess].includes(err.code as number);

// Viele Klicks kurz hintereinander lösen nur eine Bearbeitung aus.
const pendingRefresh = new Map<number, NodeJS.Timeout>();
function scheduleRefresh(client: Client, db: Db, id: number) {
  if (pendingRefresh.has(id)) return;
  pendingRefresh.set(
    id,
    setTimeout(() => {
      pendingRefresh.delete(id);
      void db
        .select()
        .from(giveaways)
        .where(eq(giveaways.id, id))
        .then(([g]) => (g && !g.ended ? refreshMessage(client, db, g) : undefined))
        .catch((err) => logger.warn({ err, giveaway: id }, "Gewinnspiel-Nachricht nicht aktualisiert"));
    }, 4000),
  );
}

export interface NewGiveaway {
  guildId: string;
  channelId: string;
  prize: string;
  description?: string;
  winners: number;
  hostId: string;
  requiredRoleId?: string | null;
  minLevel?: number;
  endsAt: Date;
}

/** Legt ein Gewinnspiel an und postet die Nachricht. Schlägt das Posten fehl, wird es wieder gelöscht. */
export async function createGiveaway(client: Client, db: Db, input: NewGiveaway) {
  const [g] = await db
    .insert(giveaways)
    .values({ ...input, description: input.description ?? "", minLevel: input.minLevel ?? 0 })
    .returning();
  try {
    const msg = (await client.rest.post(`/channels/${g!.channelId}/messages`, { body: buildGiveawayMessage(g!, 0) })) as { id: string };
    const [saved] = await db.update(giveaways).set({ messageId: msg.id }).where(eq(giveaways.id, g!.id)).returning();
    return saved!;
  } catch (err) {
    await db.delete(giveaways).where(eq(giveaways.id, g!.id));
    throw err;
  }
}

export async function handleGiveawayButton(interaction: ButtonInteraction, db: Db) {
  const parsed = parseGiveawayCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  const [g] = await db.select().from(giveaways).where(and(eq(giveaways.id, parsed.id), eq(giveaways.guildId, interaction.guildId)));
  if (!g) return void (await reply("Dieses Gewinnspiel gibt es nicht mehr."));
  if (g.ended || g.endsAt <= new Date()) return void (await reply("Dieses Gewinnspiel ist schon vorbei."));
  const userId = interaction.user.id;

  if (parsed.action === "leave") {
    const left = await db
      .delete(giveawayEntries)
      .where(and(eq(giveawayEntries.giveawayId, g.id), eq(giveawayEntries.userId, userId)))
      .returning();
    await interaction.update({ content: left.length ? "Du nimmst nicht mehr teil." : "Du warst gar nicht dabei.", components: [] });
    if (left.length) scheduleRefresh(interaction.client, db, g.id);
    return;
  }

  if (g.requiredRoleId && !interaction.member.roles.cache.has(g.requiredRoleId)) {
    return void (await reply(`Mitmachen kann nur, wer die Rolle <@&${g.requiredRoleId}> hat.`));
  }
  if (g.minLevel > 0) {
    const [xp] = await db.select({ level: memberXp.level }).from(memberXp).where(and(eq(memberXp.guildId, g.guildId), eq(memberXp.userId, userId)));
    const level = xp?.level ?? 0;
    if (level < g.minLevel) return void (await reply(`Mitmachen kannst du ab Level ${g.minLevel}. Du bist gerade Level ${level}.`));
  }

  const joined = await db.insert(giveawayEntries).values({ giveawayId: g.id, userId }).onConflictDoNothing().returning();
  if (!joined.length) {
    const leave = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(giveawayCustomId(g.id, "leave")).setLabel("Nicht mehr teilnehmen").setStyle(ButtonStyle.Danger),
    );
    return void (await interaction.reply({ content: "Du machst schon mit. Viel Glück! 🍀", components: [leave], flags: MessageFlags.Ephemeral }));
  }
  await reply("Du bist dabei. Viel Glück! 🍀");
  scheduleRefresh(interaction.client, db, g.id);
}

/**
 * Zieht Gewinner, die noch auf dem Server sind. Es werden höchstens 100 Kandidaten geprüft,
 * damit ein Gewinnspiel mit vielen Ausgetretenen nicht ewig dauert.
 */
async function drawWinners(guild: Guild, db: Db, g: Giveaway, n: number, exclude: string[]) {
  const entries = await db.select({ userId: giveawayEntries.userId }).from(giveawayEntries).where(eq(giveawayEntries.giveawayId, g.id));
  const order = pickWinners(
    entries.map((e) => e.userId),
    entries.length,
    Math.random,
    exclude,
  ).slice(0, 100);
  const winners: string[] = [];
  for (let i = 0; i < order.length && winners.length < n; i += 25) {
    const chunk = order.slice(i, i + 25);
    const members = await guild.members.fetch({ user: chunk }).catch(() => null);
    for (const id of chunk) if (members?.has(id) && winners.length < n) winners.push(id);
  }
  return winners;
}

async function announce(client: Client, g: Giveaway, content: string, winners: string[]) {
  const body: Record<string, unknown> = { content, allowed_mentions: { users: winners } };
  if (g.messageId) body.message_reference = { message_id: g.messageId, fail_if_not_exists: false };
  await client.rest.post(`/channels/${g.channelId}/messages`, { body }).catch((err) => {
    if (!isGone(err)) logger.warn({ err, giveaway: g.id }, "Gewinner-Bekanntgabe fehlgeschlagen");
  });
}

/** Beendet ein Gewinnspiel genau einmal. Gibt null zurück, wenn es schon beendet war. */
export async function endGiveaway(client: Client, db: Db, id: number, now = new Date()) {
  const [claimed] = await db
    .update(giveaways)
    .set({ ended: true, endsAt: sql`least(${giveaways.endsAt}, ${now.toISOString()}::timestamptz)` })
    .where(and(eq(giveaways.id, id), eq(giveaways.ended, false)))
    .returning();
  if (!claimed) return null;
  const guild = client.guilds.cache.get(claimed.guildId);
  const winners = guild ? await drawWinners(guild, db, claimed, claimed.winners, []) : [];
  const [g] = await db.update(giveaways).set({ winnerIds: winners }).where(eq(giveaways.id, id)).returning();
  await refreshMessage(client, db, g!);
  await announce(client, g!, giveawayResultText(g!.prize, winners), winners);
  return g!;
}

/** Lost neue Gewinner aus. Wer schon gewonnen hat, wird nicht noch einmal gezogen. */
export async function rerollGiveaway(client: Client, db: Db, g: Giveaway, n: number) {
  const guild = client.guilds.cache.get(g.guildId);
  if (!guild) return [];
  const winners = await drawWinners(guild, db, g, n, g.winnerIds);
  if (winners.length) {
    const [saved] = await db
      .update(giveaways)
      .set({ winnerIds: [...g.winnerIds, ...winners].slice(-50) })
      .where(eq(giveaways.id, g.id))
      .returning();
    await refreshMessage(client, db, saved!);
  }
  await announce(client, g, winners.length ? giveawayResultText(g.prize, winners, true) : "Es gibt niemanden mehr, der neu ausgelost werden kann.", winners);
  return winners;
}

export async function runDueGiveaways(client: Client, db: Db, now = new Date()) {
  const due = await db
    .select({ id: giveaways.id, guildId: giveaways.guildId })
    .from(giveaways)
    .where(and(eq(giveaways.ended, false), lte(giveaways.endsAt, now)))
    .limit(20);
  for (const g of due) {
    if (!client.guilds.cache.has(g.guildId)) continue;
    await endGiveaway(client, db, g.id, now).catch((err) => logger.error({ err, giveaway: g.id }, "Gewinnspiel beenden fehlgeschlagen"));
  }
}

// =============== Erinnerungen ===============

export async function runDueReminders(client: Client, db: Db, now = new Date()) {
  const due = await db.select().from(reminders).where(lte(reminders.dueAt, now)).limit(50);
  for (const r of due) {
    // Erst löschen, dann senden: lieber einmal verpasst als doppelt.
    const [claimed] = await db.delete(reminders).where(eq(reminders.id, r.id)).returning();
    if (!claimed) continue;
    const late = now.getTime() - r.dueAt.getTime() > 5 * 60_000 ? " (etwas verspätet)" : "";
    const content = `⏰ <@${r.userId}>, deine Erinnerung${late}:\n${r.text}`.slice(0, 2000);
    const payload: MessageCreateOptions = { content, allowedMentions: { users: [r.userId] } };
    let sent = false;
    if (r.dm) {
      sent = await client.users
        .send(r.userId, { content: `⏰ Deine Erinnerung${late}:\n${r.text}`.slice(0, 2000) })
        .then(() => true)
        .catch(() => false);
    }
    if (!sent) {
      await client.channels
        .fetch(r.channelId)
        .then(async (c) => {
          if (c?.isSendable()) await c.send(payload);
        })
        .catch((err) => logger.warn({ err, reminder: r.id }, "Erinnerung nicht zugestellt"));
    }
  }
}

// =============== Geburtstage ===============

/** Gratuliert einmal pro Tag ab der eingestellten Stunde und verteilt die Geburtstagsrolle. */
export async function runBirthdays(client: Client, db: Db, now = new Date()) {
  const all = await db.select().from(birthdaySettings).where(eq(birthdaySettings.enabled, true));
  for (const s of all) {
    const guild = client.guilds.cache.get(s.guildId);
    if (!guild) continue;
    await celebrate(guild, db, s, now).catch((err) => logger.error({ err, guildId: s.guildId }, "Geburtstage fehlgeschlagen"));
  }
}

export async function celebrate(guild: Guild, db: Db, s: BirthdaySettings, now = new Date()) {
  const today = localDate(now);
  if (today.hour < s.hour || s.lastRunDate === today.iso) return;
  const [claimed] = await db
    .update(birthdaySettings)
    .set({ lastRunDate: today.iso })
    .where(
      and(
        eq(birthdaySettings.guildId, s.guildId),
        or(sql`${birthdaySettings.lastRunDate} is null`, sql`${birthdaySettings.lastRunDate} <> ${today.iso}`),
      ),
    )
    .returning();
  if (!claimed) return;

  const role = s.roleId ? guild.roles.cache.get(s.roleId) : undefined;
  // Rolle von gestern wieder abnehmen.
  if (role) {
    for (const id of s.roleHolders) {
      const m = await guild.members.fetch(id).catch(() => null);
      await m?.roles.remove(role, "Geburtstag vorbei").catch(() => {});
    }
  }

  const keys = birthdayKeysOn(today);
  const rows = await db
    .select()
    .from(birthdays)
    .where(and(eq(birthdays.guildId, s.guildId), or(...keys.map((k) => and(eq(birthdays.month, k.month), eq(birthdays.day, k.day))))))
    .limit(100);
  const members = rows.length ? await guild.members.fetch({ user: rows.map((r) => r.userId) }).catch(() => null) : null;
  const holders: string[] = [];
  const channel = s.channelId ? await guild.channels.fetch(s.channelId).catch(() => null) : null;

  for (const b of rows) {
    const member = members?.get(b.userId);
    if (!member) continue;
    if (role) {
      await member.roles
        .add(role, "Geburtstag")
        .then(() => holders.push(member.id))
        .catch((err) => logger.warn({ err, guildId: guild.id }, "Geburtstagsrolle nicht vergeben"));
    }
    if (channel?.isSendable()) {
      const content = renderBirthdayMessage(s.message, {
        userId: member.id,
        name: member.displayName,
        age: ageOn(b.year, today.year),
        server: guild.name,
      });
      await channel.send({ content, allowedMentions: { users: [member.id] } }).catch((err) => logger.warn({ err, guildId: guild.id }, "Glückwunsch nicht gesendet"));
    }
  }
  await db.update(birthdaySettings).set({ roleHolders: holders }).where(eq(birthdaySettings.guildId, s.guildId));
}

export function startFunJobs(client: Client, db: Db): NodeJS.Timeout[] {
  const every = (ms: number, what: string, fn: () => Promise<void>) =>
    setInterval(() => void fn().catch((err) => logger.error({ err }, `${what} fehlgeschlagen`)), ms);
  return [
    every(20_000, "Gewinnspiele", () => runDueGiveaways(client, db)),
    every(20_000, "Erinnerungen", () => runDueReminders(client, db)),
    every(5 * 60_000, "Geburtstage", () => runBirthdays(client, db)),
  ];
}
