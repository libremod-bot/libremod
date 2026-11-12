import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { and, count, eq, quotes, sql, type Db, type Quote } from "@libremod/db";
import { MAX_QUOTE_LENGTH, quoteEmbed } from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { saveQuote } from "../services/extras.js";
import { t } from "@libremod/shared";

export interface ContextMenu {
  data: ContextMenuCommandBuilder;
  execute(
    interaction: MessageContextMenuCommandInteraction,
    ctx: { db: Db },
  ): Promise<void>;
}

const show = (q: Quote) => ({
  embeds: [new EmbedBuilder(quoteEmbed(q))],
  allowedMentions: { parse: [] as never[] },
});

export const quote: Command = {
  data: new SlashCommandBuilder()
    .setName("quote")
    .setDescription("Zitate speichern und wieder hervorholen.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription(
          t(
            "Speichert ein Zitat. Tipp: Rechtsklick auf eine Nachricht → Apps → Als Zitat speichern.",
          ),
        )
        .addStringOption((o) =>
          o
            .setName("text")
            .setDescription(t("Was wurde gesagt?"))
            .setRequired(true)
            .setMaxLength(MAX_QUOTE_LENGTH),
        )
        .addUserOption((o) =>
          o.setName("von").setDescription(t("Wer hat es gesagt?")),
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription(
              t("Oder ein Name, z. B. für Leute außerhalb des Servers"),
            )
            .setMaxLength(80),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("random")
        .setDescription(t("Zeigt ein zufälliges Zitat."))
        .addUserOption((o) =>
          o.setName("von").setDescription(t("Nur Zitate dieser Person")),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription(t("Zeigt ein bestimmtes Zitat."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Nummer des Zitats"))
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription(
          t("Löscht ein Zitat (eigene oder mit „Nachrichten verwalten“)."),
        )
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Nummer des Zitats"))
            .setRequired(true)
            .setMinValue(1),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const user = interaction.options.getUser("von");
      const name = interaction.options.getString("name")?.trim() || null;
      const row = await saveQuote(db, {
        guildId,
        text: interaction.options.getString("text", true).trim(),
        authorId: user?.id ?? null,
        authorName: user ? null : name,
        savedBy: interaction.user.id,
        channelId: null,
        messageId: null,
      });
      return void (await interaction.reply({
        content: t("Gespeichert als Zitat #{number}.", { number: row!.number }),
        ...show(row!),
      }));
    }

    if (sub === "random") {
      const user = interaction.options.getUser("von");
      const where = user
        ? and(eq(quotes.guildId, guildId), eq(quotes.authorId, user.id))
        : eq(quotes.guildId, guildId);
      const [row] = await db
        .select()
        .from(quotes)
        .where(where)
        .orderBy(sql`random()`)
        .limit(1);
      if (!row)
        return void (await replyPrivate(
          interaction,
          user
            ? t("Von dieser Person gibt es noch keine Zitate.")
            : t("Noch keine Zitate gespeichert. Leg mit /quote add los."),
        ));
      return void (await interaction.reply(show(row)));
    }

    const number = interaction.options.getInteger("nummer", true);
    const [row] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.guildId, guildId), eq(quotes.number, number)));
    if (!row)
      return void (await replyPrivate(
        interaction,
        t("Zitat #{number} gibt es nicht.", { number }),
      ));
    if (sub === "show") return void (await interaction.reply(show(row)));

    const mayDelete =
      row.savedBy === interaction.user.id ||
      row.authorId === interaction.user.id ||
      interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
    if (!mayDelete)
      return void (await replyPrivate(
        interaction,
        t(
          "Löschen dürfen nur, wer es gespeichert hat, wer zitiert wurde, und das Team.",
        ),
      ));
    await db.delete(quotes).where(eq(quotes.id, row.id));
    await replyPrivate(
      interaction,
      t("Zitat #{number} ist gelöscht.", { number }),
    );
  },
};

export const saveQuoteMenu: ContextMenu = {
  data: new ContextMenuCommandBuilder()
    .setName("Als Zitat speichern")
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const msg = interaction.targetMessage;
    const text = msg.content.trim();
    if (!text)
      return void (await interaction.reply({
        content: t(
          "Diese Nachricht hat keinen Text, den ich speichern könnte.",
        ),
        flags: MessageFlags.Ephemeral,
      }));
    if (msg.author.bot)
      return void (await interaction.reply({
        content: t("Nachrichten von Bots speichere ich nicht als Zitat."),
        flags: MessageFlags.Ephemeral,
      }));
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(quotes)
      .where(eq(quotes.guildId, interaction.guildId));
    if (n >= 10_000)
      return void (await interaction.reply({
        content: t("Mehr als 10.000 Zitate gehen nicht."),
        flags: MessageFlags.Ephemeral,
      }));
    const row = await saveQuote(db, {
      guildId: interaction.guildId,
      text:
        text.length > MAX_QUOTE_LENGTH
          ? `${text.slice(0, MAX_QUOTE_LENGTH - 1)}…`
          : text,
      authorId: msg.author.id,
      authorName: null,
      savedBy: interaction.user.id,
      channelId: msg.channelId,
      messageId: msg.id,
    });
    if (!row)
      return void (await interaction.reply({
        content: t("Diese Nachricht ist schon als Zitat gespeichert."),
        flags: MessageFlags.Ephemeral,
      }));
    await interaction.reply({
      content: t("<@{id}> hat Zitat #{number} gespeichert.", {
        id: interaction.user.id,
        number: row.number,
      }),
      ...show(row),
    });
  },
};
