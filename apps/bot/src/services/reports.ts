import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  userMention,
  type ButtonInteraction,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Db } from "@libremod/db";
import { t } from "@libremod/shared";
import { logger } from "../logger.js";
import { moderationBlocker } from "../lib/permissions.js";
import { moderate } from "./actions.js";
import { getSettings } from "./cases.js";

/**
 * „Nachricht melden“: Mitglieder melden eine Nachricht per Rechtsklick, das Team bekommt sie mit
 * Knöpfen zum Löschen, Verwarnen und Abhaken in den Melde-Kanal (sonst ins Mod-Log).
 */

const PREFIX = "lmrp";
export const isReportInteraction = (customId: string) => customId.startsWith(`${PREFIX}:`);

/** Höchstens so viele Meldungen pro Person in 10 Minuten. */
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();
const reported = new Set<string>();

setInterval(() => {
  const now = Date.now();
  for (const [k, list] of recent) {
    const keep = list.filter((at) => now - at < WINDOW_MS);
    if (keep.length) recent.set(k, keep);
    else recent.delete(k);
  }
  if (reported.size > 10_000) reported.clear();
}, 60_000).unref();

function allow(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return false;
  list.push(now);
  recent.set(userId, list);
  return true;
}

async function reportChannel(db: Db, guildId: string) {
  const s = await getSettings(db, guildId);
  return s.reportChannelId ?? s.modLogChannelId;
}

/** Schritt 1: Rechtsklick → kurzes Formular für den Grund. */
export async function startReport(interaction: MessageContextMenuCommandInteraction, db: Db) {
  if (!interaction.inCachedGuild()) return;
  const msg = interaction.targetMessage;
  const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (msg.author.id === interaction.user.id) return void (await fail(t("Deine eigene Nachricht kannst du nicht melden.")));
  if (msg.author.bot || msg.webhookId) return void (await fail(t("Nachrichten von Bots kannst du nicht melden.")));
  if (!(await reportChannel(db, interaction.guildId)))
    return void (await fail(t("Auf diesem Server ist das Melden noch nicht eingerichtet. Sag am besten direkt dem Team Bescheid.")));
  if (reported.has(`${interaction.user.id}:${msg.id}`)) return void (await fail(t("Diese Nachricht hast du schon gemeldet. Danke!")));

  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}:modal:${msg.channelId}:${msg.id}`)
    .setTitle(t("Nachricht melden"))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel(t("Was ist das Problem?"))
          .setPlaceholder(t("z. B. Beleidigung, Spam, Betrug …"))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
  await interaction.showModal(modal);
}

/** Schritt 2: Formular abgeschickt → Meldung ans Team. */
async function submitReport(interaction: ModalSubmitInteraction<"cached">, db: Db, channelId: string, messageId: string) {
  const done = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const key = `${interaction.user.id}:${messageId}`;
  if (reported.has(key)) return void (await done(t("Diese Nachricht hast du schon gemeldet. Danke!")));
  if (!allow(interaction.user.id)) return void (await done(t("Du hast gerade sehr viele Meldungen geschickt. Versuch es in ein paar Minuten noch einmal.")));

  const source = await interaction.guild.channels.fetch(channelId).catch(() => null);
  const msg = source?.isTextBased() ? await source.messages.fetch(messageId).catch(() => null) : null;
  if (!msg) return void (await done(t("Die Nachricht gibt es nicht mehr.")));
  const targetId = await reportChannel(db, interaction.guildId);
  const target = targetId ? await interaction.guild.channels.fetch(targetId).catch(() => null) : null;
  if (!target?.isSendable()) return void (await done(t("Der Melde-Kanal ist nicht erreichbar. Sag am besten direkt dem Team Bescheid.")));

  const reason = interaction.fields.getTextInputValue("reason").trim();
  const attachments = [...msg.attachments.values()].map((a) => a.name).join(", ");
  const embed = new EmbedBuilder()
    .setColor(0xe1a33b)
    .setTitle(t("Gemeldete Nachricht"))
    .setURL(msg.url)
    .addFields(
      { name: t("Verfasst von"), value: `${userMention(msg.author.id)} (${msg.author.id})`, inline: true },
      { name: t("Gemeldet von"), value: `${userMention(interaction.user.id)}`, inline: true },
      { name: t("Kanal"), value: `<#${msg.channelId}>`, inline: true },
      { name: t("Inhalt"), value: (msg.content || t("(kein Text)")).slice(0, 1000) },
    )
    .setTimestamp();
  if (attachments) embed.addFields({ name: t("Anhänge"), value: attachments.slice(0, 1000) });
  if (reason) embed.addFields({ name: t("Grund der Meldung"), value: reason.slice(0, 1000) });

  const id = `${msg.channelId}:${msg.id}:${msg.author.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:del:${id}`).setLabel(t("Nachricht löschen")).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${PREFIX}:warn:${id}`).setLabel(t("Verwarnen")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:done:${id}`).setLabel(t("Erledigt")).setStyle(ButtonStyle.Success),
  );
  await target.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  reported.add(key);
  await done(t("Danke! Das Team schaut sich die Nachricht an."));
}

