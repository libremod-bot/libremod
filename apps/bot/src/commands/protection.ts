import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  userMention,
} from "discord.js";
import { and, count, desc, eq, gte, memberNotes, modCases, sql } from "@libremod/db";
import { MAX_LOCK_SECONDS, parseDuration } from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { completeVerification, isLockable, loadVerification, lockChannel, lockServer, unlockChannel, unlockServer } from "../services/protection.js";

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const LOCK_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum] as const;

// =============== /verify ===============

export const verify: Command = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verifiziert ein Mitglied von Hand.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) => o.setName("mitglied").setDescription("Wen verifizieren?").setRequired(true)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await loadVerification(db, interaction.guildId);
    if (!s?.enabled || !s.roleId) return void (await replyPrivate(interaction, "Die Verifizierung ist aus. Einschalten geht im Dashboard unter „Verifizierung“."));
    const user = interaction.options.getUser("mitglied", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return void (await replyPrivate(interaction, "Diese Person ist nicht auf dem Server."));
    if (member.roles.cache.has(s.roleId)) return void (await replyPrivate(interaction, `${userMention(user.id)} ist schon verifiziert.`));
    await completeVerification(member, db, s, interaction.user.id);
    await replyPrivate(interaction, `${userMention(user.id)} ist jetzt verifiziert.`);
  },
};

// =============== /lockdown und /unlock ===============

function readUntil(input: string | null): Date | null | "invalid" {
  if (!input) return null;
  const seconds = parseDuration(input);
  if (!seconds || seconds < 60 || seconds > MAX_LOCK_SECONDS) return "invalid";
  return new Date(Date.now() + seconds * 1000);
}

export const lockdown: Command = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Sperrt Kanäle, sodass niemand ohne Sonderrechte schreiben kann.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Sperrt einen Kanal.")
        .addChannelOption((o) => o.setName("kanal").setDescription("Welcher Kanal? Leer = dieser").addChannelTypes(...LOCK_CHANNEL_TYPES))
        .addStringOption((o) => o.setName("dauer").setDescription("Automatisch wieder öffnen nach, z. B. 30m, 2h").setMaxLength(20))
        .addStringOption((o) => o.setName("grund").setDescription("Wird im Kanal angezeigt").setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName("server")
        .setDescription("Sperrt alle Kanäle, in denen gerade alle schreiben dürfen.")
        .addStringOption((o) => o.setName("dauer").setDescription("Automatisch wieder öffnen nach, z. B. 30m, 2h").setMaxLength(20))
        .addStringOption((o) => o.setName("grund").setDescription("Wird in den Kanälen angezeigt").setMaxLength(500)),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const until = readUntil(interaction.options.getString("dauer"));
    if (until === "invalid") return void (await replyPrivate(interaction, "Bitte eine Dauer zwischen 1 Minute und 30 Tagen angeben, z. B. `30m` oder `2h`."));
    const input = { lockedBy: interaction.user.id, reason: interaction.options.getString("grund"), until };
    const untilText = until ? ` bis ${time(until, TimestampStyles.ShortTime)} (${time(until, TimestampStyles.RelativeTime)})` : "";

    if (interaction.options.getSubcommand() === "channel") {
      const picked = interaction.options.getChannel("kanal");
      const channel = picked ? interaction.guild.channels.cache.get(picked.id) : interaction.channel;
      if (!channel || !isLockable(channel) || !("permissionOverwrites" in channel)) {
        return void (await replyPrivate(interaction, "Diesen Kanal kann ich nicht sperren. Es gehen Text-, Ankündigungs- und Forenkanäle."));
      }
      const done = await lockChannel(channel, db, input);
      return void (await replyPrivate(interaction, done ? `<#${channel.id}> ist gesperrt${untilText}.` : `<#${channel.id}> ist schon gesperrt.`));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await lockServer(interaction.guild, db, input);
    const parts = [`🔒 ${r.locked} ${r.locked === 1 ? "Kanal" : "Kanäle"} gesperrt${untilText}.`];
    if (r.failed) parts.push(`${r.failed} konnte ich nicht sperren. Mir fehlt dort wohl das Recht „Berechtigungen verwalten“.`);
    if (!r.locked && !r.failed) parts.push("Es gab keinen offenen Kanal zum Sperren.");
    parts.push("Aufheben mit `/unlock server`.");
    await interaction.editReply(parts.join("\n"));
  },
};

