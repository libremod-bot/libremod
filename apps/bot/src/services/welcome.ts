import { EmbedBuilder, type Guild, type MessageCreateOptions, type GuildMember, type PartialGuildMember, type User } from "discord.js";
import { autoRoles, eq, welcomeSettings, type Db, type WelcomeSettings } from "@libremod/db";
import { renderTemplate } from "@libremod/shared";
import { logger } from "../logger.js";

interface GuildWelcome {
  settings: WelcomeSettings | null;
  humanRoles: string[];
  botRoles: string[];
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, GuildWelcome>();

export function invalidateWelcome(guildId: string) {
  cache.delete(guildId);
}

async function load(db: Db, guildId: string): Promise<GuildWelcome> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;
  const [[settings], roles] = await Promise.all([
    db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, guildId)),
    db.select().from(autoRoles).where(eq(autoRoles.guildId, guildId)),
  ]);
  const entry: GuildWelcome = {
    settings: settings ?? null,
    humanRoles: roles.filter((r) => r.target === "humans").map((r) => r.roleId),
    botRoles: roles.filter((r) => r.target === "bots").map((r) => r.roleId),
    loadedAt: Date.now(),
  };
  cache.set(guildId, entry);
  return entry;
}

const vars = (user: User, guild: Guild) => ({
  user: `<@${user.id}>`,
  username: user.globalName ?? user.username,
  server: guild.name,
  membercount: guild.memberCount,
});

/** Baut die Nachricht als Text oder als Embed mit Avatar. */
export function welcomePayload(template: string, asEmbed: boolean, user: User, guild: Guild, color = 0x4cb4ff): MessageCreateOptions {
  const text = renderTemplate(template, vars(user, guild)).slice(0, asEmbed ? 4000 : 2000);
  // Erwähnung der neuen Person erlauben, sonst niemanden anpingen.
  const allowedMentions = { users: [user.id] };
  if (!asEmbed) return { content: text, allowedMentions };
  return {
    embeds: [new EmbedBuilder().setColor(color).setDescription(text).setThumbnail(user.displayAvatarURL({ size: 256 }))],
    allowedMentions,
  };
}

async function sendTo(guild: Guild, channelId: string | null, payload: MessageCreateOptions) {
  if (!channelId) return;
  try {
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId));
    if (channel?.isSendable()) await channel.send(payload);
  } catch (err) {
    logger.warn({ err, guildId: guild.id, channelId }, "Begrüßung konnte nicht gesendet werden");
  }
}

/** Vergibt Auto-Rollen. Rollen, die der Bot nicht vergeben kann, werden übersprungen. */
export async function giveAutoRoles(member: GuildMember, db: Db) {
  const cfg = await load(db, member.guild.id);
  const ids = member.user.bot ? cfg.botRoles : cfg.humanRoles;
  if (!ids.length) return;
  const me = member.guild.members.me;
  const assignable = ids.filter((id) => {
    const role = member.guild.roles.cache.get(id);
    return role && !role.managed && me && role.position < me.roles.highest.position && !member.roles.cache.has(id);
  });
  if (!assignable.length) return;
  try {
    await member.roles.add(assignable, "Libremod: Auto-Rolle");
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id }, "Auto-Rollen konnten nicht vergeben werden");
  }
}

export async function onWelcomeJoin(member: GuildMember, db: Db) {
  const cfg = await load(db, member.guild.id);
  // Bei Mitgliedschaftsprüfung erst nach dem Akzeptieren der Regeln (siehe onWelcomeMemberUpdate).
  if (!member.pending) await giveAutoRoles(member, db);
  const s = cfg.settings;
  if (!s || member.user.bot) return;
  if (s.welcomeEnabled) await sendTo(member.guild, s.welcomeChannelId, welcomePayload(s.welcomeMessage, s.welcomeEmbed, member.user, member.guild));
  if (s.dmEnabled) {
    const text = renderTemplate(s.dmMessage, vars(member.user, member.guild)).slice(0, 2000);
    await member.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {}); // DMs können geschlossen sein
  }
}

/** Mitglied hat die Regeln akzeptiert: jetzt Auto-Rollen geben. */
export async function onWelcomeMemberUpdate(before: GuildMember | PartialGuildMember, after: GuildMember, db: Db) {
  if (before.pending && !after.pending) await giveAutoRoles(after, db);
}

export async function onWelcomeLeave(member: GuildMember | PartialGuildMember, db: Db) {
  const s = (await load(db, member.guild.id)).settings;
  if (!s?.goodbyeEnabled || member.user.bot) return;
  await sendTo(member.guild, s.goodbyeChannelId, {
    ...welcomePayload(s.goodbyeMessage, s.goodbyeEmbed, member.user, member.guild, 0xf59e42),
    allowedMentions: { parse: [] }, // Wer weg ist, wird nicht mehr angepingt
  });
}
