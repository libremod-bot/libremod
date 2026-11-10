import { EmbedBuilder, time, userMention, type Guild } from "discord.js";
import type { CaseType, ModCase } from "@libremod/db";
import { logger } from "../logger.js";

export const CASE_LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};

const CASE_COLORS: Record<CaseType, number> = {
  warn: 0xf5c542,
  timeout: 0xf59e42,
  untimeout: 0x42b3f5,
  kick: 0xf56942,
  ban: 0xd63031,
  unban: 0x2ecc71,
};

/** Baut die Darstellung eines Falls, genutzt im Mod-Log und bei /case. */
export function caseEmbed(c: ModCase, extra?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(CASE_COLORS[c.type])
    .setTitle(`Fall #${c.caseNumber} · ${CASE_LABELS[c.type]}${c.automatic ? " (automatisch)" : ""}`)
    .addFields(
      { name: "Mitglied", value: `${userMention(c.targetId)} (${c.targetId})`, inline: true },
      { name: "Moderator", value: userMention(c.moderatorId), inline: true },
      { name: "Grund", value: c.reason || "Kein Grund angegeben" },
    )
    .setTimestamp(c.createdAt);

  if (c.expiresAt) embed.addFields({ name: "Endet", value: `${time(c.expiresAt, "f")} (${time(c.expiresAt, "R")})` });
  if (extra) embed.setDescription(extra);
  if (!c.active && (c.type === "warn" || c.type === "ban")) embed.setFooter({ text: "Nicht mehr aktiv" });
  return embed;
}

/** Schickt einen Fall in den Mod-Log-Kanal des Servers, falls einer eingestellt ist. */
export async function postModLog(guild: Guild, channelId: string | null, c: ModCase, extra?: string) {
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isSendable()) return;
    await channel.send({ embeds: [caseEmbed(c, extra)], allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn({ err, guildId: guild.id, channelId }, "Mod-Log konnte nicht gesendet werden");
  }
}
