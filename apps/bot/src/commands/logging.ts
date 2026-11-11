import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
} from "discord.js";
import { and, eq, logCategory, logChannels, logIgnoredChannels, type LogCategory } from "@libremod/db";
import type { Command } from "./types.js";
import { invalidateLogging, LOG_LABELS } from "../services/logging.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";

const categoryChoices = [
  { name: "Alle Log-Arten", value: "all" },
  ...logCategory.enumValues.map((c) => ({ name: LOG_LABELS[c], value: c })),
];

const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];

export const logging: Command = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Protokolliert Ereignisse auf dem Server in Kanäle deiner Wahl.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("status").setDescription("Zeigt, was wohin geloggt wird."))
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Legt den Kanal für eine Log-Art fest.")
        .addStringOption((o) => o.setName("art").setDescription("Was soll geloggt werden?").setRequired(true).addChoices(...categoryChoices))
        .addChannelOption((o) =>
          o.setName("kanal").setDescription("Wohin").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("off")
        .setDescription("Schaltet eine Log-Art aus.")
        .addStringOption((o) => o.setName("art").setDescription("Welche Log-Art").setRequired(true).addChoices(...categoryChoices)),
    )
    .addSubcommand((s) =>
      s
        .setName("ignore")
        .setDescription("Nachrichten aus einem Kanal oder einer Kategorie nicht loggen (nochmal aufrufen zum Aufheben).")
        .addChannelOption((o) =>
          o
            .setName("kanal")
            .setDescription("Kanal oder Kategorie")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory, ChannelType.GuildVoice, ChannelType.GuildForum),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const pick = (value: string): LogCategory[] => (value === "all" ? [...logCategory.enumValues] : [value as LogCategory]);
    const labels = (cats: LogCategory[]) => (cats.length === logCategory.enumValues.length ? "Alle Log-Arten" : cats.map((c) => LOG_LABELS[c]).join(", "));

    if (sub === "set") {
      const cats = pick(interaction.options.getString("art", true));
      const channel = interaction.options.getChannel("kanal", true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
      const me = interaction.guild?.members.me;
      if (me && !channel.permissionsFor(me).has(NEEDED)) {
        return void (await replyPrivate(
          interaction,
          `In ${channelMention(channel.id)} fehlen mir Rechte. Ich brauche dort: Kanal ansehen, Nachrichten senden, Links einbetten und Dateien anhängen.`,
        ));
      }
      for (const category of cats) {
        await db
          .insert(logChannels)
          .values({ guildId, category, channelId: channel.id })
          .onConflictDoUpdate({ target: [logChannels.guildId, logChannels.category], set: { channelId: channel.id } });
      }
      invalidateLogging(guildId);
      return void (await replyPrivate(interaction, `${labels(cats)}: geht jetzt nach ${channelMention(channel.id)}.`));
    }

    if (sub === "off") {
      const cats = pick(interaction.options.getString("art", true));
      for (const category of cats) {
        await db.delete(logChannels).where(and(eq(logChannels.guildId, guildId), eq(logChannels.category, category)));
      }
      invalidateLogging(guildId);
      return void (await replyPrivate(interaction, `${labels(cats)}: ausgeschaltet.`));
    }

    if (sub === "ignore") {
      const channel = interaction.options.getChannel("kanal", true);
      const removed = await db
        .delete(logIgnoredChannels)
        .where(and(eq(logIgnoredChannels.guildId, guildId), eq(logIgnoredChannels.channelId, channel.id)))
        .returning();
      if (!removed.length) await db.insert(logIgnoredChannels).values({ guildId, channelId: channel.id });
      invalidateLogging(guildId);
      return void (await replyPrivate(
        interaction,
        removed.length
          ? `Nachrichten aus ${channelMention(channel.id)} werden wieder geloggt.`
          : `Nachrichten aus ${channelMention(channel.id)} werden nicht mehr geloggt.`,
      ));
    }

    // status
    const [rows, ignored] = await Promise.all([
      db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
      db.select().from(logIgnoredChannels).where(eq(logIgnoredChannels.guildId, guildId)),
    ]);
    const byCat = new Map(rows.map((r) => [r.category, r.channelId]));
    const lines = [
      ...logCategory.enumValues.map((c) => `**${LOG_LABELS[c]}:** ${byCat.has(c) ? channelMention(byCat.get(c)!) : "aus"}`),
      `**Ignorierte Kanäle:** ${ignored.length ? ignored.map((i) => channelMention(i.channelId)).join(", ") : "keine"}`,
    ];
    return void (await replyPrivate(interaction, lines.join("\n")));
  },
};
