import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";
import { t } from "@libremod/shared";

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Prüft, ob Libremod erreichbar ist."),
  async execute(interaction) {
    await interaction.reply({
      content: t("Pong! Latenz: {n0} ms", {
        n0: Math.round(interaction.client.ws.ping),
      }),
      flags: "Ephemeral",
    });
  },
};
