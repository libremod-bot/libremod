import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
  roleMention,
} from "discord.js";
import {
  and,
  automodExemptions,
  automodFilter,
  automodRules,
  eq,
  guildSettings,
  type AutomodAction,
  type AutomodFilter,
} from "@libremod/db";
import type { Command } from "./types.js";
import { getSettings } from "../services/cases.js";
import { FILTER_LABELS, getRule, invalidateAutomod } from "../services/automod.js";
import { DEFAULT_THRESHOLDS } from "../lib/automod/filters.js";
import { formatDuration, MAX_TIMEOUT_SECONDS, parseDuration } from "../lib/duration.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";

const ACTION_LABELS: Record<AutomodAction, string> = {
  delete: "nur löschen",
  warn: "löschen + verwarnen",
  timeout: "löschen + Timeout",
  kick: "löschen + Kick",
  ban: "löschen + Ban",
};

const RAID_LABELS: Record<string, string> = {
  alert: "nur warnen",
  timeout: "Timeout (1 Stunde)",
  kick: "Kick",
  ban: "Ban",
};

const THRESHOLD_HELP: Partial<Record<AutomodFilter, string>> = {
  spam: "Nachrichten in 5 Sekunden",
  caps: "Prozent Großbuchstaben",
  mentions: "Erwähnungen pro Nachricht",
};

const filterChoices = automodFilter.enumValues.map((f) => ({ name: FILTER_LABELS[f], value: f }));
const actionChoices = (Object.keys(ACTION_LABELS) as AutomodAction[]).map((a) => ({ name: ACTION_LABELS[a], value: a }));