/** Knöpfe in der Meldung. */
async function handleButton(interaction: ButtonInteraction<"cached">, db: Db, action: string, channelId: string, messageId: string, authorId: string) {
  const perms = interaction.memberPermissions;
  const need = action === "warn" ? PermissionFlagsBits.ModerateMembers : PermissionFlagsBits.ManageMessages;
  if (!perms.has(need)) return void (await interaction.reply({ content: t("Dafür fehlen dir die Rechte."), flags: MessageFlags.Ephemeral }));

  let note: string;
  if (action === "del") {
    const source = await interaction.guild.channels.fetch(channelId).catch(() => null);
    const msg = source?.isTextBased() ? await source.messages.fetch(messageId).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
    note = msg ? t("🗑️ gelöscht von {tag}", { tag: interaction.user.tag }) : t("🗑️ war schon gelöscht ({tag})", { tag: interaction.user.tag });
  } else if (action === "warn") {
    const member = await interaction.guild.members.fetch(authorId).catch(() => null);
    const blocker = member ? moderationBlocker(interaction.member, member) : null;
    if (blocker) return void (await interaction.reply({ content: blocker, flags: MessageFlags.Ephemeral }));
    const user = member?.user ?? (await interaction.client.users.fetch(authorId).catch(() => null));
    if (!user) return void (await interaction.reply({ content: t("Die Person gibt es nicht mehr."), flags: MessageFlags.Ephemeral }));
    const res = await moderate({
      db,
      guild: interaction.guild,
      type: "warn",
      target: user,
      member,
      moderatorId: interaction.user.id,
      reason: t("Gemeldete Nachricht"),
    });
    note = t("⚠️ verwarnt von {tag} (Fall #{n})", { tag: interaction.user.tag, n: res.case.caseNumber });
  } else {
    note = t("✅ erledigt von {tag}", { tag: interaction.user.tag });
  }

  const old = interaction.message.embeds[0];
  const prev = old?.footer?.text ? `${old.footer.text} · ` : "";
  const embed = (old ? EmbedBuilder.from(old) : new EmbedBuilder()).setFooter({ text: (prev + note).slice(0, 2000) });
  if (action === "done") embed.setColor(0x2e9e6a);
  const components =
    action === "done"
      ? []
      : interaction.message.components
          .map((row) => row.toJSON() as { type: number; components: { custom_id?: string }[] })
          .map((row) => ({ ...row, components: row.components.filter((b) => !b.custom_id?.startsWith(`${PREFIX}:${action}:`)) }))
          .filter((row) => row.components.length)
          .map((row) => new ActionRowBuilder<ButtonBuilder>(row as never));
  await interaction.update({ embeds: [embed], components });
}

export async function handleReportInteraction(interaction: ButtonInteraction | ModalSubmitInteraction, db: Db) {
  if (!interaction.inCachedGuild()) return;
  const [, action, channelId, messageId, authorId] = interaction.customId.split(":");
  if (!channelId || !messageId) return;
  try {
    if (action === "modal" && interaction.isModalSubmit()) await submitReport(interaction, db, channelId, messageId);
    else if (interaction.isButton() && authorId) await handleButton(interaction, db, action!, channelId, messageId, authorId);
  } catch (err) {
    logger.error({ err }, "Meldung fehlgeschlagen");
    if (!interaction.replied && !interaction.deferred)
      await interaction.reply({ content: t("Da ist leider etwas schiefgelaufen."), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
