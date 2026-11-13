import { AuditLogEvent, EmbedBuilder, userMention, type Guild, type GuildAuditLogsEntry } from "discord.js";
import type { Db } from "@libremod/db";
import { NukeTracker, summarizeNuke, t, type NukeKind } from "@libremod/shared";
import { logger } from "../logger.js";
import { getSettings } from "./cases.js";

/**
 * Anti-Nuke: Ein gekapertes Team-Konto oder ein böser Bot kann in Sekunden Kanäle und Rollen löschen oder
 * alle bannen. Libremod zählt solche Aktionen pro Person über das Audit-Log und greift über der Schwelle ein.
 */

const KIND_OF: Partial<Record<AuditLogEvent, NukeKind>> = {
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.WebhookCreate]: "webhookCreate",
};

export const NUKE_LABELS: Record<NukeKind, string> = {
  channelDelete: "Kanal gelöscht",
  roleDelete: "Rolle gelöscht",
  ban: "Ban",
  kick: "Kick",
  webhookCreate: "Webhook erstellt",
};

const tracker = new NukeTracker();
setInterval(() => tracker.sweep(), 60_000).unref();

export async function onAuditLogEntry(entry: GuildAuditLogsEntry, guild: Guild, db: Db) {
  const kind = KIND_OF[entry.action];
  const executorId = entry.executorId;
  if (!kind || !executorId) return;
  if (executorId === guild.ownerId || executorId === guild.client.user.id) return;
  const s = await getSettings(db, guild.id);
  if (!s.antinukeEnabled || s.antinukeTrusted.includes(executorId)) return;
  const hits = tracker.record(guild.id, executorId, kind, s.antinukeThreshold);
  if (!hits) return;

  const summary = summarizeNuke(hits)
    .map((h) => `${h.n}× ${t(NUKE_LABELS[h.kind])}`)
    .join(", ");
  const result = await stop(guild, executorId, s.antinukeAction);
  logger.warn({ guildId: guild.id, executorId, summary, result }, "Anti-Nuke ausgelöst");

  const embed = new EmbedBuilder()
    .setColor(0xd63031)
    .setTitle(t("Anti-Nuke ausgelöst"))
    .setDescription(t("{user} hat in weniger als einer Minute sehr viel gelöscht oder entfernt.", { user: userMention(executorId) }))
    .addFields(
      { name: t("Person"), value: `${userMention(executorId)} (${executorId})`, inline: false },
      { name: t("Aktionen"), value: summary.slice(0, 1024), inline: false },
      { name: t("Reaktion"), value: result.slice(0, 1024), inline: false },
    )
    .setFooter({ text: t("Gelöschte Kanäle und Rollen kannst du über eine Sicherung im Dashboard wiederherstellen.") })
    .setTimestamp();

  if (s.modLogChannelId) {
    const log = await guild.channels.fetch(s.modLogChannelId).catch(() => null);
    if (log?.isSendable()) await log.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  }
  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send({ content: t("Achtung auf **{guild}**:", { guild: guild.name }), embeds: [embed] }).catch(() => {});
}

async function stop(guild: Guild, userId: string, action: string): Promise<string> {
  if (action === "alert") return t("Nur gemeldet (so eingestellt).");
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return t("Die Person ist nicht mehr auf dem Server.");
  const reason = t("Anti-Nuke: zu viele zerstörerische Aktionen in kurzer Zeit");
  try {
    if (action === "ban") {
      if (!member.bannable) return t("Bannen ging nicht: Die Rolle der Person steht über meiner.");
      await member.ban({ reason });
      return t("Gebannt.");
    }
    if (action === "kick") {
      if (!member.kickable) return t("Kicken ging nicht: Die Rolle der Person steht über meiner.");
      await member.kick(reason);
      return t("Gekickt.");
    }
    // strip: alle Rollen entziehen, die Libremod verwalten darf
    const me = guild.members.me;
    const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && me && r.comparePositionTo(me.roles.highest) < 0);
    const left = member.roles.cache.filter((r) => r.id !== guild.id && !removable.has(r.id));
    if (removable.size) await member.roles.remove([...removable.keys()], reason);
    if (left.size)
      return t("{n} Rollen entzogen. Nicht entziehen konnte ich: {roles}. Bitte schnell selbst prüfen!", {
        n: removable.size,
        roles: left.map((r) => r.name).join(", "),
      });
    return t("Alle {n} Rollen entzogen.", { n: removable.size });
  } catch (err) {
    logger.warn({ err, guildId: guild.id, userId }, "Anti-Nuke-Reaktion fehlgeschlagen");
    return t("Eingreifen ist fehlgeschlagen. Bitte sofort selbst prüfen!");
  }
}
