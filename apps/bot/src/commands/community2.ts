import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  userMention,
} from "discord.js";
import {
  and,
  asc,
  eq,
  suggestions,
  suggestionVotes,
  tempRoles,
  type SuggestionStatus,
} from "@libremod/db";
import {
  MAX_SUGGESTION_LENGTH,
  MAX_TEMP_ROLE_SECONDS,
  MIN_SUGGESTION_LENGTH,
  parseDuration,
  SUGGESTION_STATUS,
} from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import {
  addTempRole,
  createSuggestion,
  loadSuggestionSettings,
  removeTempRole,
  setSuggestionStatus,
} from "../services/community2.js";
import { t } from "@libremod/shared";

// =============== /suggest und /suggestion ===============

export const suggest: Command = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Reicht einen Vorschlag für den Server ein.")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("vorschlag")
        .setDescription(t("Was schlägst du vor?"))
        .setRequired(true)
        .setMinLength(MIN_SUGGESTION_LENGTH)
        .setMaxLength(MAX_SUGGESTION_LENGTH),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await loadSuggestionSettings(db, interaction.guildId);
    if (!s?.enabled || !s.channelId)
      return void (await replyPrivate(
        interaction,
        t("Vorschläge sind auf diesem Server ausgeschaltet."),
      ));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const row = await createSuggestion(
      interaction.guild,
      db,
      s,
      interaction.user,
      interaction.options.getString("vorschlag", true),
    );
    await interaction.editReply(
      t("Danke! Dein Vorschlag #{number} steht jetzt in <#{channelId}>.", {
        number: row.number,
        channelId: row.channelId,
      }),
    );
  },
};

const STATUS_CHOICES = (
  Object.keys(SUGGESTION_STATUS) as SuggestionStatus[]
).map((k) => ({ name: t(SUGGESTION_STATUS[k].label), value: k }));

