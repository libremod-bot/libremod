import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type ModalSubmitInteraction,
  type PartialGuildMember,
} from "discord.js";
import {
  and,
  channelLocks,
  eq,
  lte,
  verificationPending,
  verificationSettings,
  type ChannelLock,
  type Db,
  type VerificationSettings,
} from "@libremod/db";
import {
  accountOldEnoughAt,
  answerMatches,
  AttemptLimiter,
  codeMatches,
  generateCode,
  lockOptions,
  restoreOptions,
  snapshotOverwrite,
  VERIFY_ANSWER_ID,
  VERIFY_CODE_ID,
  VERIFY_START_ID,
} from "@libremod/shared";
import { logger } from "../logger.js";

// =============== Verifizierung ===============

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { s: VerificationSettings | null; at: number }>();

export function invalidateVerification(guildId: string) {
  cache.delete(guildId);
}

export async function loadVerification(db: Db, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.s;
  const [s] = await db.select().from(verificationSettings).where(eq(verificationSettings.guildId, guildId));
  cache.set(guildId, { s: s ?? null, at: Date.now() });
  return s ?? null;
}

export const isVerifyInteraction = (customId: string) => customId.startsWith("lmvf:");

const codes = new Map<string, { code: string; expires: number }>();
const limiter = new AttemptLimiter(3, 10 * 60_000);

async function verifyLog(guild: Guild, s: VerificationSettings, text: string, color = 0x3ba55d) {
  if (!s.logChannelId) return;
  const ch = await guild.channels.fetch(s.logChannelId).catch(() => null);
  if (!ch?.isSendable()) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => {});
}

/** Gibt die Rolle, nimmt die Unverifiziert-Rolle weg und räumt die Warteliste auf. */
export async function completeVerification(member: GuildMember, db: Db, s: VerificationSettings, by?: string) {
  if (s.roleId) await member.roles.add(s.roleId, by ? `Verifiziert von ${by}` : "Verifiziert");
  if (s.unverifiedRoleId && member.roles.cache.has(s.unverifiedRoleId)) {
    await member.roles.remove(s.unverifiedRoleId, "Verifiziert").catch(() => {});
  }
  await db.delete(verificationPending).where(and(eq(verificationPending.guildId, member.guild.id), eq(verificationPending.userId, member.id)));
  limiter.reset(`${member.guild.id}:${member.id}`);
  await verifyLog(member.guild, s, `✅ <@${member.id}> (${member.user.username}) ist verifiziert${by ? ` (von <@${by}>)` : ""}.`);
}

export async function handleVerifyInteraction(interaction: ButtonInteraction | ModalSubmitInteraction, db: Db) {
  if (!interaction.inCachedGuild()) return;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const s = await loadVerification(db, interaction.guildId);
  if (!s?.enabled || !s.roleId) return void (await reply("Die Verifizierung ist auf diesem Server gerade ausgeschaltet."));
  const member = interaction.member;
  if (member.roles.cache.has(s.roleId)) return void (await reply("Du bist schon verifiziert. 👍"));

  const key = `${interaction.guildId}:${member.id}`;
  const wait = limiter.waitMs(key);
  if (wait > 0) return void (await reply(`Zu viele Fehlversuche. Probier es ${time(new Date(Date.now() + wait), TimestampStyles.RelativeTime)} noch einmal.`));

  const tooYoung = accountOldEnoughAt(member.user.createdAt, s.minAccountAgeDays);
  if (tooYoung) {
    return void (await reply(
      `Dein Discord-Konto ist noch sehr neu. Auf diesem Server kannst du dich ab ${time(tooYoung, TimestampStyles.LongDate)} verifizieren.`,
    ));
  }

  if (interaction.isButton() && interaction.customId === VERIFY_START_ID) {
    if (s.mode === "button") {
      await completeVerification(member, db, s);
      return void (await reply("Danke! Du bist jetzt verifiziert und siehst den ganzen Server."));
    }
    if (s.mode === "code") {
      const code = generateCode();
      codes.set(key, { code, expires: Date.now() + 5 * 60_000 });
      const input = new TextInputBuilder().setCustomId("code").setLabel(`Tippe ab: ${code.split("").join(" ")}`).setStyle(TextInputStyle.Short).setMinLength(6).setMaxLength(12).setRequired(true);
      const modal = new ModalBuilder().setCustomId(VERIFY_CODE_ID).setTitle("Verifizierung").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      return void (await interaction.showModal(modal));
    }
    const input = new TextInputBuilder().setCustomId("answer").setLabel(s.question || "Antwort").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
    const modal = new ModalBuilder().setCustomId(VERIFY_ANSWER_ID).setTitle("Verifizierung").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return void (await interaction.showModal(modal));
  }

  if (!interaction.isModalSubmit()) return;
  let ok = false;
  if (interaction.customId === VERIFY_CODE_ID) {
    const entry = codes.get(key);
    codes.delete(key);
    if (!entry || entry.expires < Date.now()) return void (await reply("Der Code ist abgelaufen. Klicke bitte noch einmal auf „Verifizieren“."));
    ok = codeMatches(interaction.fields.getTextInputValue("code"), entry.code);
  } else if (interaction.customId === VERIFY_ANSWER_ID) {
    ok = answerMatches(interaction.fields.getTextInputValue("answer"), s.answers);
  }
  if (!ok) {
    limiter.fail(key);
    await verifyLog(interaction.guild, s, `❌ <@${member.id}> (${member.user.username}) hat falsch geantwortet.`, 0xf5c542);
    return void (await reply("Das war leider nicht richtig. Klicke noch einmal auf „Verifizieren“ und versuch es erneut."));
  }
  await completeVerification(member, db, s);
  await reply("Richtig! Du bist jetzt verifiziert und siehst den ganzen Server.");
}

