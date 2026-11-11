import type { Client, Guild, GuildMember, Message, SendableChannels } from "discord.js";
import {
  and,
  eq,
  gt,
  count,
  levelNoXp,
  levelRewards,
  levelSettings,
  memberXp,
  sql,
  type Db,
  type LevelReward,
  type LevelSettings,
} from "@libremod/db";
import { levelForXp, MAX_XP, randomXp, renderTemplate, rewardRoles } from "@libremod/shared";
import { logger } from "../logger.js";

interface GuildLevels {
  settings: LevelSettings | null;
  rewards: LevelReward[];
  noXpRoles: Set<string>;
  noXpChannels: Set<string>;
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, GuildLevels>();
const lastXpAt = new Map<string, number>();

export function invalidateLevels(guildId: string) {
  cache.delete(guildId);
}

export async function loadLevels(db: Db, guildId: string): Promise<GuildLevels> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;
  const [[settings], rewards, noXp] = await Promise.all([
    db.select().from(levelSettings).where(eq(levelSettings.guildId, guildId)),
    db.select().from(levelRewards).where(eq(levelRewards.guildId, guildId)),
    db.select().from(levelNoXp).where(eq(levelNoXp.guildId, guildId)),
  ]);
  const entry: GuildLevels = {
    settings: settings ?? null,
    rewards,
    noXpRoles: new Set(noXp.filter((n) => n.kind === "role").map((n) => n.targetId)),
    noXpChannels: new Set(noXp.filter((n) => n.kind === "channel").map((n) => n.targetId)),
    loadedAt: Date.now(),
  };
  cache.set(guildId, entry);
  return entry;
}

function blocked(cfg: GuildLevels, member: GuildMember, channel: { id: string; parentId?: string | null }) {
  if (cfg.noXpChannels.has(channel.id) || (channel.parentId && cfg.noXpChannels.has(channel.parentId))) return true;
  return member.roles.cache.some((r) => cfg.noXpRoles.has(r.id));
}

/** Gibt XP für eine Nachricht, höchstens einmal pro Cooldown. */
export async function handleMessageXp(message: Message, db: Db) {
  if (!message.inGuild() || message.author.bot || message.webhookId || !message.member) return;
  const cfg = await loadLevels(db, message.guildId);
  const s = cfg.settings;
  if (!s?.enabled) return;
  const channel = message.channel;
  if (blocked(cfg, message.member, { id: channel.id, parentId: "parentId" in channel ? channel.parentId : null })) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if ((lastXpAt.get(key) ?? 0) > now - s.cooldownSeconds * 1000) return;
  lastXpAt.set(key, now);

  await addXp(db, message.member, randomXp(s.textXpMin, s.textXpMax), { messages: 1, channel: channel.isSendable() ? channel : null });
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [k, t] of lastXpAt) if (t < cutoff) lastXpAt.delete(k);
}, 10 * 60_000).unref();

/**
 * Erhöht die XP eines Mitglieds. Steigt das Level, wird es verkündet und Belohnungen werden vergeben.
 * Die Erhöhung passiert atomar in der Datenbank, damit parallele Nachrichten nichts verlieren.
 */
