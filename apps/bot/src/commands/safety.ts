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
import {
  extractLinks,
  isOfficialDomain,
  isShortener,
  MAX_MASS_TARGETS,
  MAX_TIMEOUT_SECONDS,
  parseDuration,
  parseUserIds,
} from "@libremod/shared";
import type { Command, CommandContext } from "./types.js";
import {
  inGuild,
  replyPrivate,
  REASON_MAX,
  type GuildInteraction,
} from "./moderation/shared.js";
import { moderationBlocker } from "../lib/permissions.js";
import { moderate } from "../services/actions.js";
import { logger } from "../logger.js";
import type { ContextMenu } from "./extras.js";
import { shortLinkTargets, updatePhishingLists } from "../services/phishing.js";
import { invalidateAutomod } from "../services/automod.js";
import { t } from "@libremod/shared";

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
    .setDescription(
      t("Mehrere Personen auf einmal {label}, z. B. nach einem Raid.", {
        label: t(VERB[type].label),
      }),
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(
      type === "ban"
        ? PermissionFlagsBits.BanMembers
        : type === "kick"
          ? PermissionFlagsBits.KickMembers
          : PermissionFlagsBits.ModerateMembers,
    )
    .addStringOption((o) =>
      o
        .setName("personen")
        .setDescription(
          t("Erwähnungen oder Nutzer-IDs, getrennt durch Leerzeichen"),
        )
        .setMaxLength(4000),
    )
    .addStringOption((o) =>
      o
        .setName("beigetreten")
        .setDescription(
          t("Alle, die in dieser Zeit beigetreten sind, z. B. 10m oder 2h"),
        )
        .setMaxLength(10),
    );
  if (type === "timeout")
    b.addStringOption((o) =>
      o
        .setName("dauer")
        .setDescription(t("Wie lange? z. B. 1h, 1d (höchstens 28 Tage)"))
        .setRequired(true)
        .setMaxLength(10),
    );
  b.addStringOption((o) =>
    o.setName("grund").setDescription("Warum").setMaxLength(REASON_MAX),
  );
  if (type === "ban") {
    b.addIntegerOption((o) =>
      o
        .setName("nachrichten_loeschen")
        .setDescription("Nachrichten der Personen löschen")
        .addChoices(
          { name: t("Nichts löschen"), value: 0 },
          { name: t("Letzte Stunde"), value: 3600 },
          { name: t("Letzte 24 Stunden"), value: 86400 },
          { name: t("Letzte 7 Tage"), value: 604800 },
        ),
    );
  }
  return b;
}

