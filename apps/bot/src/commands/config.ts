import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
} from "discord.js";
import {
  and,
  eq,
  guildSettings,
  warnEscalations,
  type EscalationAction,
} from "@libremod/db";
import type { Command } from "./types.js";
import { getSettings } from "../services/cases.js";
import {
  formatDuration,
  MAX_TIMEOUT_SECONDS,
  parseDuration,
  t,
} from "@libremod/shared";
import { inGuild, replyPrivate } from "./moderation/shared.js";

const ACTION_LABELS: Record<EscalationAction, string> = {
  timeout: "Timeout",
  kick: "Kick",
  ban: "Ban",
};

export const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Libremod für diesen Server einstellen.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName("show").setDescription("Zeigt die aktuellen Einstellungen."),
    )
    .addSubcommand((s) =>
      s
        .setName("modlog")
        .setDescription(
          "Legt fest, wohin Moderationsaktionen protokolliert werden.",
        )
        .addChannelOption((o) =>
          o
            .setName("kanal")
            .setDescription("Leer lassen zum Ausschalten")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("dm")
        .setDescription(
          "Betroffene per Direktnachricht über Strafen informieren?",
        )
        .addBooleanOption((o) =>
          o.setName("aktiv").setDescription("An oder aus").setRequired(true),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("escalation")
        .setDescription(
          "Verwarnungsstufen: automatische Strafen nach X Verwarnungen.",
        )
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription(
              "Legt fest, was bei einer bestimmten Anzahl Verwarnungen passiert.",
            )
            .addIntegerOption((o) =>
              o
                .setName("verwarnungen")
                .setDescription("Ab wie vielen Verwarnungen")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("aktion")
                .setDescription("Was passiert")
                .setRequired(true)
                .addChoices(
                  { name: "Timeout", value: "timeout" },
                  { name: "Kick", value: "kick" },
                  { name: "Ban", value: "ban" },
                ),
            )
            .addStringOption((o) =>
              o
                .setName("dauer")
                .setDescription(
                  "Für Timeout nötig, für Ban optional (z. B. 1h, 7d)",
                ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Entfernt eine Verwarnungsstufe.")
            .addIntegerOption((o) =>
              o
                .setName("verwarnungen")
                .setDescription("Welche Stufe")
                .setMinValue(1)
                .setRequired(true),
            ),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    await getSettings(db, guildId);

    if (group === "escalation" && sub === "set") {
      const warnCount = interaction.options.getInteger("verwarnungen", true);
      const action = interaction.options.getString(
        "aktion",
        true,
      ) as EscalationAction;
      const durationInput = interaction.options.getString("dauer");
      const seconds = durationInput ? parseDuration(durationInput) : null;
      if (durationInput && !seconds)
        return void (await replyPrivate(
          interaction,
          "Diese Dauer verstehe ich nicht. Beispiele: 1h, 7d.",
        ));
      if (action === "timeout" && !seconds)
        return void (await replyPrivate(
          interaction,
          "Für einen Timeout brauche ich eine Dauer.",
        ));
      if (action === "timeout" && seconds! > MAX_TIMEOUT_SECONDS)
        return void (await replyPrivate(
          interaction,
          "Timeouts dürfen höchstens 28 Tage dauern.",
        ));

      const durationSeconds = action === "kick" ? null : seconds;
      await db
        .insert(warnEscalations)
        .values({ guildId, warnCount, action, durationSeconds })
        .onConflictDoUpdate({
          target: [warnEscalations.guildId, warnEscalations.warnCount],
          set: { action, durationSeconds },
        });
      const suffix = durationSeconds
        ? ` für ${formatDuration(durationSeconds)}`
        : action === "ban"
          ? " (dauerhaft)"
          : "";
      return void (await replyPrivate(
        interaction,
        `Bei ${warnCount} Verwarnungen: ${t(ACTION_LABELS[action])}${suffix}.`,
      ));
    }

    if (group === "escalation" && sub === "remove") {
      const warnCount = interaction.options.getInteger("verwarnungen", true);
      const removed = await db
        .delete(warnEscalations)
        .where(
          and(
            eq(warnEscalations.guildId, guildId),
            eq(warnEscalations.warnCount, warnCount),
          ),
        )
        .returning();
      return void (await replyPrivate(
        interaction,
        removed.length
          ? `Stufe bei ${warnCount} Verwarnungen entfernt.`
          : "Diese Stufe gibt es nicht.",
      ));
    }

    if (sub === "modlog") {
      const channel = interaction.options.getChannel("kanal", false, [
        ChannelType.GuildText,
      ]);
      await db
        .update(guildSettings)
        .set({ modLogChannelId: channel?.id ?? null, updatedAt: new Date() })
        .where(eq(guildSettings.guildId, guildId));
      return void (await replyPrivate(
        interaction,
        channel
          ? `Mod-Log geht jetzt nach ${channelMention(channel.id)}.`
          : "Mod-Log ausgeschaltet.",
      ));
    }

    if (sub === "dm") {
      const active = interaction.options.getBoolean("aktiv", true);
      await db
        .update(guildSettings)
        .set({ dmOnAction: active, updatedAt: new Date() })
        .where(eq(guildSettings.guildId, guildId));
      return void (await replyPrivate(
        interaction,
        active
          ? "Betroffene werden per Direktnachricht informiert."
          : "Keine Direktnachrichten mehr bei Strafen.",
      ));
    }

    // show
    const settings = await getSettings(db, guildId);
    const rules = await db
      .select()
      .from(warnEscalations)
      .where(eq(warnEscalations.guildId, guildId))
      .orderBy(warnEscalations.warnCount);
    const lines = [
      `**Mod-Log:** ${settings.modLogChannelId ? channelMention(settings.modLogChannelId) : "aus"}`,
      `**Direktnachricht bei Strafen:** ${settings.dmOnAction ? "an" : "aus"}`,
      "**Verwarnungsstufen:**",
      ...(rules.length
        ? rules.map((r) => {
            const d = r.durationSeconds
              ? ` für ${formatDuration(r.durationSeconds)}`
              : r.action === "ban"
                ? " (dauerhaft)"
                : "";
            return `• ${r.warnCount} Verwarnungen → ${t(ACTION_LABELS[r.action])}${d}`;
          })
        : ["keine"]),
    ];
    await replyPrivate(interaction, lines.join("\n"));
  },
};