export async function addXp(
  db: Db,
  member: GuildMember,
  amount: number,
  opts: { messages?: number; voiceMinutes?: number; channel?: SendableChannels | null } = {},
) {
  const guildId = member.guild.id;
  const [row] = await db
    .insert(memberXp)
    .values({ guildId, userId: member.id, xp: amount, messages: opts.messages ?? 0, voiceMinutes: opts.voiceMinutes ?? 0 })
    .onConflictDoUpdate({
      target: [memberXp.guildId, memberXp.userId],
      set: {
        xp: sql`least(${memberXp.xp} + ${amount}, ${MAX_XP})`,
        messages: sql`${memberXp.messages} + ${opts.messages ?? 0}`,
        voiceMinutes: sql`${memberXp.voiceMinutes} + ${opts.voiceMinutes ?? 0}`,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) return;
  await syncLevel(db, member, row.xp, row.level, { announce: true, channel: opts.channel ?? null });
}

/**
 * Bringt das gespeicherte Level in Einklang mit den XP. Nur wer das Level-Feld wirklich ändert,
 * verkündet den Aufstieg, so gibt es auch bei gleichzeitigen Nachrichten nur eine Meldung.
 */
async function syncLevel(
  db: Db,
  member: GuildMember,
  xp: number,
  storedLevel: number,
  opts: { announce: boolean; channel: SendableChannels | null },
) {
  const level = levelForXp(xp);
  if (level === storedLevel) return;
  const updated = await db
    .update(memberXp)
    .set({ level })
    .where(and(eq(memberXp.guildId, member.guild.id), eq(memberXp.userId, member.id), eq(memberXp.level, storedLevel)))
    .returning();
  if (!updated.length) return;

  const cfg = await loadLevels(db, member.guild.id);
  await applyRewards(member, level, cfg);
  if (opts.announce && level > storedLevel && cfg.settings) await announce(member, level, cfg.settings, opts.channel);
}

async function announce(member: GuildMember, level: number, s: LevelSettings, source: SendableChannels | null) {
  if (s.announce === "off") return;
  const text = renderTemplate(s.announceMessage, {
    user: `<@${member.id}>`,
    username: member.user.globalName ?? member.user.username,
    server: member.guild.name,
    membercount: member.guild.memberCount,
  })
    .replace(/\{level\}/gi, String(level))
    .slice(0, 2000);
  try {
    if (s.announce === "dm") {
      await member.send({ content: text, allowedMentions: { parse: [] } });
      return;
    }
    const target =
      s.announce === "channel" && s.announceChannelId
        ? (member.guild.channels.cache.get(s.announceChannelId) ?? (await member.guild.channels.fetch(s.announceChannelId)))
        : source;
    if (target?.isSendable()) await target.send({ content: text, allowedMentions: { users: [member.id] } });
  } catch (err) {
    logger.debug({ err, guildId: member.guild.id }, "Level-Aufstieg konnte nicht verkündet werden");
  }
}

/** Gibt fehlende Belohnungsrollen und nimmt solche weg, die nicht (mehr) passen. */
export async function applyRewards(member: GuildMember, level: number, cfg: GuildLevels) {
  if (!cfg.rewards.length) return;
  const { keep, drop } = rewardRoles(cfg.rewards, level, cfg.settings?.stackRewards ?? true);
  const me = member.guild.members.me;
  const manageable = (id: string) => {
    const role = member.guild.roles.cache.get(id);
    return !!role && !role.managed && !!me && role.position < me.roles.highest.position;
  };
  const add = keep.filter((id) => manageable(id) && !member.roles.cache.has(id));
  const remove = drop.filter((id) => manageable(id) && member.roles.cache.has(id));
  try {
    if (add.length) await member.roles.add(add, `Libremod: Level ${level}`);
    if (remove.length) await member.roles.remove(remove, `Libremod: Level ${level}`);
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id }, "Level-Belohnungen konnten nicht vergeben werden");
  }
}

/** Setzt XP auf einen festen Wert (für /xp). Level und Rollen werden angepasst, ohne Verkündung. */
export async function setXp(db: Db, member: GuildMember, xp: number) {
  const value = Math.max(0, Math.min(MAX_XP, Math.round(xp)));
  const [old] = await db
    .select()
    .from(memberXp)
    .where(and(eq(memberXp.guildId, member.guild.id), eq(memberXp.userId, member.id)));
  await db
    .insert(memberXp)
    .values({ guildId: member.guild.id, userId: member.id, xp: value })
    .onConflictDoUpdate({ target: [memberXp.guildId, memberXp.userId], set: { xp: value, updatedAt: new Date() } });
  await syncLevel(db, member, value, old?.level ?? 0, { announce: false, channel: null });
  return value;
}

export async function getXp(db: Db, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(memberXp)
    .where(and(eq(memberXp.guildId, guildId), eq(memberXp.userId, userId)));
  if (!row) return null;
  const [{ above } = { above: 0 }] = await db
    .select({ above: count() })
    .from(memberXp)
    .where(and(eq(memberXp.guildId, guildId), gt(memberXp.xp, row.xp)));
  return { ...row, rank: above + 1 };
}

/** Alle 60 Sekunden XP für aktive Sprachkanal-Teilnahme. */
export function startVoiceXp(client: Client, db: Db): NodeJS.Timeout {
  return setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      void voiceTick(guild, db).catch((err) => logger.warn({ err, guildId: guild.id }, "Sprach-XP fehlgeschlagen"));
    }
  }, 60_000);
}

export async function voiceTick(guild: Guild, db: Db) {
  if (!guild.voiceStates.cache.size) return;
  const cfg = await loadLevels(db, guild.id);
  const s = cfg.settings;
  if (!s?.enabled || s.voiceXpPerMinute <= 0) return;

  for (const state of guild.voiceStates.cache.values()) {
    const member = state.member;
    const channel = state.channel;
    if (!member || !channel || member.user.bot || channel.id === guild.afkChannelId) continue;
    if (state.selfDeaf || state.serverDeaf) continue;
    // Allein im Kanal gibt es keine XP.
    const others = channel.members.filter((m) => !m.user.bot && m.id !== member.id).size;
    if (others < 1 || blocked(cfg, member, channel)) continue;
    await addXp(db, member, s.voiceXpPerMinute, { voiceMinutes: 1, channel: null });
  }
}
