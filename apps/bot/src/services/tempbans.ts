import { RESTJSONErrorCodes, DiscordAPIError, type Client } from "discord.js";
import { and, eq, lte, modCases, type Db } from "@libremod/db";
import { logger } from "../logger.js";
import { createCase, getSettings } from "./cases.js";
import { postModLog } from "./modlog.js";
import { t } from "@libremod/shared";
import { inGuildLocale } from "../i18n.js";

const INTERVAL_MS = 60_000;

/** Hebt abgelaufene befristete Bans auf. Läuft jede Minute. */
export async function liftExpiredBans(client: Client, db: Db) {
  const expired = await db
    .select()
    .from(modCases)
    .where(
      and(
        eq(modCases.type, "ban"),
        eq(modCases.active, true),
        lte(modCases.expiresAt, new Date()),
      ),
    );

  for (const ban of expired) {
    await inGuildLocale(ban.guildId, async () => {
      const guild = client.guilds.cache.get(ban.guildId);
      if (!guild) return; // Bot ist nicht (mehr) auf dem Server oder er ist nicht geladen

      try {
        await guild.bans.remove(
          ban.targetId,
          t("Befristeter Ban aus Fall #{caseNumber} ist abgelaufen", {
            caseNumber: ban.caseNumber,
          }),
        );
      } catch (err) {
        const alreadyUnbanned =
          err instanceof DiscordAPIError &&
          err.code === RESTJSONErrorCodes.UnknownBan;
        if (!alreadyUnbanned) {
          logger.warn(
            { err, guildId: ban.guildId, case: ban.caseNumber },
            "Befristeter Ban konnte nicht aufgehoben werden",
          );
          return;
        }
      }

      await db
        .update(modCases)
        .set({ active: false })
        .where(eq(modCases.id, ban.id));
      const unban = await createCase(db, {
        guildId: ban.guildId,
        type: "unban",
        targetId: ban.targetId,
        moderatorId: client.user!.id,
        reason: t("Befristeter Ban aus Fall #{caseNumber} ist abgelaufen", {
          caseNumber: ban.caseNumber,
        }),
        automatic: true,
      });
      const settings = await getSettings(db, ban.guildId);
      await postModLog(guild, settings.modLogChannelId, unban);
    });
  }
}

export function startTempBanScheduler(client: Client, db: Db) {
  const run = () =>
    liftExpiredBans(client, db).catch((err) =>
      logger.error({ err }, "Prüfung befristeter Bans fehlgeschlagen"),
    );
  void run();
  return setInterval(run, INTERVAL_MS);
}