export async function onVerifyJoin(member: GuildMember, db: Db) {
  if (member.user.bot) return;
  const s = await loadVerification(db, member.guild.id);
  if (!s?.enabled || !s.roleId) return;
  await db.insert(verificationPending).values({ guildId: member.guild.id, userId: member.id }).onConflictDoNothing();
  if (s.unverifiedRoleId) await member.roles.add(s.unverifiedRoleId, "Noch nicht verifiziert").catch(() => {});
}

export async function onVerifyLeave(member: GuildMember | PartialGuildMember, db: Db) {
  await db.delete(verificationPending).where(and(eq(verificationPending.guildId, member.guild.id), eq(verificationPending.userId, member.id)));
}

/** Kickt Mitglieder, die sich nicht rechtzeitig verifiziert haben. */
export async function kickUnverified(client: Client, db: Db, now = new Date()) {
  const all = await db.select().from(verificationSettings).where(eq(verificationSettings.enabled, true));
  for (const s of all) {
    if (s.kickAfterHours <= 0 || !s.roleId) continue;
    const guild = client.guilds.cache.get(s.guildId);
    if (!guild) continue;
    const overdue = await db
      .select()
      .from(verificationPending)
      .where(and(eq(verificationPending.guildId, s.guildId), lte(verificationPending.joinedAt, new Date(now.getTime() - s.kickAfterHours * 3600_000))))
      .limit(50);
    for (const p of overdue) {
      // Erst aus der Liste nehmen, damit parallel nichts doppelt passiert.
      const [claimed] = await db
        .delete(verificationPending)
        .where(and(eq(verificationPending.guildId, p.guildId), eq(verificationPending.userId, p.userId)))
        .returning();
      if (!claimed) continue;
      const member = await guild.members.fetch(p.userId).catch(() => null);
      if (!member || member.roles.cache.has(s.roleId)) continue;
      const ok = await member
        .kick(`Nicht innerhalb von ${s.kickAfterHours} Stunden verifiziert`)
        .then(() => true)
        .catch((err) => (logger.warn({ err, guildId: s.guildId }, "Unverifiziertes Mitglied nicht gekickt"), false));
      if (ok) await verifyLog(guild, s, `👢 <@${p.userId}> (${member.user.username}) wurde gekickt: nicht innerhalb von ${s.kickAfterHours} Stunden verifiziert.`, 0xf56942);
    }
  }
}

// =============== Lockdown ===============

const LOCKABLE = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum]);

export function isLockable(channel: GuildBasedChannel) {
  return LOCKABLE.has(channel.type);
}

type LockableChannel = Extract<GuildBasedChannel, { permissionOverwrites: unknown }>;

export interface LockInput {
  lockedBy: string;
  reason?: string | null;
  until?: Date | null;
  serverWide?: boolean;
}

function lockNotice(input: LockInput) {
  const lines = ["🔒 **Dieser Kanal ist vorübergehend gesperrt.**"];
  if (input.reason) lines.push(`Grund: ${input.reason}`);
  if (input.until) lines.push(`Wird ${time(input.until, TimestampStyles.RelativeTime)} automatisch wieder geöffnet.`);
  return new EmbedBuilder().setColor(0xd63031).setDescription(lines.join("\n"));
}

/**
 * Sperrt einen Kanal für @everyone. Gibt false zurück, wenn er schon gesperrt war.
 * Die Hinweis-Nachricht kommt vor der Sperre, weil der Bot danach selbst oft nicht mehr schreiben darf.
 */