function splitList(input: string) {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const automod: Command = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Auto-Moderation einstellen.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("status").setDescription("Zeigt alle Filter und Einstellungen."))
    .addSubcommand((s) =>
      s
        .setName("toggle")
        .setDescription("Schaltet die Auto-Moderation als Ganzes an oder aus.")
        .addBooleanOption((o) => o.setName("aktiv").setDescription("An oder aus").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("filter")
        .setDescription("Stellt einen einzelnen Filter ein.")
        .addStringOption((o) => o.setName("filter").setDescription("Welcher Filter").setRequired(true).addChoices(...filterChoices))
        .addBooleanOption((o) => o.setName("aktiv").setDescription("An oder aus").setRequired(true))
        .addStringOption((o) => o.setName("aktion").setDescription("Was bei einem Verstoß passiert").addChoices(...actionChoices))
        .addStringOption((o) => o.setName("dauer").setDescription("Für Timeout oder befristeten Ban, z. B. 10m, 1d"))
        .addIntegerOption((o) =>
          o.setName("schwelle").setDescription("Spam: Nachrichten/5 s · Caps: Prozent · Erwähnungen: Anzahl").setMinValue(2).setMaxValue(100),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("words")
        .setDescription("Wortliste für den Wortfilter.")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Wörter hinzufügen (mit Komma getrennt, * am Ende = beliebige Endung).")
            .addStringOption((o) => o.setName("woerter").setDescription("z. B. idiot*, doof").setRequired(true).setMaxLength(1000)),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Wörter entfernen.")
            .addStringOption((o) => o.setName("woerter").setDescription("Mit Komma getrennt").setRequired(true)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("Zeigt die Wortliste.")),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("links")
        .setDescription("Erlaubte Domains für den Link-Filter.")
        .addSubcommand((s) =>
          s
            .setName("allow")
            .setDescription("Domains erlauben (inklusive Subdomains).")
            .addStringOption((o) => o.setName("domains").setDescription("z. B. youtube.com, libremod.dev").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("disallow")
            .setDescription("Domains wieder verbieten.")
            .addStringOption((o) => o.setName("domains").setDescription("Mit Komma getrennt").setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("exempt")
        .setDescription("Rollen und Kanäle, die die Auto-Moderation ignoriert.")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Ausnahme hinzufügen.")
            .addRoleOption((o) => o.setName("rolle").setDescription("Rolle"))
            .addChannelOption((o) => o.setName("kanal").setDescription("Kanal oder Kategorie")),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Ausnahme entfernen.")
            .addRoleOption((o) => o.setName("rolle").setDescription("Rolle"))
            .addChannelOption((o) => o.setName("kanal").setDescription("Kanal oder Kategorie")),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("raid")
        .setDescription("Raid-Schutz: Reaktion auf viele Beitritte in kurzer Zeit.")
        .addBooleanOption((o) => o.setName("aktiv").setDescription("An oder aus").setRequired(true))
        .addIntegerOption((o) => o.setName("beitritte").setDescription("Ab wie vielen Beitritten (Standard 10)").setMinValue(3).setMaxValue(100))
        .addIntegerOption((o) => o.setName("sekunden").setDescription("Innerhalb wie vieler Sekunden (Standard 10)").setMinValue(5).setMaxValue(600))
        .addStringOption((o) =>
          o
            .setName("aktion")
            .setDescription("Was mit neuen Mitgliedern während des Raids passiert")
            .addChoices(...Object.entries(RAID_LABELS).map(([value, name]) => ({ name, value }))),
        ),
    ),

  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const settings = await getSettings(db, guildId);
    const done = async (text: string) => {
      invalidateAutomod(guildId);
      await replyPrivate(interaction, text);
    };

    if (!group && sub === "toggle") {
      const active = interaction.options.getBoolean("aktiv", true);
      await db.update(guildSettings).set({ automodEnabled: active, updatedAt: new Date() }).where(eq(guildSettings.guildId, guildId));
      return done(active ? "Auto-Moderation ist an. Stelle mit `/automod filter` ein, welche Filter greifen." : "Auto-Moderation ist aus.");
    }

    if (!group && sub === "filter") {
      const filter = interaction.options.getString("filter", true) as AutomodFilter;
      const enabled = interaction.options.getBoolean("aktiv", true);
      const rule = await getRule(db, guildId, filter);
      const action = (interaction.options.getString("aktion") as AutomodAction | null) ?? rule.action;
      const durationInput = interaction.options.getString("dauer");
      const threshold = interaction.options.getInteger("schwelle");

      let durationSeconds = rule.durationSeconds;
      if (durationInput) {
        durationSeconds = parseDuration(durationInput);
        if (!durationSeconds) return replyPrivate(interaction, "Diese Dauer verstehe ich nicht. Beispiele: 10m, 1h, 1d.");
      }
      if (action === "timeout" && durationSeconds && durationSeconds > MAX_TIMEOUT_SECONDS) {
        return replyPrivate(interaction, "Timeouts dürfen höchstens 28 Tage dauern.");
      }
      if (threshold && !THRESHOLD_HELP[filter]) {
        return replyPrivate(interaction, `Der Filter „${FILTER_LABELS[filter]}“ hat keine Schwelle.`);
      }
      if (filter === "caps" && threshold && threshold < 50) {
        return replyPrivate(interaction, "Unter 50 % würde fast jede Nachricht gelöscht. Nimm mindestens 50.");
      }

      const config = threshold ? { ...rule.config, threshold } : rule.config;
      await db
        .update(automodRules)
        .set({ enabled, action, durationSeconds, config })
        .where(and(eq(automodRules.guildId, guildId), eq(automodRules.filter, filter)));

      const hint = settings.automodEnabled ? "" : "\nHinweis: Die Auto-Moderation ist insgesamt noch aus. Schalte sie mit `/automod toggle` an.";
      const wordHint = enabled && filter === "words" && !config.words?.length ? "\nDie Wortliste ist noch leer: `/automod words add`." : "";
      return done(`${FILTER_LABELS[filter]}: ${enabled ? `an, ${ACTION_LABELS[action]}` : "aus"}.${hint}${wordHint}`);
    }

    if (group === "words") {
      const rule = await getRule(db, guildId, "words");
      const current = new Set(rule.config.words ?? []);
      if (sub === "list") {
        return replyPrivate(interaction, current.size ? `Wortliste (${current.size}): ||${[...current].join(", ")}||` : "Die Wortliste ist leer.");
      }
      const input = splitList(interaction.options.getString("woerter", true));
      for (const w of input) (sub === "add" ? current.add(w) : current.delete(w));
      if (current.size > 1000) return replyPrivate(interaction, "Die Wortliste kann höchstens 1000 Einträge haben.");
      await db
        .update(automodRules)
        .set({ config: { ...rule.config, words: [...current] } })
        .where(and(eq(automodRules.guildId, guildId), eq(automodRules.filter, "words")));
      return done(`Wortliste hat jetzt ${current.size} Einträge.`);
    }

    if (group === "links") {
      const rule = await getRule(db, guildId, "links");
      const current = new Set(rule.config.allowedDomains ?? []);
      const domains = splitList(interaction.options.getString("domains", true)).map((d) =>
        d.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      );
      for (const d of domains) (sub === "allow" ? current.add(d) : current.delete(d));
      await db
        .update(automodRules)
        .set({ config: { ...rule.config, allowedDomains: [...current] } })
        .where(and(eq(automodRules.guildId, guildId), eq(automodRules.filter, "links")));
      return done(current.size ? `Erlaubte Domains: ${[...current].join(", ")}` : "Keine Domains erlaubt, alle Links werden gefiltert.");
    }

    if (group === "exempt") {
      const role = interaction.options.getRole("rolle");
      const channel = interaction.options.getChannel("kanal");
      if (!role && !channel) return replyPrivate(interaction, "Gib eine Rolle oder einen Kanal an.");
      const entries = [
        ...(role ? [{ guildId, kind: "role" as const, targetId: role.id }] : []),
        ...(channel ? [{ guildId, kind: "channel" as const, targetId: channel.id }] : []),
      ];
      if (sub === "add") {
        await db.insert(automodExemptions).values(entries).onConflictDoNothing();
      } else {
        for (const e of entries) {
          await db
            .delete(automodExemptions)
            .where(and(eq(automodExemptions.guildId, guildId), eq(automodExemptions.kind, e.kind), eq(automodExemptions.targetId, e.targetId)));
        }
      }
      const names = [role && roleMention(role.id), channel && channelMention(channel.id)].filter(Boolean).join(" und ");
      return done(sub === "add" ? `Ausnahme hinzugefügt: ${names}` : `Ausnahme entfernt: ${names}`);
    }

    if (!group && sub === "raid") {
      const update = {
        raidEnabled: interaction.options.getBoolean("aktiv", true),
        raidJoinThreshold: interaction.options.getInteger("beitritte") ?? settings.raidJoinThreshold,
        raidWindowSeconds: interaction.options.getInteger("sekunden") ?? settings.raidWindowSeconds,
        raidAction: interaction.options.getString("aktion") ?? settings.raidAction,
        updatedAt: new Date(),
      };
      await db.update(guildSettings).set(update).where(eq(guildSettings.guildId, guildId));
      const logHint = settings.modLogChannelId ? "" : "\nTipp: Lege mit `/config modlog` einen Kanal fest, damit du bei einem Raid benachrichtigt wirst.";
      return done(
        update.raidEnabled
          ? `Raid-Schutz an: ab ${update.raidJoinThreshold} Beitritten in ${update.raidWindowSeconds} Sekunden → ${RAID_LABELS[update.raidAction]}.${logHint}`
          : "Raid-Schutz aus.",
      );
    }

    // status
    const rules = await db.select().from(automodRules).where(eq(automodRules.guildId, guildId));
    const exemptions = await db.select().from(automodExemptions).where(eq(automodExemptions.guildId, guildId));
    const byFilter = new Map(rules.map((r) => [r.filter, r]));
    const lines = [`**Auto-Moderation:** ${settings.automodEnabled ? "an" : "aus"}`, ""];
    for (const f of automodFilter.enumValues) {
      const r = byFilter.get(f);
      if (!r?.enabled) {
        lines.push(`○ ${FILTER_LABELS[f]}: aus`);
        continue;
      }
      const d = r.durationSeconds && (r.action === "timeout" || r.action === "ban") ? ` (${formatDuration(r.durationSeconds)})` : "";
      const help = THRESHOLD_HELP[f];
      const t = help ? `, Schwelle ${r.config.threshold ?? DEFAULT_THRESHOLDS[f as keyof typeof DEFAULT_THRESHOLDS]} ${help}` : "";
      lines.push(`● ${FILTER_LABELS[f]}: ${ACTION_LABELS[r.action]}${d}${t}`);
    }
    lines.push(
      "",
      `**Raid-Schutz:** ${settings.raidEnabled ? `ab ${settings.raidJoinThreshold} Beitritten in ${settings.raidWindowSeconds} s → ${RAID_LABELS[settings.raidAction]}` : "aus"}`,
      `**Ausnahmen:** ${
        exemptions.length
          ? exemptions.map((e) => (e.kind === "role" ? roleMention(e.targetId) : channelMention(e.targetId))).join(", ")
          : "keine"
      } (Mitglieder mit „Nachrichten verwalten“ sind immer ausgenommen)`,
    );
    await replyPrivate(interaction, lines.join("\n"));
  },
};
