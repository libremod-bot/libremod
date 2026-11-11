import { createHash } from "node:crypto";
import {
  ApplicationCommandType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { and, customCommands, eq, sql, type Db } from "@libremod/db";
import { pickResponse, renderTemplate } from "@libremod/shared";
import { config } from "../config.js";
import { commandBodies } from "../commands/index.js";
import { logger } from "../logger.js";

/** Was zuletzt pro Server bei Discord registriert wurde, damit nur Änderungen übertragen werden. */
const synced = new Map<string, string>();
const pending = new Map<string, NodeJS.Timeout>();

/**
 * Registriert die eigenen Befehle eines Servers als Slash-Befehle dieses Servers.
 * Auf dem Entwicklungsserver gehören die eingebauten Befehle mit dazu, weil dort alles servergebunden ist.
 */
export async function syncGuildCommands(client: Client, db: Db, guildId: string, { force = false } = {}) {
  if (!client.application || !client.guilds.cache.has(guildId)) return;
  const rows = await db.select().from(customCommands).where(eq(customCommands.guildId, guildId)).orderBy(customCommands.name);
  const custom = rows.map((c) => ({
    name: c.name,
    description: c.description,
    type: ApplicationCommandType.ChatInput,
    contexts: [InteractionContextType.Guild],
  }));
  const body = guildId === config.DISCORD_DEV_GUILD_ID ? [...commandBodies(), ...custom] : custom;
  const hash = createHash("sha1").update(JSON.stringify(body)).digest("hex");
  // Noch nie synchronisiert und nichts zu tun: Discord nicht unnötig fragen.
  if (!force && (synced.get(guildId) ?? (custom.length ? "" : hash)) === hash) return;
  try {
    await client.application.commands.set(body, guildId);
    synced.set(guildId, hash);
    logger.info({ guildId, count: custom.length }, "Eigene Befehle registriert");
  } catch (err) {
    logger.warn({ err, guildId }, "Eigene Befehle konnten nicht registriert werden");
  }
}

/** Nach Änderungen im Dashboard: kurz warten, damit mehrere Änderungen zusammen übertragen werden. */
export function scheduleCommandSync(client: Client, db: Db, guildId: string) {
  clearTimeout(pending.get(guildId));
  pending.set(
    guildId,
    setTimeout(() => {
      pending.delete(guildId);
      void syncGuildCommands(client, db, guildId);
    }, 2000),
  );
}

/** Beim Start alle Server mit eigenen Befehlen abgleichen. */
export async function syncAllCommands(client: Client, db: Db) {
  const guilds = await db.selectDistinct({ guildId: customCommands.guildId }).from(customCommands);
  for (const { guildId } of guilds) await syncGuildCommands(client, db, guildId, { force: true });
}

export async function handleCustomCommand(interaction: ChatInputCommandInteraction, db: Db): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const [cmd] = await db
    .select()
    .from(customCommands)
    .where(and(eq(customCommands.guildId, interaction.guildId), eq(customCommands.name, interaction.commandName)));
  if (!cmd) {
    await interaction.reply({ content: "Diesen Befehl gibt es nicht mehr.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const text = renderTemplate(pickResponse(cmd.responses), {
    user: `<@${interaction.user.id}>`,
    username: interaction.member.displayName,
    server: interaction.guild.name,
    membercount: interaction.guild.memberCount,
  });
  const flags = cmd.ephemeral ? MessageFlags.Ephemeral : undefined;
  if (cmd.embed) {
    const embed = new EmbedBuilder().setColor(cmd.embedColor ?? 0x4cb4ff).setDescription(text.slice(0, 4000) || "​");
    if (cmd.embedTitle) embed.setTitle(cmd.embedTitle);
    await interaction.reply({ embeds: [embed], flags, allowedMentions: { parse: [] } });
  } else {
    await interaction.reply({ content: text.slice(0, 2000) || "​", flags, allowedMentions: { parse: [] } });
  }
  await db.update(customCommands).set({ uses: sql`${customCommands.uses} + 1` }).where(eq(customCommands.id, cmd.id));
  return true;
}