export async function lockChannel(channel: LockableChannel, db: Db, input: LockInput): Promise<boolean> {
  const guild = channel.guild;
  const ow = channel.permissionOverwrites.cache.get(guild.id);
  const previous = snapshotOverwrite(ow?.allow.bitfield ?? 0n, ow?.deny.bitfield ?? 0n);
  const [row] = await db
    .insert(channelLocks)
    .values({ guildId: guild.id, channelId: channel.id, previous, lockedBy: input.lockedBy, reason: input.reason ?? null, until: input.until ?? null, serverWide: input.serverWide ?? false })
    .onConflictDoNothing()
    .returning();
  if (!row) return false;
  try {
    if (channel.isSendable()) await channel.send({ embeds: [lockNotice(input)] }).catch(() => {});
    await channel.permissionOverwrites.edit(guild.roles.everyone, lockOptions(), { reason: `Lockdown: ${input.reason ?? "kein Grund"}`.slice(0, 500) });
  } catch (err) {
    await db.delete(channelLocks).where(and(eq(channelLocks.guildId, guild.id), eq(channelLocks.channelId, channel.id)));
    throw err;
  }
  return true;
}

/** Hebt eine Sperre auf und stellt den alten Zustand her. Gibt false zurück, wenn nichts gesperrt war. */
export async function unlockChannel(guild: Guild, db: Db, channelId: string, by?: string): Promise<boolean> {
  const [lock] = await db
    .delete(channelLocks)
    .where(and(eq(channelLocks.guildId, guild.id), eq(channelLocks.channelId, channelId)))
    .returning();
  if (!lock) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !("permissionOverwrites" in channel)) return true; // Kanal ist weg, Eintrag ist aufgeräumt
  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, restoreOptions(lock.previous), { reason: by ? `Lockdown aufgehoben von ${by}` : "Lockdown abgelaufen" });
  } catch (err) {
    // Sperre bleibt bestehen, damit nichts verloren geht. Befristete werden später erneut versucht.
    await db
      .insert(channelLocks)
      .values({ ...lock, until: lock.until ? new Date(Date.now() + 10 * 60_000) : null })
      .onConflictDoNothing();
    throw err;
  }
  if (channel.isSendable()) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription("🔓 Der Kanal ist wieder offen.")] }).catch(() => {});
  }
  return true;
}

/** Alle Kanäle, in denen @everyone gerade schreiben kann. */
export function serverLockTargets(guild: Guild) {
  return [...guild.channels.cache.values()].filter(
    (c): c is LockableChannel =>
      isLockable(c) && "permissionOverwrites" in c && !!c.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel),
  );
}

export async function lockServer(guild: Guild, db: Db, input: LockInput) {
  let locked = 0;
  let failed = 0;
  for (const c of serverLockTargets(guild).slice(0, 200)) {
    const ok = await lockChannel(c, db, { ...input, serverWide: true }).catch((err) => (logger.warn({ err, channel: c.id }, "Kanal nicht gesperrt"), null));
    if (ok) locked++;
    else if (ok === null) failed++;
  }
  return { locked, failed };
}

export async function unlockServer(guild: Guild, db: Db, by?: string) {
  const locks = await db.select().from(channelLocks).where(and(eq(channelLocks.guildId, guild.id), eq(channelLocks.serverWide, true)));
  let unlocked = 0;
  for (const l of locks) {
    if (await unlockChannel(guild, db, l.channelId, by).catch((err) => (logger.warn({ err, channel: l.channelId }, "Kanal nicht entsperrt"), false))) unlocked++;
  }
  return unlocked;
}

export async function onLockedChannelDeleted(channelId: string, db: Db) {
  await db.delete(channelLocks).where(eq(channelLocks.channelId, channelId));
}

export async function runExpiredLocks(client: Client, db: Db, now = new Date()) {
  const due: ChannelLock[] = await db.select().from(channelLocks).where(lte(channelLocks.until, now)).limit(50);
  for (const l of due) {
    const guild = client.guilds.cache.get(l.guildId);
    if (!guild) continue;
    await unlockChannel(guild, db, l.channelId).catch((err) => logger.warn({ err, channel: l.channelId }, "Befristete Sperre nicht aufgehoben"));
  }
}

export function startProtectionJobs(client: Client, db: Db): NodeJS.Timeout[] {
  const every = (ms: number, what: string, fn: () => Promise<void>) =>
    setInterval(() => void fn().catch((err) => logger.error({ err }, `${what} fehlgeschlagen`)), ms);
  return [every(20_000, "Lockdown", () => runExpiredLocks(client, db)), every(5 * 60_000, "Verifizierung", () => kickUnverified(client, db))];
}
