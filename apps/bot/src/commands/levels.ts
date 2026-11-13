import {
  AttachmentBuilder,
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  userMention,
} from "discord.js";
import {
  and,
  desc,
  eq,
  levelSeasons,
  levelSettings,
  memberXp,
} from "@libremod/db";
import { levelProgress, MAX_XP, progressBar } from "@libremod/shared";
import type { Command } from "./types.js";
import { getXp, setXp } from "../services/levels.js";
import { renderRankCard } from "../lib/rankcard.js";
import { logger } from "../logger.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { t } from "@libremod/shared";
import { intlLocale } from "@libremod/shared";

const nf = { format: (n: number | bigint) => new Intl.NumberFormat(intlLocale()).format(n) };

async function loadSettings(
  db: Parameters<Command["execute"]>[1]["db"],
  guildId: string,
) {
  const [s] = await db
    .select()
    .from(levelSettings)
    .where(eq(levelSettings.guildId, guildId));
  return s?.enabled ? s : null;
}

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Zeigt Level und XP.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("mitglied").setDescription(t("Wessen Level? Leer = deins")),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const settings = await loadSettings(db, interaction.guildId);
    if (!settings)
      return void (await replyPrivate(
        interaction,
        t("Das Level-System ist auf diesem Server ausgeschaltet."),
      ));
    const user = interaction.options.getUser("mitglied") ?? interaction.user;
    if (user.bot)
      return void (await replyPrivate(
        interaction,
        t("Bots sammeln keine XP."),
      ));
    await interaction.deferReply();
    const row = await getXp(db, interaction.guildId, user.id);
    const xp = row?.xp ?? 0;
    const p = levelProgress(xp);
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    try {
      const png = await renderRankCard({
        name: member?.displayName ?? user.globalName ?? user.username,
        username: user.username,
        avatarUrl: (member ?? user).displayAvatarURL({
          extension: "png",
          size: 256,
        }),
        level: p.level,
        rank: row ? row.rank : null,
        current: p.current,
        needed: p.needed,
        totalXp: xp,
        color: settings.cardColor,
        season: settings.seasonMode === "off" ? null : settings.seasonNumber,
      });
      return void (await interaction.editReply({
        files: [new AttachmentBuilder(png, { name: "rang.png" })],
        allowedMentions: { parse: [] },
      }));
    } catch (err) {
      logger.warn({ err }, "Rang-Karte konnte nicht gezeichnet werden");
    }
    const embed = new EmbedBuilder()
      .setColor(0x7c5cff)
      .setAuthor({
        name: user.globalName ?? user.username,
        iconURL: user.displayAvatarURL({ size: 64 }),
      })
      .setTitle(t("Level {level}", { level: p.level }))
      .setDescription(
        t("{n0}\n**{n1}** / {n2} XP bis Level {n3}", {
          n0: progressBar(p.current, p.needed),
          n1: nf.format(p.current),
          n2: nf.format(p.needed),
          n3: p.level + 1,
        }),
      )
      .addFields(
        { name: t("Rang"), value: row ? `#${row.rank}` : "–", inline: true },
        { name: t("XP gesamt"), value: nf.format(xp), inline: true },
        {
          name: t("Nachrichten"),
          value: nf.format(row?.messages ?? 0),
          inline: true,
        },
        {
          name: t("Sprachminuten"),
          value: nf.format(row?.voiceMinutes ?? 0),
          inline: true,
        },
      );
    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Die aktivsten Mitglieder nach XP.")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o
        .setName("seite")
        .setDescription(t("Seite (10 pro Seite)"))
        .setMinValue(1)
        .setMaxValue(1000),
    )
    .addIntegerOption((o) =>
      o
        .setName("saison")
        .setDescription(t("Bestenliste einer vergangenen Saison"))
        .setMinValue(1),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const settings = await loadSettings(db, interaction.guildId);
    if (!settings)
      return void (await replyPrivate(
        interaction,
        t("Das Level-System ist auf diesem Server ausgeschaltet."),
      ));
    const medal = ["🥇", "🥈", "🥉"];
    const seasonNo = interaction.options.getInteger("saison");
    if (seasonNo) {
      const [season] = await db
        .select()
        .from(levelSeasons)
        .where(
          and(
            eq(levelSeasons.guildId, interaction.guildId),
            eq(levelSeasons.number, seasonNo),
          ),
        );
      if (!season)
        return void (await replyPrivate(
          interaction,
          t("Saison {seasonNo} ist nicht abgeschlossen oder gab es nicht.", {
            seasonNo,
          }),
        ));
      const lines = season.top.map((tItem, i) =>
        t("{n0} {userId} · Level {level} · {n3} XP", {
          n0: medal[i] ?? `**${i + 1}.**`,
          userId: userMention(tItem.userId),
          level: tItem.level,
          n3: nf.format(tItem.xp),
        }),
      );
      const embed = new EmbedBuilder()
        .setColor(settings.cardColor)
        .setTitle(t("Saison {number} · Endstand", { number: season.number }))
        .setDescription(
          lines.join("\n") || t("In dieser Saison hat niemand XP gesammelt."),
        )
        .addFields({
          name: t("Zeitraum"),
          value: t("{n0} bis {n1}", {
            n0: time(season.startedAt, TimestampStyles.ShortDate),
            n1: time(season.endedAt, TimestampStyles.ShortDate),
          }),
        });
      return void (await interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      }));
    }
    const page = interaction.options.getInteger("seite") ?? 1;
    const rows = await db
      .select()
      .from(memberXp)
      .where(eq(memberXp.guildId, interaction.guildId))
      .orderBy(desc(memberXp.xp))
      .limit(10)
      .offset((page - 1) * 10);
    if (!rows.length)
      return void (await replyPrivate(
        interaction,
        page === 1
          ? t("Noch hat niemand XP gesammelt.")
          : t("Diese Seite ist leer."),
      ));
    const lines = rows.map((r, i) => {
      const pos = (page - 1) * 10 + i + 1;
      return t("{n0} {userId} · Level {level} · {n3} XP", {
        n0: medal[pos - 1] ?? `**${pos}.**`,
        userId: userMention(r.userId),
        level: r.level,
        n3: nf.format(r.xp),
      });
    });
    const embed = new EmbedBuilder()
      .setColor(0x7c5cff)
      .setTitle(
        t("Rangliste von {n0}", {
          n0: interaction.guild?.name ?? t("diesem Server"),
        }),
      )
      .setDescription(lines.join("\n"))
      .setFooter({
        text:
          settings.seasonMode === "off"
            ? t("Seite {page}", { page })
            : t("Seite {page} · Saison {seasonNumber}", {
                page,
                seasonNumber: settings.seasonNumber,
              }),
      });
    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
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
        .setDescription(t("XP hinzufügen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("menge")
            .setDescription(t("Wie viele XP"))
            .setMinValue(1)
            .setMaxValue(1_000_000)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription(t("XP abziehen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("menge")
            .setDescription(t("Wie viele XP"))
            .setMinValue(1)
            .setMaxValue(1_000_000)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription(t("XP auf einen Wert setzen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("menge")
            .setDescription(t("Neuer XP-Stand"))
            .setMinValue(0)
            .setMaxValue(MAX_XP)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription(t("XP eines Mitglieds auf 0 setzen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("mitglied", true);
    if (user.bot)
      return void (await replyPrivate(
        interaction,
        t("Bots sammeln keine XP."),
      ));
    const member = await interaction
      .guild!.members.fetch(user.id)
      .catch(() => null);
    if (!member)
      return void (await replyPrivate(
        interaction,
        t("Diese Person ist nicht auf dem Server."),
      ));

    const current = (await getXp(db, interaction.guildId, user.id))?.xp ?? 0;
    const amount = interaction.options.getInteger("menge") ?? 0;
    const target =
      sub === "add"
        ? current + amount
        : sub === "remove"
          ? current - amount
          : sub === "set"
            ? amount
            : 0;
    const value = await setXp(db, member, target);
    const p = levelProgress(value);
    await replyPrivate(
      interaction,
      t("{id} hat jetzt {n1} XP (Level {level}).", {
        id: userMention(user.id),
        n1: nf.format(value),
        level: p.level,
      }),
    );
  },
};
