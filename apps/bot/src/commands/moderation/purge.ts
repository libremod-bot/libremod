import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
  userMention,
} from "discord.js";
import type { Command } from "../types.js";
import { getSettings } from "../../services/cases.js";
import { inGuild, replyPrivate } from "./shared.js";
import { logger } from "../../logger.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export const purge: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Löscht die letzten Nachrichten in diesem Kanal.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("anzahl").setDescription("Wie viele Nachrichten durchsucht werden (1–100)").setMinValue(1).setMaxValue(100).setRequired(true),
    )
    .addUserOption((o) => o.setName("nur_von").setDescription("Nur Nachrichten dieser Person löschen")),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const channel = interaction.channel;
    if (!channel || channel.type === ChannelType.GuildVoice || !("bulkDelete" in channel)) {
      return void (await replyPrivate(interaction, "In diesem Kanal kann ich keine Nachrichten löschen."));
    }

    await interaction.deferReply({ flags: "Ephemeral" });
    const amount = interaction.options.getInteger("anzahl", true);
    const onlyFrom = interaction.options.getUser("nur_von");

    const fetched = await channel.messages.fetch({ limit: amount });
    const cutoff = Date.now() - FOURTEEN_DAYS_MS;
    const toDelete = fetched.filter(
      (m) => m.createdTimestamp > cutoff && !m.pinned && (!onlyFrom || m.author.id === onlyFrom.id),
    );
    const deleted = toDelete.size ? await channel.bulkDelete(toDelete, true) : toDelete;

    const skipped = fetched.size - deleted.size;
    let text = `${deleted.size} Nachricht(en) gelöscht.`;
    if (skipped > 0) text += ` ${skipped} übersprungen (angepinnt, älter als 14 Tage oder von anderen Personen).`;
    await replyPrivate(interaction, text);

    const settings = await getSettings(db, interaction.guildId);
    if (!settings.modLogChannelId || deleted.size === 0) return;
    const log = await interaction.guild.channels.fetch(settings.modLogChannelId).catch(() => null);
    if (!log?.isSendable()) return;
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle("Nachrichten gelöscht")
      .addFields(
        { name: "Kanal", value: channelMention(channel.id), inline: true },
        { name: "Moderator", value: userMention(interaction.user.id), inline: true },
        { name: "Anzahl", value: String(deleted.size), inline: true },
      )
      .setTimestamp();
    if (onlyFrom) embed.addFields({ name: "Nur von", value: userMention(onlyFrom.id) });
    await log.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => logger.warn({ err }, "Mod-Log fehlgeschlagen"));
  },
};
