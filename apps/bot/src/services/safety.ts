import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildMember, type PartialGuildMember } from "discord.js";
import { appealSettings, eq, nameGuardSettings, type Db, type NameGuardSettings } from "@libremod/db";
import { impersonates } from "@libremod/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { moderate } from "./actions.js";
import { getSettings } from "./cases.js";

// =============== Namensschutz ===============

const CACHE_TTL_MS = 60_000;
const NAMES_TTL_MS = 10 * 60_000;
const settingsCache = new Map<string, { s: NameGuardSettings | null; at: number }>();
const namesCache = new Map<string, { names: { name: string; userId: string | null }[]; at: number }>();
const recentlyHandled = new Map<string, number>();
const RENAMED = "Name geändert";

export function invalidateNameGuard(guildId: string) {
  settingsCache.delete(guildId);
  namesCache.delete(guildId);
}

async function loadNameGuard(db: Db, guildId: string) {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.s;
  const [s] = await db.select().from(nameGuardSettings).where(eq(nameGuardSettings.guildId, guildId));
  settingsCache.set(guildId, { s: s ?? null, at: Date.now() });
  return s ?? null;
}

const namesOf = (m: GuildMember) => [m.displayName, m.user.username, m.user.globalName].filter((n): n is string => !!n);

/** Geschützte Namen: Besitzer, Bot, Mitglieder mit Team-Rollen und frei eingetragene Namen. */
async function protectedNames(guild: Guild, s: NameGuardSettings) {
  const hit = namesCache.get(guild.id);
  if (hit && Date.now() - hit.at < NAMES_TTL_MS) return hit.names;
  const members = s.roleIds.length ? await guild.members.fetch().catch(() => guild.members.cache) : guild.members.cache;
  const owner = await guild.fetchOwner().catch(() => null);
  const team = new Map<string, GuildMember>();
  if (owner) team.set(owner.id, owner);
  if (guild.members.me) team.set(guild.members.me.id, guild.members.me);
  for (const m of members.values()) if (!m.user.bot && s.roleIds.some((r) => m.roles.cache.has(r))) team.set(m.id, m);
  const names = [
    ...[...team.values()].flatMap((m) => [...new Set(namesOf(m))].map((name) => ({ name, userId: m.id }))),
    ...s.names.map((name) => ({ name, userId: null })),
  ];
  namesCache.set(guild.id, { names, at: Date.now() });
  return names;
}

async function notice(guild: Guild, db: Db, embed: EmbedBuilder) {
  const { modLogChannelId } = await getSettings(db, guild.id);
  if (!modLogChannelId) return;
  const channel = await guild.channels.fetch(modLogChannelId).catch(() => null);
  if (channel?.isSendable()) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

/** Prüft den Namen eines Mitglieds beim Beitritt und bei Namensänderungen. */
export async function checkMemberName(member: GuildMember, db: Db) {
  if (member.user.bot) return;
  const s = await loadNameGuard(db, member.guild.id);
  if (!s?.enabled) return;
  const guild = member.guild;
  if (member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
  if (s.roleIds.some((r) => member.roles.cache.has(r))) return;
  if (s.action === "rename" && member.displayName === RENAMED) return; // schon erledigt

  const names = await protectedNames(guild, s);
  const others = names.filter((n) => n.userId !== member.id).map((n) => n.name);
  let match: { used: string; like: string } | null = null;
  for (const used of new Set(namesOf(member))) {
    const like = impersonates(used, others);
    if (like) {
      match = { used, like };
      break;
    }
  }
  if (!match) return;

  // Eigene Umbenennung löst wieder ein Update aus: nicht doppelt handeln.
  const key = `${guild.id}:${member.id}`;
  if ((recentlyHandled.get(key) ?? 0) > Date.now() - 60_000) return;
  recentlyHandled.set(key, Date.now());
  for (const [k, t] of recentlyHandled) if (t < Date.now() - 60_000) recentlyHandled.delete(k);

  const reason = `Namensschutz: „${match.used}“ ähnelt „${match.like}“`;
  let done = "Nur gemeldet";
  try {
    if (s.action === "rename" && member.manageable) {
      await member.setNickname(RENAMED, reason);
      done = `Spitzname auf „${RENAMED}“ gesetzt`;
    } else if ((s.action === "kick" || s.action === "ban") && (s.action === "ban" ? member.bannable : member.kickable)) {
      await moderate({ db, guild, type: s.action, target: member.user, member, moderatorId: guild.members.me!.id, reason, automatic: true });
      return; // moderate() schreibt selbst ins Mod-Log
    } else if (s.action !== "log") {
      done = "Konnte nichts tun: Die Person steht über Libremod";
    }
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Namensschutz konnte nicht eingreifen");
    done = "Eingreifen ist fehlgeschlagen";
  }
  await notice(
    guild,
    db,
    new EmbedBuilder()
      .setColor(0xf59e42)
      .setTitle("Namensschutz")
      .setDescription(`<@${member.id}> (${member.id}) heißt „${match.used}“ und ähnelt damit „${match.like}“.`)
      .addFields({ name: "Ergebnis", value: done })
      .setTimestamp(),
  );
}

export async function onNameGuardUpdate(before: GuildMember | PartialGuildMember, after: GuildMember, db: Db) {
  // Ändert sich ein Team-Name, gilt die Liste neu.
  const s = await loadNameGuard(db, after.guild.id);
  if (!s?.enabled) return;
  const rolesChanged = !before.partial && s.roleIds.some((r) => before.roles.cache.has(r) !== after.roles.cache.has(r));
  const namesChanged = before.partial || before.displayName !== after.displayName || before.user.username !== after.user.username || before.user.globalName !== after.user.globalName;
  if (rolesChanged || (namesChanged && s.roleIds.some((r) => after.roles.cache.has(r)))) namesCache.delete(after.guild.id);
  if (namesChanged || rolesChanged) await checkMemberName(after, db);
}

// =============== Einspruch-Link ===============

/** Link zum Einspruch für die Ban-Nachricht, falls Einsprüche an sind. */
export async function appealLink(db: Db, guildId: string): Promise<string | null> {
  if (!config.DASHBOARD_URL) return null;
  const [s] = await db.select({ enabled: appealSettings.enabled }).from(appealSettings).where(eq(appealSettings.guildId, guildId));
  return s?.enabled ? `${config.DASHBOARD_URL.replace(/\/$/, "")}/appeal/${guildId}` : null;
}
