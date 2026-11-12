import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
} from "discord.js";
import {
  and,
  eq,
  logCategory,
  logChannels,
  logIgnoredChannels,
  type LogCategory,
} from "@libremod/db";
import type { Command } from "./types.js";
import { invalidateLogging, LOG_LABELS } from "../services/logging.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { t } from "@libremod/shared";

const categoryChoices = [
  { name: "Alle Log-Arten", value: "all" },
  ...logCategory.enumValues.map((c) => ({ name: t(LOG_LABELS[c]), value: c })),
];

const NEEDED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

export const logging: Command = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription(
      "Protokolliert Ereignisse auf dem Server in Kanäle deiner Wahl.",
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName("status").setDescription(t("Zeigt, was wohin geloggt wird.")),
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription(t("Legt den Kanal für eine Log-Art fest."))
        .addStringOption((o) =>
          o
            .setName("art")
            .setDescription("Was soll geloggt werden?")
            .setRequired(true)
            .addChoices(...categoryChoices),
        )
        .addChannelOption((o) =>
          o
            .setName("kanal")
            .setDescription("Wohin")
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("off")
        .setDescription(t("Schaltet eine Log-Art aus."))
        .addStringOption((o) =>
          o
            .setName("art")
            .setDescription("Welche Log-Art")
            .setRequired(true)
            .addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("ignore")
        .setDescription(
          t(
            "Nachrichten aus einem Kanal oder einer Kategorie nicht loggen (nochmal aufrufen zum Aufheben).",
          ),
        )
        .addChannelOption((o) =>
          o
            .setName("kanal")
            .setDescription(t("Kanal oder Kategorie"))
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildCategory,
              ChannelType.GuildVoice,
              ChannelType.GuildForum,
            ),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const pick = (value: string): LogCategory[] =>
      value === "all" ? [...logCategory.enumValues] : [value as LogCategory];
    const labels = (cats: LogCategory[]) =>
      cats.length === logCategory.enumValues.length
        ? t("Alle Log-Arten")
        : cats.map((c) => t(LOG_LABELS[c])).join(", ");

    if (sub === "set") {
      const cats = pick(interaction.options.getString("art", true));
      const channel = interaction.options.getChannel("kanal", true, [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
      ]);
      const me = interaction.guild?.members.me;
      if (me && !channel.permissionsFor(me).has(NEEDED)) {
        return void (await replyPrivate(
          interaction,
          t(
            "In {id} fehlen mir Rechte. Ich brauche dort: Kanal ansehen, Nachrichten senden, Links einbetten und Dateien anhängen.",
            { id: channelMention(channel.id) },
          ),
        ));
      }
      for (const category of cats) {
        await db
          .insert(logChannels)
          .values({ guildId, category, channelId: channel.id })
          .onConflictDoUpdate({
            target: [logChannels.guildId, logChannels.category],
            set: { channelId: channel.id },
          });
      }
      invalidateLogging(guildId);
      return void (await replyPrivate(
        interaction,
        t("{cats}: geht jetzt nach {id}.", {
          cats: labels(cats),
          id: channelMention(channel.id),
        }),
      ));
    }

    if (sub === "off") {
      const cats = pick(interaction.options.getString("art", true));
      for (const category of cats) {
        await db
          .delete(logChannels)
          .where(
            and(
              eq(logChannels.guildId, guildId),
              eq(logChannels.category, category),
            ),
          );
      }
      invalidateLogging(guildId);
      return void (await replyPrivate(
        interaction,
        t("{cats}: ausgeschaltet.", { cats: labels(cats) }),
      ));
    }

    if (sub === "ignore") {
      const channel = interaction.options.getChannel("kanal", true);
      const removed = await db
        .delete(logIgnoredChannels)
        .where(
          and(
            eq(logIgnoredChannels.guildId, guildId),
            eq(logIgnoredChannels.channelId, channel.id),
          ),
        )
        .returning();
      if (!removed.length)
        await db
          .insert(logIgnoredChannels)
          .values({ guildId, channelId: channel.id });
      invalidateLogging(guildId);
      return void (await replyPrivate(
        interaction,
        removed.length
          ? t("Nachrichten aus {id} werden wieder geloggt.", {
              id: channelMention(channel.id),
            })
          : t("Nachrichten aus {id} werden nicht mehr geloggt.", {
              id: channelMention(channel.id),
            }),
      ));
    }

    // status
    const [rows, ignored] = await Promise.all([
      db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
      db
        .select()
        .from(logIgnoredChannels)
        .where(eq(logIgnoredChannels.guildId, guildId)),
    ]);
    const byCat = new Map(rows.map((r) => [r.category, r.channelId]));
    const lines = [
      ...logCategory.enumValues.map(
        (c) =>
          `**${t(LOG_LABELS[c])}:** ${byCat.has(c) ? channelMention(byCat.get(c)!) : t("aus")}`,
      ),
      t("**Ignorierte Kanäle:** {n0}", {
        n0: ignored.length
          ? ignored.map((i) => channelMention(i.channelId)).join(", ")
          : "keine",
      }),
    ];
    return void (await replyPrivate(interaction, lines.join("\n")));
  },
};