async function run(
  type: MassType,
  interaction: GuildInteraction,
  { db }: CommandContext,
) {
  const ids = parseUserIds(interaction.options.getString("personen") ?? "");
  const windowInput = interaction.options.getString("beigetreten");
  const windowSeconds = windowInput ? parseDuration(windowInput) : null;
  if (windowInput && (!windowSeconds || windowSeconds > MAX_JOIN_WINDOW)) {
    return void (await replyPrivate(
      interaction,
      t("Bei „beigetreten“ geht eine Zeit bis 7 Tage, z. B. `15m` oder `2h`."),
    ));
  }
  if (!ids.length && !windowSeconds)
    return void (await replyPrivate(
      interaction,
      t("Gib Personen an oder eine Zeit bei „beigetreten“."),
    ));
  let seconds: number | null = null;
  if (type === "timeout") {
    seconds = parseDuration(interaction.options.getString("dauer", true));
    if (!seconds || seconds < 60 || seconds > MAX_TIMEOUT_SECONDS)
      return void (await replyPrivate(
        interaction,
        t("Bitte eine Dauer zwischen 1 Minute und 28 Tagen, z. B. `1h`."),
      ));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const targets = new Map<string, { user: User; member: GuildMember | null }>();
  if (windowSeconds) {
    const since = Date.now() - windowSeconds * 1000;
    const all = await guild.members.fetch();
    for (const m of all.values())
      if (!m.user.bot && (m.joinedTimestamp ?? 0) >= since)
        targets.set(m.id, { user: m.user, member: m });
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
    return void (await interaction.editReply(
      t(
        "Das wären {size} Personen. Mehr als {MAX_MASS_TARGETS} auf einmal gehen nicht, bitte grenze die Auswahl ein.",
        { size: targets.size, MAX_MASS_TARGETS },
      ),
    ));
  }

  const skipped: string[] = [];
  const ready: { user: User; member: GuildMember | null }[] = [];
  for (const tItem of targets.values()) {
    if (tItem.member) {
      const blocker = moderationBlocker(interaction.member, tItem.member);
      if (blocker) {
        skipped.push(`<@${tItem.user.id}>: ${blocker}`);
        continue;
      }
      if (
        type === "timeout" &&
        tItem.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        skipped.push(
          t("<@{id}>: Admins kann man nicht stummschalten.", {
            id: tItem.user.id,
          }),
        );
        continue;
      }
    } else if (tItem.user.id === interaction.user.id) continue;
    ready.push(tItem);
  }
  if (type === "ban") {
    const bans = await guild.bans.fetch().catch(() => null);
    for (let i = ready.length - 1; i >= 0; i--)
      if (bans?.has(ready[i]!.user.id)) ready.splice(i, 1);
  }
  if (!ready.length) {
    const why = [
      ...skipped,
      ...missing.map((id) => t("{id}: nicht gefunden", { id })),
    ]
      .slice(0, 15)
      .join("\n");
    return void (await interaction.editReply({
      content: t("Niemand übrig, den ich {label} könnte.{n1}", {
        label: t(VERB[type].label),
        n1: why ? `\n${why}` : "",
      }),
      allowedMentions: { parse: [] },
    }));
  }

  const preview = ready
    .slice(0, 30)
    .map((tItem) => `<@${tItem.user.id}>`)
    .join(" ");
  const more =
    ready.length > 30 ? t(" und {n0} weitere", { n0: ready.length - 30 }) : "";
  const notes = [
    skipped.length
      ? t("{n} übersprungen (Rolle zu hoch o. Ä.)", { n: skipped.length })
      : "",
    missing.length ? t("{n} nicht gefunden", { n: missing.length }) : "",
  ]
    .filter(Boolean)
    .join(", ");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("mass:yes")
      .setLabel(
        `${ready.length} ${ready.length === 1 ? "Person" : "Personen"} ${t(VERB[type].label)}`,
      )
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("mass:no")
      .setLabel("Abbrechen")
      .setStyle(ButtonStyle.Secondary),
  );
  const ask = await interaction.editReply({
    content: t("Wirklich {label}?\n{preview}{more}{n3}", {
      label: t(VERB[type].label),
      preview,
      more,
      n3: notes ? `\n\n${notes}` : "",
    }),
    components: [row],
    allowedMentions: { parse: [] },
  });
  const click = await ask
    .awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 60_000,
    })
    .catch(() => null);
  if (!click || click.customId !== "mass:yes") {
    return void (await interaction.editReply({
      content: click
        ? t("Abgebrochen, nichts passiert.")
        : t("Keine Bestätigung, nichts passiert."),
      components: [],
    }));
  }
  await click.update({
    content: t("Läuft … 0 von {length}", { length: ready.length }),
    components: [],
  });

  const reason = interaction.options.getString("grund")
    ? t("{n0} (Massenaktion)", { n0: interaction.options.getString("grund") })
    : "Massenaktion";
  let ok = 0;
  const failed: string[] = [];
  for (const [i, tItem] of ready.entries()) {
    try {
      await moderate({
        db,
        guild,
        type,
        target: tItem.user,
        member: tItem.member,
        moderatorId: interaction.user.id,
        reason,
        durationSeconds: seconds,
        deleteMessageSeconds:
          interaction.options.getInteger("nachrichten_loeschen") ?? 0,
      });
      ok++;
    } catch (err) {
      logger.warn(
        { err, guildId: guild.id, target: tItem.user.id },
        "Massenaktion: eine Person übersprungen",
      );
      failed.push(`<@${tItem.user.id}>`);
    }
    if ((i + 1) % 10 === 0 && i + 1 < ready.length)
      await interaction
        .editReply(
          t("Läuft … {n0} von {length}", { n0: i + 1, length: ready.length }),
        )
        .catch(() => {});
  }
  await interaction.editReply({
    content: t("Fertig: {ok} {n1} {done}.{n3}{n4}", {
      ok,
      n1: ok === 1 ? t("Person") : t("Personen"),
      done: VERB[type].done,
      n3: failed.length
        ? t("\nNicht geklappt: {n0}", { n0: failed.join(" ") })
        : "",
      n4: notes ? `\n${notes}` : "",
    }),
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
    const links = extractLinks(
      [msg.content, ...msg.embeds.map((e) => e.url ?? "")].join("\n"),
    );
    const targets = await shortLinkTargets(links);
    // Echte Seiten wie discord.com und Kurzlink-Dienste selbst nie sperren, nur das Ziel.
    const safe = [
      ...new Set(
        [...links.filter((l) => !isShortener(l.host)), ...targets].map(
          (l) => l.host,
        ),
      ),
    ]
      .filter((h) => !isOfficialDomain(h))
      .slice(0, 10);
    if (!safe.length) {
      return void (await interaction.reply({
        content: t(
          "In dieser Nachricht finde ich keinen Link, den ich sperren könnte.",
        ),
        flags: MessageFlags.Ephemeral,
      }));
    }
    const enabled = await updatePhishingLists(db, interaction.guildId, {
      blocked: safe,
    });
    invalidateAutomod(interaction.guildId);
    await msg.delete().catch(() => {});
    await interaction.reply({
      content: t("Gesperrt: {n0}. Die Nachricht ist gelöscht.{n1}", {
        n0: safe.join(", "),
        n1: enabled
          ? ""
          : t(
              "\nHinweis: Der Anti-Phishing-Filter ist noch aus. Schalte ihn im Dashboard unter Auto-Mod ein, damit die Sperre greift.",
            ),
      }),
      flags: MessageFlags.Ephemeral,
    });
  },
};
