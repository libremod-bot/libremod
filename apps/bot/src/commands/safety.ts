import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type User,
} from "discord.js";
import { extractLinks, isOfficialDomain, isShortener, MAX_MASS_TARGETS, MAX_TIMEOUT_SECONDS, parseDuration, parseUserIds } from "@libremod/shared";
import type { Command, CommandContext } from "./types.js";
import { inGuild, replyPrivate, REASON_MAX, type GuildInteraction } from "./moderation/shared.js";
import { moderationBlocker } from "../lib/permissions.js";
import { moderate } from "../services/actions.js";
import { logger } from "../logger.js";
import type { ContextMenu } from "./extras.js";
import { shortLinkTargets, updatePhishingLists } from "../services/phishing.js";
import { invalidateAutomod } from "../services/automod.js";

type MassType = "ban" | "kick" | "timeout";

const VERB: Record<MassType, { label: string; done: string }> = {
  ban: { label: "bannen", done: "gebannt" },
  kick: { label: "kicken", done: "gekickt" },
  timeout: { label: "stummschalten", done: "stummgeschaltet" },
};

const MAX_JOIN_WINDOW = 7 * 24 * 60 * 60;

function build(type: MassType) {
  const b = new SlashCommandBuilder()
    .setName(`mass${type}`)
    .setDescription(`Mehrere Personen auf einmal ${VERB[type].label}, z. B. nach einem Raid.`)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(type === "ban" ? PermissionFlagsBits.BanMembers : type === "kick" ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.ModerateMembers)
    .addStringOption((o) => o.setName("personen").setDescription("Erwähnungen oder Nutzer-IDs, getrennt durch Leerzeichen").setMaxLength(4000))
    .addStringOption((o) => o.setName("beigetreten").setDescription("Alle, die in dieser Zeit beigetreten sind, z. B. 10m oder 2h").setMaxLength(10));
  if (type === "timeout") b.addStringOption((o) => o.setName("dauer").setDescription("Wie lange? z. B. 1h, 1d (höchstens 28 Tage)").setRequired(true).setMaxLength(10));
  b.addStringOption((o) => o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX));
  if (type === "ban") {
    b.addIntegerOption((o) =>
      o
        .setName("nachrichten_loeschen")
        .setDescription("Nachrichten der Personen löschen")
        .addChoices({ name: "Nichts löschen", value: 0 }, { name: "Letzte Stunde", value: 3600 }, { name: "Letzte 24 Stunden", value: 86400 }, { name: "Letzte 7 Tage", value: 604800 }),
    );
  }
  return b;
}

