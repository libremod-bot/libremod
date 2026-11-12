import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types.js";
import { describeResult, moderate } from "../../services/actions.js";
import { parseDuration } from "@libremod/shared";
import { inGuild, replyPrivate, resolveTarget, REASON_MAX } from "./shared.js";
import { t } from "@libremod/shared";

const DELETE_CHOICES = [
  { name: "Nichts löschen", value: 0 },
  { name: "Letzte Stunde", value: 60 * 60 },
  { name: "Letzte 24 Stunden", value: 24 * 60 * 60 },
  { name: "Letzte 7 Tage", value: 7 * 24 * 60 * 60 },
];

export const ban: Command = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription(
      "Bannt eine Person, auf Wunsch nur für eine bestimmte Zeit.",
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o
        .setName("person")
        .setDescription(t("Wer gebannt wird (auch ohne Mitgliedschaft)"))
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX),
    )
    .addStringOption((o) =>
      o
        .setName("dauer")
        .setDescription(t("Leer = dauerhaft, sonst z. B. 1d, 1w")),
    )
    .addIntegerOption((o) =>
      o
        .setName("nachrichten_loeschen")
        .setDescription("Nachrichten der Person löschen")
        .addChoices(...DELETE_CHOICES),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;

    const durationInput = interaction.options.getString("dauer");
    const seconds = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && !seconds) {
      return void (await replyPrivate(
        interaction,
        t("Diese Dauer verstehe ich nicht. Beispiele: 12h, 7d, 2w."),
      ));
    }

    const user = interaction.options.getUser("person", true);
    const member = await resolveTarget(interaction, user, {
      mustBeMember: false,
    });
    if (member === undefined) return;

    const existing = await interaction.guild.bans
      .fetch(user.id)
      .catch(() => null);
    if (existing)
      return void (await replyPrivate(
        interaction,
        t("Diese Person ist bereits gebannt."),
      ));

    await interaction.deferReply({ flags: "Ephemeral" });
    const result = await moderate({
      db,
      guild: interaction.guild,
      type: "ban",
      target: user,
      member,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString("grund"),
      durationSeconds: seconds,
      deleteMessageSeconds:
        interaction.options.getInteger("nachrichten_loeschen") ?? 0,
    });
    await replyPrivate(interaction, describeResult(result, user.tag));
  },
};

export const unban: Command = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Hebt den Ban einer Person auf.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o
        .setName("person")
        .setDescription(t("Person oder ihre Nutzer-ID"))
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const user = interaction.options.getUser("person", true);
    const existing = await interaction.guild.bans
      .fetch(user.id)
      .catch(() => null);
    if (!existing)
      return void (await replyPrivate(
        interaction,
        t("Diese Person ist nicht gebannt."),
      ));

    await interaction.deferReply({ flags: "Ephemeral" });
    const result = await moderate({
      db,
      guild: interaction.guild,
      type: "unban",
      target: user,
      moderatorId: interaction.user.id,
      reason: interaction.options.getString("grund"),
    });
    await replyPrivate(interaction, describeResult(result, user.tag));
  },
};
