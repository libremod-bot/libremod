import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Prüft, ob Libremod erreichbar ist."),
  async execute(interaction) {
    await interaction.reply({
      content: `Pong! Latenz: ${Math.round(interaction.client.ws.ping)} ms`,
      flags: "Ephemeral",
    });
  },
};