async function run(type: MassType, interaction: GuildInteraction, { db }: CommandContext) {
  const ids = parseUserIds(interaction.options.getString("personen") ?? "");
  const windowInput = interaction.options.getString("beigetreten");
  const windowSeconds = windowInput ? parseDuration(windowInput) : null;
  if (windowInput && (!windowSeconds || windowSeconds > MAX_JOIN_WINDOW)) {
    return void (await replyPrivate(interaction, "Bei „beigetreten“ geht eine Zeit bis 7 Tage, z. B. `15m` oder `2h`."));
  }
  if (!ids.length && !windowSeconds) return void (await replyPrivate(interaction, "Gib Personen an oder eine Zeit bei „beigetreten“."));
  let seconds: number | null = null;
  if (type === "timeout") {
    seconds = parseDuration(interaction.options.getString("dauer", true));
    if (!seconds || seconds < 60 || seconds > MAX_TIMEOUT_SECONDS) return void (await replyPrivate(interaction, "Bitte eine Dauer zwischen 1 Minute und 28 Tagen, z. B. `1h`."));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const targets = new Map<string, { user: User; member: GuildMember | null }>();
  if (windowSeconds) {
    const since = Date.now() - windowSeconds * 1000;
    const all = await guild.members.fetch();
    for (const m of all.values()) if (!m.user.bot && (m.joinedTimestamp ?? 0) >= since) targets.set(m.id, { user: m.user, member: m });
  }
  const missing: string[] = [];
  for (const id of ids) {
    if (targets.has(id)) continue;
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) targets.set(id, { user: member.user, member });
    else if (type === "ban") {
      const user = await interaction.client.users.fetch(id).catch(() => null);
      if (user) targets.set(id, { user, member: null });
      else missing.push(id);
    } else missing.push(id);
  }
  if (targets.size > MAX_MASS_TARGETS) {
    return void (await interaction.editReply(`Das wären ${targets.size} Personen. Mehr als ${MAX_MASS_TARGETS} auf einmal gehen nicht, bitte grenze die Auswahl ein.`));
  }

  const skipped: string[] = [];
  const ready: { user: User; member: GuildMember | null }[] = [];
  for (const t of targets.values()) {
    if (t.member) {
      const blocker = moderationBlocker(interaction.member, t.member);
      if (blocker) {
        skipped.push(`<@${t.user.id}>: ${blocker}`);
        continue;
      }
      if (type === "timeout" && t.member.permissions.has(PermissionFlagsBits.Administrator)) {
        skipped.push(`<@${t.user.id}>: Admins kann man nicht stummschalten.`);
        continue;
      }
    } else if (t.user.id === interaction.user.id) continue;
    ready.push(t);
  }
  if (type === "ban") {
    const bans = await guild.bans.fetch().catch(() => null);
    for (let i = ready.length - 1; i >= 0; i--) if (bans?.has(ready[i]!.user.id)) ready.splice(i, 1);
  }
  if (!ready.length) {
    const why = [...skipped, ...missing.map((id) => `${id}: nicht gefunden`)].slice(0, 15).join("\n");
    return void (await interaction.editReply({ content: `Niemand übrig, den ich ${VERB[type].label} könnte.${why ? `\n${why}` : ""}`, allowedMentions: { parse: [] } }));
  }

  const preview = ready.slice(0, 30).map((t) => `<@${t.user.id}>`).join(" ");
  const more = ready.length > 30 ? ` und ${ready.length - 30} weitere` : "";
  const notes = [skipped.length ? `${skipped.length} übersprungen (Rolle zu hoch o. Ä.)` : "", missing.length ? `${missing.length} nicht gefunden` : ""].filter(Boolean).join(", ");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mass:yes").setLabel(`${ready.length} ${ready.length === 1 ? "Person" : "Personen"} ${VERB[type].label}`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mass:no").setLabel("Abbrechen").setStyle(ButtonStyle.Secondary),
  );
  const ask = await interaction.editReply({
    content: `Wirklich ${VERB[type].label}?\n${preview}${more}${notes ? `\n\n${notes}` : ""}`,
    components: [row],
    allowedMentions: { parse: [] },
  });
  const click = await ask
    .awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 60_000 })
    .catch(() => null);
  if (!click || click.customId !== "mass:yes") {
    return void (await interaction.editReply({ content: click ? "Abgebrochen, nichts passiert." : "Keine Bestätigung, nichts passiert.", components: [] }));
  }
  await click.update({ content: `Läuft … 0 von ${ready.length}`, components: [] });

  const reason = interaction.options.getString("grund") ? `${interaction.options.getString("grund")} (Massenaktion)` : "Massenaktion";
  let ok = 0;
  const failed: string[] = [];
  for (const [i, t] of ready.entries()) {
    try {
      await moderate({
        db,
        guild,
        type,
        target: t.user,
        member: t.member,
        moderatorId: interaction.user.id,
        reason,
        durationSeconds: seconds,
        deleteMessageSeconds: interaction.options.getInteger("nachrichten_loeschen") ?? 0,
      });
      ok++;
    } catch (err) {
      logger.warn({ err, guildId: guild.id, target: t.user.id }, "Massenaktion: eine Person übersprungen");
      failed.push(`<@${t.user.id}>`);
    }
    if ((i + 1) % 10 === 0 && i + 1 < ready.length) await interaction.editReply(`Läuft … ${i + 1} von ${ready.length}`).catch(() => {});
  }
  await interaction.editReply({
    content: `Fertig: ${ok} ${ok === 1 ? "Person" : "Personen"} ${VERB[type].done}.${failed.length ? `\nNicht geklappt: ${failed.join(" ")}` : ""}${notes ? `\n${notes}` : ""}`,
    allowedMentions: { parse: [] },
  });
}

const make = (type: MassType): Command => ({
  data: build(type),
  async execute(interaction, ctx) {
    if (!inGuild(interaction)) return;
    await run(type, interaction, ctx);
  },
});

export const massban = make("ban");
export const masskick = make("kick");
export const masstimeout = make("timeout");

// =============== Rechtsklick: Betrugslink melden ===============

export const reportPhishingMenu: ContextMenu = {
  data: new ContextMenuCommandBuilder()
    .setName("Betrugslink sperren")
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction, { db }) {
    if (!interaction.inCachedGuild()) return;
    const msg = interaction.targetMessage;
    const links = extractLinks([msg.content, ...msg.embeds.map((e) => e.url ?? "")].join("\n"));
    const targets = await shortLinkTargets(links);
    // Echte Seiten wie discord.com und Kurzlink-Dienste selbst nie sperren, nur das Ziel.
    const safe = [...new Set([...links.filter((l) => !isShortener(l.host)), ...targets].map((l) => l.host))].filter((h) => !isOfficialDomain(h)).slice(0, 10);
    if (!safe.length) {
      return void (await interaction.reply({ content: "In dieser Nachricht finde ich keinen Link, den ich sperren könnte.", flags: MessageFlags.Ephemeral }));
    }
    const enabled = await updatePhishingLists(db, interaction.guildId, { blocked: safe });
    invalidateAutomod(interaction.guildId);
    await msg.delete().catch(() => {});
    await interaction.reply({
      content: `Gesperrt: ${safe.join(", ")}. Die Nachricht ist gelöscht.${enabled ? "" : "\nHinweis: Der Anti-Phishing-Filter ist noch aus. Schalte ihn im Dashboard unter Auto-Mod ein, damit die Sperre greift."}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
