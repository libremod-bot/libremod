import type { Guild } from "discord.js";
import { guildSettings } from "@libremod/db";
import type { CommandContext } from "../commands/types.js";
import { logger } from "../logger.js";
import { invalidateLocale, localeFromDiscord } from "../i18n.js";

/** Legt beim Beitritt zu einem Server die Standard-Einstellungen an. */
export async function onGuildCreate(guild: Guild, { db }: CommandContext) {
  await db
    .insert(guildSettings)
    .values({
      guildId: guild.id,
      locale: localeFromDiscord(guild.preferredLocale),
    })
    .onConflictDoNothing();
  invalidateLocale(guild.id);
  logger.info({ guildId: guild.id, name: guild.name }, "Server beigetreten");
}
