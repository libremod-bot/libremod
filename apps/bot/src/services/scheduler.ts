import { DiscordAPIError, EmbedBuilder, RESTJSONErrorCodes, type Client } from "discord.js";
import { and, eq, lte, scheduledMessages, type Db } from "@libremod/db";
import { nextRun, toSchedule } from "@libremod/shared";
import { logger } from "../logger.js";

class ChannelGone extends Error {}

/** Postet fällige Nachrichten. Verpasste Termine (Bot war offline) werden einmal nachgeholt, nicht mehrfach. */
export async function runDueMessages(client: Client, db: Db, now = new Date()) {
  const due = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.enabled, true), lte(scheduledMessages.nextRunAt, now)))
    .limit(25);

  for (const m of due) {
    if (!client.guilds.cache.has(m.guildId)) continue;
    // Termin zuerst weiterschieben (nur wenn noch unverändert), damit nichts doppelt gepostet wird.
    const claimed = await db
      .update(scheduledMessages)
      .set({ nextRunAt: nextRun(toSchedule(m), now), lastRunAt: now })
      .where(and(eq(scheduledMessages.id, m.id), eq(scheduledMessages.nextRunAt, m.nextRunAt)))
      .returning();
    if (!claimed.length) continue;

    try {
      const channel = await client.channels.fetch(m.channelId);
      if (!channel?.isSendable() || !("guildId" in channel) || channel.guildId !== m.guildId) throw new ChannelGone();
      if (m.embed) {
        const embed = new EmbedBuilder().setColor(0x4cb4ff).setDescription(m.content.slice(0, 4000));
        if (m.embedTitle) embed.setTitle(m.embedTitle);
        await channel.send({ embeds: [embed] });
      } else {
        await channel.send({ content: m.content.slice(0, 2000) });
      }
    } catch (err) {
      const gone =
        err instanceof ChannelGone ||
        (err instanceof DiscordAPIError && (err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.MissingAccess));
      if (gone) await db.update(scheduledMessages).set({ enabled: false }).where(eq(scheduledMessages.id, m.id));
      logger.warn({ err, id: m.id, guildId: m.guildId }, gone ? "Geplante Nachricht deaktiviert: Kanal fehlt" : "Geplante Nachricht fehlgeschlagen");
    }
  }
}

export function startScheduler(client: Client, db: Db): NodeJS.Timeout {
  return setInterval(() => void runDueMessages(client, db).catch((err) => logger.error({ err }, "Zeitplan fehlgeschlagen")), 30_000);
}
