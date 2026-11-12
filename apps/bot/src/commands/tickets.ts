import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { and, eq, ticketCategories, ticketSettings } from "@libremod/db";
import { ticketChannelName } from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import {
  claimTicket,
  closeTicket,
  isStaff,
  ticketForChannel,
} from "../services/tickets.js";
import { t } from "@libremod/shared";

export const ticket: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Das Ticket in diesem Kanal verwalten.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription(t("Ticket schließen."))
        .addStringOption((o) =>
          o.setName("grund").setDescription(t("Warum?")).setMaxLength(500),
        ),
    )
    .addSubcommand((s) =>
      s.setName("claim").setDescription(t("Ticket übernehmen (Team).")),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription(t("Jemanden zum Ticket hinzufügen (Team)."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription(t("Jemanden aus dem Ticket entfernen (Team)."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("rename")
        .setDescription(t("Ticket umbenennen (Team)."))
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription(t("Neuer Name"))
            .setMaxLength(90)
            .setRequired(true),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const tItem = await ticketForChannel(db, interaction.channelId);
    if (!tItem)
      return void (await replyPrivate(
        interaction,
        t("Das geht nur in einem offenen Ticket."),
      ));
    const [category] = tItem.categoryId
      ? await db
          .select()
          .from(ticketCategories)
          .where(
            and(
              eq(ticketCategories.id, tItem.categoryId),
              eq(ticketCategories.guildId, tItem.guildId),
            ),
          )
      : [];
    const staff = isStaff(interaction.member, category ?? null);
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel!;

    if (sub === "close") {
      const [s] = await db
        .select()
        .from(ticketSettings)
        .where(eq(ticketSettings.guildId, tItem.guildId));
      const ownerOk =
        (s?.ownerCanClose ?? true) && interaction.user.id === tItem.ownerId;
      if (!staff && !ownerOk)
        return void (await replyPrivate(
          interaction,
          t("Nur das Team kann dieses Ticket schließen."),
        ));
      await interaction.reply({
        content: t("Ticket wird geschlossen …"),
        flags: MessageFlags.Ephemeral,
      });
      await closeTicket(
        interaction.client,
        db,
        tItem,
        interaction.user,
        interaction.options.getString("grund"),
      );
      return;
    }
    if (sub === "claim") return claimTicket(interaction, db, tItem, staff);
    if (!staff)
      return void (await replyPrivate(
        interaction,
        t("Das kann nur das Team."),
      ));

    if (sub === "rename") {
      const name = ticketChannelName(
        interaction.options.getString("name", true),
        { number: tItem.number, username: "", category: "" },
      );
      await channel.edit({ name });
      return void (await replyPrivate(
        interaction,
        t("Umbenannt in **{name}**.", { name }),
      ));
    }

    const user = interaction.options.getUser("mitglied", true);
    if (user.bot)
      return void (await replyPrivate(
        interaction,
        t("Bots kann ich nicht hinzufügen."),
      ));
    if (sub === "add") {
      if (channel.isThread()) await channel.members.add(user.id);
      else if (channel.type === ChannelType.GuildText)
        await channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        });
      await interaction.reply({
        content: t("➕ {n0} wurde zum Ticket hinzugefügt.", {
          n0: user.toString(),
        }),
        allowedMentions: { users: [user.id] },
      });
      return;
    }
    if (sub === "remove") {
      if (user.id === tItem.ownerId)
        return void (await replyPrivate(
          interaction,
          t("Die Person, die das Ticket geöffnet hat, bleibt drin."),
        ));
      if (channel.isThread()) await channel.members.remove(user.id);
      else if (channel.type === ChannelType.GuildText)
        await channel.permissionOverwrites.delete(user.id);
      await interaction.reply({
        content: t("➖ {n0} wurde aus dem Ticket entfernt.", {
          n0: user.toString(),
        }),
        allowedMentions: { parse: [] },
      });
    }
  },
};
