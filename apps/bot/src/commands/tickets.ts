import { ChannelType, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { and, eq, ticketCategories, ticketSettings } from "@libremod/db";
import { ticketChannelName } from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { claimTicket, closeTicket, isStaff, ticketForChannel } from "../services/tickets.js";

export const ticket: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Das Ticket in diesem Kanal verwalten.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription("Ticket schließen.")
        .addStringOption((o) => o.setName("grund").setDescription("Warum?").setMaxLength(500)),
    )
    .addSubcommand((s) => s.setName("claim").setDescription("Ticket übernehmen (Team)."))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Jemanden zum Ticket hinzufügen (Team).")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Jemanden aus dem Ticket entfernen (Team).")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("rename")
        .setDescription("Ticket umbenennen (Team).")
        .addStringOption((o) => o.setName("name").setDescription("Neuer Name").setMaxLength(90).setRequired(true)),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const t = await ticketForChannel(db, interaction.channelId);
    if (!t) return void (await replyPrivate(interaction, "Das geht nur in einem offenen Ticket."));
    const [category] = t.categoryId
      ? await db.select().from(ticketCategories).where(and(eq(ticketCategories.id, t.categoryId), eq(ticketCategories.guildId, t.guildId)))
      : [];
    const staff = isStaff(interaction.member, category ?? null);
    const sub = interaction.options.getSubcommand();
    const channel = interaction.channel!;

    if (sub === "close") {
      const [s] = await db.select().from(ticketSettings).where(eq(ticketSettings.guildId, t.guildId));
      const ownerOk = (s?.ownerCanClose ?? true) && interaction.user.id === t.ownerId;
      if (!staff && !ownerOk) return void (await replyPrivate(interaction, "Nur das Team kann dieses Ticket schließen."));
      await interaction.reply({ content: "Ticket wird geschlossen …", flags: MessageFlags.Ephemeral });
      await closeTicket(interaction.client, db, t, interaction.user, interaction.options.getString("grund"));
      return;
    }
    if (sub === "claim") return claimTicket(interaction, db, t, staff);
    if (!staff) return void (await replyPrivate(interaction, "Das kann nur das Team."));

    if (sub === "rename") {
      const name = ticketChannelName(interaction.options.getString("name", true), { number: t.number, username: "", category: "" });
      await channel.edit({ name });
      return void (await replyPrivate(interaction, `Umbenannt in **${name}**.`));
    }

    const user = interaction.options.getUser("mitglied", true);
    if (user.bot) return void (await replyPrivate(interaction, "Bots kann ich nicht hinzufügen."));
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
      await interaction.reply({ content: `➕ ${user.toString()} wurde zum Ticket hinzugefügt.`, allowedMentions: { users: [user.id] } });
      return;
    }
    if (sub === "remove") {
      if (user.id === t.ownerId) return void (await replyPrivate(interaction, "Die Person, die das Ticket geöffnet hat, bleibt drin."));
      if (channel.isThread()) await channel.members.remove(user.id);
      else if (channel.type === ChannelType.GuildText) await channel.permissionOverwrites.delete(user.id);
      await interaction.reply({ content: `➖ ${user.toString()} wurde aus dem Ticket entfernt.`, allowedMentions: { parse: [] } });
    }
  },
};

