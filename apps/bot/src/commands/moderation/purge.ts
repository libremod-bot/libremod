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
import { t } from "@libremod/shared";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export const purge: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Löscht die letzten Nachrichten in diesem Kanal.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("anzahl")
        .setDescription(t("Wie viele Nachrichten durchsucht werden (1–100)"))
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((o) =>
      o
        .setName("nur_von")
        .setDescription(t("Nur Nachrichten dieser Person löschen")),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const channel = interaction.channel;
    if (
      !channel ||
      channel.type === ChannelType.GuildVoice ||
      !("bulkDelete" in channel)
    ) {
      return void (await replyPrivate(
        interaction,
        t("In diesem Kanal kann ich keine Nachrichten löschen."),
      ));
    }

    await interaction.deferReply({ flags: "Ephemeral" });
    const amount = interaction.options.getInteger("anzahl", true);
    const onlyFrom = interaction.options.getUser("nur_von");

    const fetched = await channel.messages.fetch({ limit: amount });
    const cutoff = Date.now() - FOURTEEN_DAYS_MS;
    const toDelete = fetched.filter(
      (m) =>
        m.createdTimestamp > cutoff &&
        !m.pinned &&
        (!onlyFrom || m.author.id === onlyFrom.id),
    );
    const deleted = toDelete.size
      ? await channel.bulkDelete(toDelete, true)
      : toDelete;

    const skipped = fetched.size - deleted.size;
    let text = t("{size} Nachricht(en) gelöscht.", { size: deleted.size });
    if (skipped > 0)
      text += t(
        " {skipped} übersprungen (angepinnt, älter als 14 Tage oder von anderen Personen).",
        { skipped },
      );
    await replyPrivate(interaction, text);

    const settings = await getSettings(db, interaction.guildId);
    if (!settings.modLogChannelId || deleted.size === 0) return;
    const log = await interaction.guild.channels
      .fetch(settings.modLogChannelId)
      .catch(() => null);
    if (!log?.isSendable()) return;
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(t("Nachrichten gelöscht"))
      .addFields(
        { name: t("Kanal"), value: channelMention(channel.id), inline: true },
        {
          name: t("Moderator"),
          value: userMention(interaction.user.id),
          inline: true,
        },
        { name: t("Anzahl"), value: String(deleted.size), inline: true },
      )
      .setTimestamp();
    if (onlyFrom)
      embed.addFields({ name: t("Nur von"), value: userMention(onlyFrom.id) });
    await log
      .send({ embeds: [embed], allowedMentions: { parse: [] } })
      .catch((err) => logger.warn({ err }, "Mod-Log fehlgeschlagen"));
  },
};
