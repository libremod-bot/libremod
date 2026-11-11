import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes, type Interaction } from "discord.js";
import { commands } from "../commands/index.js";
import type { CommandContext } from "../commands/types.js";
import { logger } from "../logger.js";
import { handlePanelInteraction, isPanelInteraction } from "../services/rolepanels.js";
import { handleCustomCommand } from "../services/customcommands.js";
import { handleTicketInteraction, isTicketInteraction } from "../services/tickets.js";

export async function onInteractionCreate(interaction: Interaction, ctx: CommandContext) {
  if ((interaction.isButton() || interaction.isStringSelectMenu()) && isPanelInteraction(interaction.customId)) {
    await handlePanelInteraction(interaction, ctx.db).catch(async (err) => {
      logger.error({ err }, "Rollen-Panel fehlgeschlagen");
      if (interaction.deferred) await interaction.editReply("Da ist leider etwas schiefgelaufen.").catch(() => {});
    });
    return;
  }
  if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && isTicketInteraction(interaction.customId)) {
    await handleTicketInteraction(interaction, ctx.db).catch(async (err) => {
      logger.error({ err }, "Ticket-Aktion fehlgeschlagen");
      const content = "Da ist leider etwas schiefgelaufen.";
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content, components: [] }).catch(() => {});
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    });
    return;
  }
  if (interaction.isAutocomplete()) {
    await commands
      .get(interaction.commandName)
      ?.autocomplete?.(interaction, ctx)
      .catch((err) => logger.warn({ err, command: interaction.commandName }, "Autovervollständigung fehlgeschlagen"));
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) {
    await handleCustomCommand(interaction, ctx.db).catch((err) => logger.error({ err, command: interaction.commandName }, "Eigener Befehl fehlgeschlagen"));
    return;
  }

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
