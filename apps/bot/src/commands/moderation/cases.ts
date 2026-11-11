import {
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
} from "discord.js";
import { and, count, eq, memberNotes } from "@libremod/db";
import type { Command } from "../types.js";
import {
  countActiveWarnings,
  deactivateCase,
  getCase,
  getSettings,
  listCases,
  updateCaseReason,
} from "../../services/cases.js";
import { CASE_LABELS, caseEmbed, postModLog } from "../../services/modlog.js";
import { inGuild, replyPrivate, REASON_MAX } from "./shared.js";

export const cases: Command = {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("Zeigt die Fallakte einer Person.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("person").setDescription("Wessen Fallakte").setRequired(true)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const user = interaction.options.getUser("person", true);
    const [list, warnings, [notes]] = await Promise.all([
      listCases(db, interaction.guildId, user.id),
      countActiveWarnings(db, interaction.guildId, user.id),
      db.select({ n: count() }).from(memberNotes).where(and(eq(memberNotes.guildId, interaction.guildId), eq(memberNotes.userId, user.id))),
    ]);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `Fallakte von ${user.tag}`, iconURL: user.displayAvatarURL() })
      .setFooter({ text: `Aktive Verwarnungen: ${warnings}${notes?.n ? ` · Team-Notizen: ${notes.n} (/note list)` : ""}` });

    embed.setDescription(
      list.length
        ? list
            .map((c) => {
              const flag = !c.active && (c.type === "warn" || c.type === "ban") ? " ~~inaktiv~~" : "";
              const reason = (c.reason || "Kein Grund").slice(0, 80);
              return `**#${c.caseNumber}** ${CASE_LABELS[c.type]}${flag} · ${time(c.createdAt, "d")}\n${reason}`;
            })
            .join("\n\n")
        : "Keine Einträge. Eine weiße Weste!",
    );
    await interaction.reply({ embeds: [embed], flags: "Ephemeral" });
  },
};

export const caseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Einzelne Fälle ansehen und bearbeiten.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Zeigt einen Fall.")
        .addIntegerOption((o) => o.setName("nummer").setDescription("Fallnummer").setMinValue(1).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("reason")
        .setDescription("Ändert den Grund eines Falls.")
        .addIntegerOption((o) => o.setName("nummer").setDescription("Fallnummer").setMinValue(1).setRequired(true))
        .addStringOption((o) => o.setName("grund").setDescription("Neuer Grund").setRequired(true).setMaxLength(REASON_MAX)),
    )
    .addSubcommand((s) =>
      s
        .setName("revoke")
        .setDescription("Nimmt eine Verwarnung zurück. Sie zählt dann nicht mehr für Verwarnungsstufen.")
        .addIntegerOption((o) => o.setName("nummer").setDescription("Fallnummer").setMinValue(1).setRequired(true)),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const number = interaction.options.getInteger("nummer", true);
    const existing = await getCase(db, interaction.guildId, number);
    if (!existing) return void (await replyPrivate(interaction, `Fall #${number} gibt es nicht.`));

    switch (interaction.options.getSubcommand()) {
      case "show":
        await interaction.reply({ embeds: [caseEmbed(existing)], flags: "Ephemeral" });
        return;
      case "reason": {
        const updated = await updateCaseReason(db, interaction.guildId, number, interaction.options.getString("grund", true));
        await interaction.reply({ content: "Grund geändert.", embeds: [caseEmbed(updated!)], flags: "Ephemeral" });
        return;
      }
      case "revoke": {
        if (existing.type !== "warn") return void (await replyPrivate(interaction, "Zurücknehmen geht nur bei Verwarnungen."));
        if (!existing.active) return void (await replyPrivate(interaction, "Diese Verwarnung ist bereits zurückgenommen."));
        const updated = await deactivateCase(db, interaction.guildId, number);
        await replyPrivate(interaction, `Verwarnung #${number} zurückgenommen.`);
        const settings = await getSettings(db, interaction.guildId);
        await postModLog(interaction.guild, settings.modLogChannelId, updated!, `Zurückgenommen von <@${interaction.user.id}>`);
        return;
      }
    }
  },
};