export const suggestion: Command = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Vorschläge verwalten.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription(t("Setzt den Status eines Vorschlags."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Nummer des Vorschlags"))
            .setRequired(true)
            .setMinValue(1),
        )
        .addStringOption((o) =>
          o
            .setName("status")
            .setDescription("Neuer Status")
            .setRequired(true)
            .addChoices(...STATUS_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("grund")
            .setDescription(t("Begründung, sichtbar für alle"))
            .setMaxLength(500),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription(t("Löscht einen Vorschlag samt Nachricht."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Nummer des Vorschlags"))
            .setRequired(true)
            .setMinValue(1),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const number = interaction.options.getInteger("nummer", true);
    if (interaction.options.getSubcommand() === "status") {
      const status = interaction.options.getString(
        "status",
        true,
      ) as SuggestionStatus;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const row = await setSuggestionStatus(
        interaction.client,
        db,
        interaction.guildId,
        number,
        status,
        interaction.options.getString("grund"),
        interaction.user.id,
      );
      return void (await interaction.editReply(
        row
          ? t("Vorschlag #{number} ist jetzt: {label}.", {
              number,
              label: t(SUGGESTION_STATUS[status].label),
            })
          : t("Vorschlag #{number} gibt es nicht.", { number }),
      ));
    }
    const [gone] = await db
      .delete(suggestions)
      .where(
        and(
          eq(suggestions.guildId, interaction.guildId),
          eq(suggestions.number, number),
        ),
      )
      .returning();
    if (!gone)
      return void (await replyPrivate(
        interaction,
        t("Vorschlag #{number} gibt es nicht.", { number }),
      ));
    await db
      .delete(suggestionVotes)
      .where(eq(suggestionVotes.suggestionId, gone.id));
    if (gone.messageId)
      await interaction.client.rest
        .delete(`/channels/${gone.channelId}/messages/${gone.messageId}`)
        .catch(() => {});
    await replyPrivate(
      interaction,
      t("Vorschlag #{number} ist gelöscht.", { number }),
    );
  },
};

// =============== /temprole ===============

export const temprole: Command = {
  data: new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Rollen auf Zeit vergeben.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription(
          t(
            "Gibt eine Rolle für eine bestimmte Zeit. Läuft schon eine, wird verlängert.",
          ),
        )
        .addUserOption((o) =>
          o.setName("mitglied").setDescription(t("Wer?")).setRequired(true),
        )
        .addRoleOption((o) =>
          o
            .setName("rolle")
            .setDescription(t("Welche Rolle?"))
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("dauer")
            .setDescription(t("Wie lange? z. B. 12h, 7d, 4w"))
            .setRequired(true)
            .setMaxLength(20),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription(t("Nimmt eine Rolle auf Zeit sofort weg."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription(t("Wer?")).setRequired(true),
        )
        .addRoleOption((o) =>
          o
            .setName("rolle")
            .setDescription(t("Welche Rolle?"))
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription(t("Zeigt Rollen auf Zeit."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription(t("Nur für diese Person")),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const user = interaction.options.getUser("mitglied");
      const rows = await db
        .select()
        .from(tempRoles)
        .where(
          user
            ? and(
                eq(tempRoles.guildId, interaction.guildId),
                eq(tempRoles.userId, user.id),
              )
            : eq(tempRoles.guildId, interaction.guildId),
        )
        .orderBy(asc(tempRoles.expiresAt))
        .limit(25);
      if (!rows.length)
        return void (await replyPrivate(
          interaction,
          t("Es laufen keine Rollen auf Zeit."),
        ));
      const lines = rows.map((r) =>
        t("{userId} · <@&{roleId}> · endet {n2}{n3}", {
          userId: userMention(r.userId),
          roleId: r.roleId,
          n2: time(r.expiresAt, TimestampStyles.RelativeTime),
          n3: r.source ? ` · ${r.source}` : "",
        }),
      );
      return void (await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(t("Rollen auf Zeit"))
            .setDescription(lines.join("\n")),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      }));
    }

    const user = interaction.options.getUser("mitglied", true);
    const role = interaction.options.getRole("rolle", true);
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    if (!member)
      return void (await replyPrivate(
        interaction,
        t("Diese Person ist nicht auf dem Server."),
      ));
    const me = interaction.guild.members.me;
    if (
      role.managed ||
      role.id === interaction.guildId ||
      !me ||
      role.position >= me.roles.highest.position
    ) {
      return void (await replyPrivate(
        interaction,
        t(
          "Diese Rolle kann ich nicht vergeben. Sie muss unter meiner höchsten Rolle stehen.",
        ),
      ));
    }
    if (
      interaction.guild.ownerId !== interaction.user.id &&
      role.position >= interaction.member.roles.highest.position
    ) {
      return void (await replyPrivate(
        interaction,
        t(
          "Du kannst nur Rollen vergeben, die unter deiner höchsten Rolle stehen.",
        ),
      ));
    }

    if (sub === "remove") {
      const had = await removeTempRole(
        member,
        db,
        role.id,
        t("Rolle auf Zeit entfernt von {tag}", { tag: interaction.user.tag }),
      );
      return void (await replyPrivate(
        interaction,
        had
          ? t("{id} hat <@&{id2}> nicht mehr.", {
              id: userMention(user.id),
              id2: role.id,
            })
          : t(
              "{id} hatte <@&{id2}> nicht auf Zeit. Ich habe sie trotzdem entfernt, falls vorhanden.",
              { id: userMention(user.id), id2: role.id },
            ),
      ));
    }

    const seconds = parseDuration(interaction.options.getString("dauer", true));
    if (!seconds || seconds < 60 || seconds > MAX_TEMP_ROLE_SECONDS) {
      return void (await replyPrivate(
        interaction,
        t(
          "Bitte eine Dauer zwischen 1 Minute und 1 Jahr angeben, z. B. `7d` oder `4w`.",
        ),
      ));
    }
    const until = await addTempRole(
      member,
      db,
      role.id,
      seconds,
      interaction.user.id,
      null,
    );
    await replyPrivate(
      interaction,
      t("{id} hat <@&{id2}> bis {n2} ({n3}).", {
        id: userMention(user.id),
        id2: role.id,
        n2: time(until, TimestampStyles.LongDateTime),
        n3: time(until, TimestampStyles.RelativeTime),
      }),
    );
  },
};
