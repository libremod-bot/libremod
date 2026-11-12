import { AttachmentBuilder, EmbedBuilder, type Guild, type MessageCreateOptions, type GuildMember, type PartialGuildMember, type User } from "discord.js";
import { autoRoles, eq, welcomeSettings, type Db, type EmbedDesign, type WelcomeSettings } from "@libremod/db";
import { buildEmbedJson, renderTemplate } from "@libremod/shared";
import { logger } from "../logger.js";
import { renderWelcomeCard } from "../lib/welcomecard.js";

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
export function welcomePayload(
  template: string,
  asEmbed: boolean,
  user: User,
  guild: Guild,
  color = 0x4cb4ff,
  design?: EmbedDesign | null,
): MessageCreateOptions {
  const render = (s: string) => renderTemplate(s, vars(user, guild));
  // Erwähnung der neuen Person erlauben, sonst niemanden anpingen.
  const allowedMentions = { users: [user.id] };
  if (!asEmbed) return { content: render(template).slice(0, 2000), allowedMentions };
  return {
    embeds: [buildEmbedJson(design, template, { render, avatarUrl: user.displayAvatarURL({ size: 256 }), defaults: { color, thumbnail: "avatar" } })],
    allowedMentions,
  };
}

/** Begrüßung samt Bild, falls eingeschaltet. Klappt das Bild nicht, kommt die Nachricht ohne. */
export async function fullWelcomePayload(s: WelcomeSettings, user: User, guild: Guild, displayName?: string): Promise<MessageCreateOptions> {
  const payload = welcomePayload(s.welcomeMessage, s.welcomeEmbed, user, guild, s.welcomeImageColor, s.welcomeDesign);
  if (!s.welcomeImage) return payload;
  try {
    const png = await renderWelcomeCard({
      title: renderTemplate(s.welcomeImageTitle, vars(user, guild)).replace(/<@\d+>/g, displayName ?? user.globalName ?? user.username),
      name: displayName ?? user.globalName ?? user.username,
      avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
      memberCount: guild.memberCount,
      color: s.welcomeImageColor,
    });
    const files = [new AttachmentBuilder(png, { name: "willkommen.png" })];
    const embeds = payload.embeds?.map((e) => {
      // Das Begrüßungsbild ersetzt das Profilbild. Ein eigenes großes Bild hat Vorrang.
      const b = EmbedBuilder.from(e);
      return "image" in b.data && b.data.image ? b : b.setThumbnail(s.welcomeDesign?.thumbnail === "url" ? (b.data.thumbnail?.url ?? null) : null).setImage("attachment://willkommen.png");
    });
    return { ...payload, ...(embeds ? { embeds } : {}), files };
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Begrüßungsbild konnte nicht gezeichnet werden");
    return payload;
  }
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
  if (s.welcomeEnabled) await sendTo(member.guild, s.welcomeChannelId, await fullWelcomePayload(s, member.user, member.guild, member.displayName));
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
    ...welcomePayload(s.goodbyeMessage, s.goodbyeEmbed, member.user, member.guild, 0xf59e42, s.goodbyeDesign),
    allowedMentions: { parse: [] }, // Wer weg ist, wird nicht mehr angepingt
  });
}
