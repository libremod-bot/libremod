import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes, type Interaction } from "discord.js";
import { commands } from "../commands/index.js";
import type { CommandContext } from "../commands/types.js";
import { logger } from "../logger.js";

export async function onInteractionCreate(interaction: Interaction, ctx: CommandContext) {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, ctx);
  } catch (err) {
    const missingPermissions = err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.MissingPermissions;
    if (!missingPermissions) logger.error({ err, command: interaction.commandName }, "Befehl fehlgeschlagen");
    const content = missingPermissions
      ? "Mir fehlt dafür eine Berechtigung auf diesem Server. Prüfe meine Rolle und ihre Rechte."
      : "Da ist leider etwas schiefgelaufen.";
    const reply = { content, flags: MessageFlags.Ephemeral } as const;
    if (interaction.deferred) await interaction.editReply(content).catch(() => {});
    else if (interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}
