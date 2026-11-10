import type { Interaction } from "discord.js";
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
    logger.error({ err, command: interaction.commandName }, "Befehl fehlgeschlagen");
    const reply = { content: "Da ist leider etwas schiefgelaufen.", flags: "Ephemeral" as const };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}
