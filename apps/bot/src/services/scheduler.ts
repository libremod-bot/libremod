import { DiscordAPIError, RESTJSONErrorCodes, type Client } from "discord.js";
import { and, eq, lte, scheduledMessages, type Db } from "@libremod/db";
import { buildEmbedJson, nextRun, toSchedule } from "@libremod/shared";
import { logger } from "../logger.js";
import { inGuildLocale } from "../i18n.js";

class ChannelGone extends Error {}

/** Postet fällige Nachrichten. Verpasste Termine (Bot war offline) werden einmal nachgeholt, nicht mehrfach. */
export async function runDueMessages(client: Client, db: Db, now = new Date()) {
  const due = await db
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.enabled, true),
        lte(scheduledMessages.nextRunAt, now),
      ),
    )
    .limit(25);

  for (const m of due) {
    await inGuildLocale(m.guildId, async () => {
      if (!client.guilds.cache.has(m.guildId)) return;
      // Termin zuerst weiterschieben (nur wenn noch unverändert), damit nichts doppelt gepostet wird.
      const claimed = await db
        .update(scheduledMessages)
        .set({ nextRunAt: nextRun(toSchedule(m), now), lastRunAt: now })
        .where(
          and(
            eq(scheduledMessages.id, m.id),
            eq(scheduledMessages.nextRunAt, m.nextRunAt),
          ),
        )
        .returning();
      if (!claimed.length) return;

      try {
        const channel = await client.channels.fetch(m.channelId);
        if (
          !channel?.isSendable() ||
          !("guildId" in channel) ||
          channel.guildId !== m.guildId
        )
          throw new ChannelGone();
        if (m.embed) {
          await channel.send({
            embeds: [
              buildEmbedJson(m.design, m.content, {
                defaults: { title: m.embedTitle ?? undefined },
              }),
            ],
          });
        } else {
          await channel.send({ content: m.content.slice(0, 2000) });
        }
      } catch (err) {
        const gone =
          err instanceof ChannelGone ||
          (err instanceof DiscordAPIError &&
            (err.code === RESTJSONErrorCodes.UnknownChannel ||
              err.code === RESTJSONErrorCodes.MissingAccess));
        if (gone)
          await db
            .update(scheduledMessages)
            .set({ enabled: false })
            .where(eq(scheduledMessages.id, m.id));
        logger.warn(
          { err, id: m.id, guildId: m.guildId },
          gone
            ? "Geplante Nachricht deaktiviert: Kanal fehlt"
            : "Geplante Nachricht fehlgeschlagen",
        );
      }
    });
  }
}

export function startScheduler(client: Client, db: Db): NodeJS.Timeout {
  return setInterval(
    () =>
      void runDueMessages(client, db).catch((err) =>
        logger.error({ err }, "Zeitplan fehlgeschlagen"),
      ),
    30_000,
  );
}
