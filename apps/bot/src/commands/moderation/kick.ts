import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types.js";
import { describeResult, moderate } from "../../services/actions.js";
import { inGuild, replyPrivate, resolveTarget, REASON_MAX } from "./shared.js";
import { t } from "@libremod/shared";

export const kick: Command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription(
      "Wirft ein Mitglied vom Server. Es kann mit einer Einladung zurückkommen.",
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) =>
      o
        .setName("mitglied")
        .setDescription(t("Wer gekickt wird"))
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const user = interaction.options.getUser("mitglied", true);
    const member = await resolveTarget(interaction, user, {
      mustBeMember: true,
    });
    if (!member) return;

    await interaction.deferReply({ flags: "Ephemeral" });
    const result = await moderate({
      db,
      guild: interaction.guild,
      type: "kick",
      target: user,
      member,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString("grund"),
    });
    await replyPrivate(interaction, describeResult(result, user.tag));
  },
};
