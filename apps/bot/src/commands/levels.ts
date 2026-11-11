import { EmbedBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, userMention } from "discord.js";
import { desc, eq, levelSettings, memberXp } from "@libremod/db";
import { levelProgress, MAX_XP, progressBar } from "@libremod/shared";
import type { Command } from "./types.js";
import { getXp, setXp } from "../services/levels.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";

const nf = new Intl.NumberFormat("de-DE");

async function levelsEnabled(db: Parameters<Command["execute"]>[1]["db"], guildId: string) {
  const [s] = await db.select({ enabled: levelSettings.enabled }).from(levelSettings).where(eq(levelSettings.guildId, guildId));
  return s?.enabled ?? false;
}

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Zeigt Level und XP.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName("mitglied").setDescription("Wessen Level? Leer = deins")),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    if (!(await levelsEnabled(db, interaction.guildId))) {
      return void (await replyPrivate(interaction, "Das Level-System ist auf diesem Server ausgeschaltet."));
    }
    const user = interaction.options.getUser("mitglied") ?? interaction.user;
    if (user.bot) return void (await replyPrivate(interaction, "Bots sammeln keine XP."));
    const row = await getXp(db, interaction.guildId, user.id);
    const xp = row?.xp ?? 0;
    const p = levelProgress(xp);
    const embed = new EmbedBuilder()
      .setColor(0x7c5cff)
      .setAuthor({ name: user.globalName ?? user.username, iconURL: user.displayAvatarURL({ size: 64 }) })
      .setTitle(`Level ${p.level}`)
      .setDescription(`${progressBar(p.current, p.needed)}\n**${nf.format(p.current)}** / ${nf.format(p.needed)} XP bis Level ${p.level + 1}`)
      .addFields(
        { name: "Rang", value: row ? `#${row.rank}` : "–", inline: true },
        { name: "XP gesamt", value: nf.format(xp), inline: true },
        { name: "Nachrichten", value: nf.format(row?.messages ?? 0), inline: true },
        { name: "Sprachminuten", value: nf.format(row?.voiceMinutes ?? 0), inline: true },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Die aktivsten Mitglieder nach XP.")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName("seite").setDescription("Seite (10 pro Seite)").setMinValue(1).setMaxValue(1000)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    if (!(await levelsEnabled(db, interaction.guildId))) {
      return void (await replyPrivate(interaction, "Das Level-System ist auf diesem Server ausgeschaltet."));
    }
    const page = interaction.options.getInteger("seite") ?? 1;
    const rows = await db
      .select()
      .from(memberXp)
      .where(eq(memberXp.guildId, interaction.guildId))
      .orderBy(desc(memberXp.xp))
      .limit(10)
      .offset((page - 1) * 10);
    if (!rows.length) return void (await replyPrivate(interaction, page === 1 ? "Noch hat niemand XP gesammelt." : "Diese Seite ist leer."));
    const medal = ["🥇", "🥈", "🥉"];
    const lines = rows.map((r, i) => {
      const pos = (page - 1) * 10 + i + 1;
      return `${medal[pos - 1] ?? `**${pos}.**`} ${userMention(r.userId)} · Level ${r.level} · ${nf.format(r.xp)} XP`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x7c5cff)
      .setTitle(`Rangliste von ${interaction.guild?.name ?? "diesem Server"}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: `Seite ${page}` });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const xp: Command = {
  data: new SlashCommandBuilder()
    .setName("xp")
    .setDescription("XP von Mitgliedern verwalten.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("XP hinzufügen.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true))
        .addIntegerOption((o) => o.setName("menge").setDescription("Wie viele XP").setMinValue(1).setMaxValue(1_000_000).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("XP abziehen.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true))
        .addIntegerOption((o) => o.setName("menge").setDescription("Wie viele XP").setMinValue(1).setMaxValue(1_000_000).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("XP auf einen Wert setzen.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true))
        .addIntegerOption((o) => o.setName("menge").setDescription("Neuer XP-Stand").setMinValue(0).setMaxValue(MAX_XP).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("XP eines Mitglieds auf 0 setzen.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Wer").setRequired(true)),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("mitglied", true);
    if (user.bot) return void (await replyPrivate(interaction, "Bots sammeln keine XP."));
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!member) return void (await replyPrivate(interaction, "Diese Person ist nicht auf dem Server."));

    const current = (await getXp(db, interaction.guildId, user.id))?.xp ?? 0;
    const amount = interaction.options.getInteger("menge") ?? 0;
    const target = sub === "add" ? current + amount : sub === "remove" ? current - amount : sub === "set" ? amount : 0;
    const value = await setXp(db, member, target);
    const p = levelProgress(value);
    await replyPrivate(interaction, `${userMention(user.id)} hat jetzt ${nf.format(value)} XP (Level ${p.level}).`);
  },
};