export const unlock: Command = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Hebt eine Sperre auf.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Öffnet einen gesperrten Kanal wieder.")
        .addChannelOption((o) => o.setName("kanal").setDescription("Welcher Kanal? Leer = dieser").addChannelTypes(...LOCK_CHANNEL_TYPES)),
    )
    .addSubcommand((s) => s.setName("server").setDescription("Hebt den Server-Lockdown auf.")),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    if (interaction.options.getSubcommand() === "channel") {
      const id = interaction.options.getChannel("kanal")?.id ?? interaction.channelId;
      const done = await unlockChannel(interaction.guild, db, id, interaction.user.id);
      return void (await replyPrivate(interaction, done ? `<#${id}> ist wieder offen.` : `<#${id}> war nicht von Libremod gesperrt.`));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const n = await unlockServer(interaction.guild, db, interaction.user.id);
    await interaction.editReply(n ? `🔓 ${n} ${n === 1 ? "Kanal ist" : "Kanäle sind"} wieder offen.` : "Es gab keinen Server-Lockdown.");
  },
};

// =============== /note ===============

export const MAX_NOTES_PER_MEMBER = 50;

export const note: Command = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Notizen zu Mitgliedern, die nur das Team sieht.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Schreibt eine Notiz.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Zu wem?").setRequired(true))
        .addStringOption((o) => o.setName("text").setDescription("Die Notiz").setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("Zeigt die Notizen zu einem Mitglied.")
        .addUserOption((o) => o.setName("mitglied").setDescription("Zu wem?").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Löscht eine Notiz.")
        .addIntegerOption((o) => o.setName("nummer").setDescription("Nummer der Notiz (steht bei /note list)").setRequired(true).setMinValue(1)),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const user = interaction.options.getUser("mitglied", true);
      const [n] = await db.select({ n: count() }).from(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.userId, user.id)));
      if ((n?.n ?? 0) >= MAX_NOTES_PER_MEMBER) return void (await replyPrivate(interaction, `Zu dieser Person gibt es schon ${MAX_NOTES_PER_MEMBER} Notizen. Lösche erst alte.`));
      const [row] = await db
        .insert(memberNotes)
        .values({ guildId, userId: user.id, authorId: interaction.user.id, text: interaction.options.getString("text", true) })
        .returning();
      return void (await replyPrivate(interaction, `Notiz #${row!.id} zu ${userMention(user.id)} gespeichert.`));
    }

    if (sub === "list") {
      const user = interaction.options.getUser("mitglied", true);
      const rows = await db
        .select()
        .from(memberNotes)
        .where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.userId, user.id)))
        .orderBy(desc(memberNotes.createdAt))
        .limit(15);
      if (!rows.length) return void (await replyPrivate(interaction, `Zu ${userMention(user.id)} gibt es keine Notizen.`));
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: `Notizen zu ${user.tag}`, iconURL: user.displayAvatarURL() })
        .setDescription(
          clip(rows.map((r) => `**#${r.id}** · ${time(r.createdAt, TimestampStyles.ShortDate)} · von ${userMention(r.authorId)}\n${clip(r.text, 300)}`).join("\n\n"), 4000),
        );
      return void (await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
    }

    const id = interaction.options.getInteger("nummer", true);
    const gone = await db.delete(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.id, id))).returning();
    await replyPrivate(interaction, gone.length ? `Notiz #${id} ist gelöscht.` : `Notiz #${id} gibt es auf diesem Server nicht.`);
  },
};

// =============== /modstats ===============

export const modstats: Command = {
  data: new SlashCommandBuilder()
    .setName("modstats")
    .setDescription("Wer im Team wie viele Fälle bearbeitet hat.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((o) => o.setName("tage").setDescription("Zeitraum in Tagen (Standard 30)").setMinValue(1).setMaxValue(365)),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const days = interaction.options.getInteger("tage") ?? 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await db
      .select({
        moderatorId: modCases.moderatorId,
        total: count(),
        warns: sql<number>`count(*) filter (where ${modCases.type} = 'warn')`.mapWith(Number),
        timeouts: sql<number>`count(*) filter (where ${modCases.type} = 'timeout')`.mapWith(Number),
        kicks: sql<number>`count(*) filter (where ${modCases.type} = 'kick')`.mapWith(Number),
        bans: sql<number>`count(*) filter (where ${modCases.type} = 'ban')`.mapWith(Number),
      })
      .from(modCases)
      .where(and(eq(modCases.guildId, interaction.guildId), eq(modCases.automatic, false), gte(modCases.createdAt, since)))
      .groupBy(modCases.moderatorId)
      .orderBy(desc(count()))
      .limit(15);
    if (!rows.length) return void (await replyPrivate(interaction, `In den letzten ${days} Tagen gab es keine Fälle.`));
    const lines = rows.map(
      (r, i) => `**${i + 1}.** ${userMention(r.moderatorId)} · **${r.total}** (⚠️ ${r.warns} · ⏳ ${r.timeouts} · 👢 ${r.kicks} · 🔨 ${r.bans})`,
    );
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Team-Statistik · ${days === 1 ? "letzter Tag" : `letzte ${days} Tage`}`).setDescription(lines.join("\n"))],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
