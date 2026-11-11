import type { Client, Guild } from "discord.js";
import { counterChannels, eq, type Db } from "@libremod/db";
import { renderCounter } from "@libremod/shared";
import { logger } from "../logger.js";

export function counterValues(guild: Guild) {
  return {
    members: guild.memberCount,
    boosts: guild.premiumSubscriptionCount ?? 0,
    channels: guild.channels.cache.size,
    roles: Math.max(0, guild.roles.cache.size - 1), // ohne @everyone
  };
}

/** Benennt Zähler-Kanäle um, wenn sich der Wert geändert hat. Discord erlaubt nur 2 Umbenennungen pro 10 Minuten. */
export async function updateCounters(client: Client, db: Db, guildId?: string) {
  const rows = guildId
    ? await db.select().from(counterChannels).where(eq(counterChannels.guildId, guildId))
    : await db.select().from(counterChannels);
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channelId);
    if (!channel) {
      await db.delete(counterChannels).where(eq(counterChannels.channelId, row.channelId)); // Kanal wurde gelöscht
      continue;
    }
    const name = renderCounter(row.template, counterValues(guild));
    if (channel.name === name) continue;
    try {
      await channel.setName(name, "Libremod: Zähler");
    } catch (err) {
      logger.warn({ err, guildId: row.guildId, channelId: row.channelId }, "Zähler konnte nicht aktualisiert werden");
    }
  }
}

export function startCounters(client: Client, db: Db): NodeJS.Timeout {
  void updateCounters(client, db).catch(() => {});
  return setInterval(() => void updateCounters(client, db).catch((err) => logger.error({ err }, "Zähler fehlgeschlagen")), 10 * 60_000);
}
