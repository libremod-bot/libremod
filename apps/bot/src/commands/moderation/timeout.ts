import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { describeResult, moderate } from "../../services/actions.js";
import { MAX_TIMEOUT_SECONDS, parseDuration } from "@libremod/shared";
import { inGuild, replyPrivate, resolveTarget, REASON_MAX } from "./shared.js";

export const timeout: Command = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Schaltet ein Mitglied für eine Zeit stumm.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("mitglied").setDescription("Wer stummgeschaltet wird").setRequired(true))
    .addStringOption((o) =>
      o.setName("dauer").setDescription("z. B. 10m, 2h, 1d (höchstens 28 Tage)").setRequired(true),
    )
    .addStringOption((o) => o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const seconds = parseDuration(interaction.options.getString("dauer", true));
    if (!seconds) return void (await replyPrivate(interaction, "Diese Dauer verstehe ich nicht. Beispiele: 10m, 2h, 1d12h."));
    if (seconds > MAX_TIMEOUT_SECONDS) return void (await replyPrivate(interaction, "Discord erlaubt Timeouts von höchstens 28 Tagen."));

    const user = interaction.options.getUser("mitglied", true);
    const member = await resolveTarget(interaction, user, { mustBeMember: true });
    if (!member) return;

    await interaction.deferReply({ flags: "Ephemeral" });
    const result = await moderate({
      db,
      guild: interaction.guild,
      type: "timeout",
      target: user,
      member,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString("grund"),
      durationSeconds: seconds,
    });
    await replyPrivate(interaction, describeResult(result, user.tag));
  },
};

export const untimeout: Command = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Hebt den Timeout eines Mitglieds auf.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("mitglied").setDescription("Wessen Timeout aufgehoben wird").setRequired(true))
    .addStringOption((o) => o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const user = interaction.options.getUser("mitglied", true);
    const member = await resolveTarget(interaction, user, { mustBeMember: true });
    if (!member) return;
    if (!member.isCommunicationDisabled()) return void (await replyPrivate(interaction, "Dieses Mitglied hat gerade keinen Timeout."));

    await interaction.deferReply({ flags: "Ephemeral" });
    const result = await moderate({
      db,
      guild: interaction.guild,
      type: "untimeout",
      target: user,
      member,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString("grund"),
    });
    await replyPrivate(interaction, describeResult(result, user.tag));
  },
};
