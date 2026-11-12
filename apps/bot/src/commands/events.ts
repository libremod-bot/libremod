import {
  ChannelType,
  DiscordAPIError,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  SlashCommandBuilder,
  time,
  TimestampStyles,
} from "discord.js";
import { and, asc, count, eq, guildEvents } from "@libremod/db";
import {
  DEFAULT_EVENT_MINUTES,
  EVENT_COLOR,
  EVENT_REMINDERS,
  MAX_ACTIVE_EVENTS,
  MAX_EVENT_DESCRIPTION,
  MAX_EVENT_LOCATION,
  MAX_EVENT_SLOTS,
  MAX_EVENT_TITLE,
  parseDuration,
  parseEventStart,
  validateEventTime,
} from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { cancelEvent, createEvent, eventLink } from "../services/events.js";
import { t } from "@libremod/shared";

const clip = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`;

export const event: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription(
      "Events planen: Zu- und Absagen, Warteliste und Erinnerung.",
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription(t("Plant ein neues Event."))
        .addStringOption((o) =>
          o
            .setName("titel")
            .setDescription(t("Wie heißt das Event?"))
            .setRequired(true)
            .setMaxLength(MAX_EVENT_TITLE),
        )
        .addStringOption((o) =>
          o
            .setName("start")
            .setDescription(
              t(
                "Wann? z. B. 24.12. 18:00, morgen 19:30, in 2h (deutsche Zeit)",
              ),
            )
            .setRequired(true)
            .setMaxLength(40),
        )
        .addStringOption((o) =>
          o
            .setName("dauer")
            .setDescription(t("Wie lange? z. B. 90m, 3h (Standard 2h)"))
            .setMaxLength(20),
        )
        .addStringOption((o) =>
          o
            .setName("beschreibung")
            .setDescription(t("Worum geht es?"))
            .setMaxLength(MAX_EVENT_DESCRIPTION),
        )
        .addStringOption((o) =>
          o
            .setName("ort")
            .setDescription(t("Wo? z. B. Sprachkanal, Spiel-Server, Adresse"))
            .setMaxLength(MAX_EVENT_LOCATION),
        )
        .addIntegerOption((o) =>
          o
            .setName("plätze")
            .setDescription(
              t("Höchstzahl an Zusagen, weitere kommen auf die Warteliste"),
            )
            .setMinValue(1)
            .setMaxValue(MAX_EVENT_SLOTS),
        )
        .addIntegerOption((o) =>
          o
            .setName("erinnerung")
            .setDescription(
              "Erinnerung per DM an alle Zusagen (Standard 30 Minuten vorher)",
            )
            .addChoices(
              ...EVENT_REMINDERS.map((r) => ({
                name: r.label,
                value: r.value,
              })),
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("kanal")
            .setDescription(t("Wo posten? Leer = hier"))
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        )
        .addRoleOption((o) =>
          o
            .setName("rolle")
            .setDescription(
              t(
                "Rolle für alle mit Zusage, wird nach dem Event wieder entfernt",
              ),
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("cancel")
        .setDescription(t("Sagt ein Event ab und gibt allen Bescheid."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Welches Event?"))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription(t("Zeigt geplante Events.")),
    ),

  async autocomplete(interaction, { db }) {
    if (!interaction.guildId) return;
    const q = interaction.options.getFocused().toLowerCase();
    const rows = await db
      .select()
      .from(guildEvents)
      .where(
        and(
          eq(guildEvents.guildId, interaction.guildId),
          eq(guildEvents.state, "open"),
        ),
      )
      .orderBy(asc(guildEvents.startsAt))
      .limit(100);
    await interaction.respond(
      rows
        .filter(
          (e) =>
            e.title.toLowerCase().includes(q) || String(e.id).startsWith(q),
        )
        .slice(0, 25)
        .map((e) => ({ name: clip(`#${e.id} ${e.title}`, 100), value: e.id })),
    );
  },

  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "create") {
      const startsAt = parseEventStart(
        interaction.options.getString("start", true),
      );
      if (!startsAt) {
        return void (await replyPrivate(
          interaction,
          t(
            "Den Start habe ich nicht verstanden. Beispiele: `24.12. 18:00`, `morgen 19:30`, `in 2h`.",
          ),
        ));
      }
      const durationText = interaction.options.getString("dauer");
      const seconds = durationText
        ? parseDuration(durationText)
        : DEFAULT_EVENT_MINUTES * 60;
      if (!seconds)
        return void (await replyPrivate(
          interaction,
          t(
            "Die Dauer habe ich nicht verstanden. Beispiele: `90m`, `3h`, `2d`.",
          ),
        ));
      const minutes = Math.round(seconds / 60);
      const invalid = validateEventTime(startsAt, minutes);
      if (invalid) return void (await replyPrivate(interaction, invalid));

      const [active] = await db
        .select({ n: count() })
        .from(guildEvents)
        .where(
          and(eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open")),
        );
      if ((active?.n ?? 0) >= MAX_ACTIVE_EVENTS) {
        return void (await replyPrivate(
          interaction,
          t(
            "Es sind schon {MAX_ACTIVE_EVENTS} Events geplant. Sag erst eins ab oder warte, bis eins vorbei ist.",
            { MAX_ACTIVE_EVENTS },
          ),
        ));
      }
      const channel =
        interaction.options.getChannel("kanal") ?? interaction.channel;
      if (!channel)
        return void (await replyPrivate(
          interaction,
          t("Bitte einen Kanal angeben."),
        ));
      const role = interaction.options.getRole("rolle");
      if (role && role.id !== guildId) {
        const me = interaction.guild.members.me;
        if (
          role.managed ||
          !me ||
          me.roles.highest.comparePositionTo(role.id) <= 0
        ) {
          return void (await replyPrivate(
            interaction,
            t(
              "Die Rolle <@&{id}> kann ich nicht vergeben. Sie muss unter meiner höchsten Rolle stehen.",
              { id: role.id },
            ),
          ));
        }
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const e = await createEvent(interaction.client, db, {
          guildId,
          channelId: channel.id,
          title: interaction.options.getString("titel", true),
          description: interaction.options.getString("beschreibung") ?? "",
          location: interaction.options.getString("ort") ?? "",
          startsAt,
          endsAt: new Date(startsAt.getTime() + minutes * 60_000),
          slots: interaction.options.getInteger("plätze") ?? 0,
          hostId: interaction.user.id,
          roleId: role && role.id !== guildId ? role.id : null,
          remindMinutes: interaction.options.getInteger("erinnerung") ?? 30,
        });
        await interaction.editReply(
          t("Event #{id} steht in <#{channelId}> und beginnt {n2}.", {
            id: e.id,
            channelId: e.channelId,
            n2: time(e.startsAt, TimestampStyles.LongDateTime),
          }),
        );
      } catch (err) {
        if (
          err instanceof DiscordAPIError &&
          (err.code === RESTJSONErrorCodes.MissingAccess ||
            err.code === RESTJSONErrorCodes.MissingPermissions)
        ) {
          return void (await interaction.editReply(
            t("Ich darf in <#{id}> nicht schreiben. Prüfe meine Rechte dort.", {
              id: channel.id,
            }),
          ));
        }
        throw err;
      }
      return;
    }

    if (sub === "list") {
      const rows = await db
        .select()
        .from(guildEvents)
        .where(
          and(eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open")),
        )
        .orderBy(asc(guildEvents.startsAt))
        .limit(25);
      if (!rows.length)
        return void (await replyPrivate(
          interaction,
          t("Gerade ist kein Event geplant."),
        ));
      const lines = rows.map((e) => {
        const link = eventLink(e);
        const title = link
          ? `[${clip(e.title, 80)}](${link})`
          : clip(e.title, 80);
        return `**#${e.id}** ${title} · ${time(e.startsAt, TimestampStyles.ShortDateTime)} (${time(e.startsAt, TimestampStyles.RelativeTime)})`;
      });
      return void (await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(EVENT_COLOR)
            .setTitle(t("Geplante Events"))
            .setDescription(lines.join("\n")),
        ],
        flags: MessageFlags.Ephemeral,
      }));
    }

    // cancel
    const id = interaction.options.getInteger("nummer", true);
    const [e] = await db
      .select()
      .from(guildEvents)
      .where(and(eq(guildEvents.id, id), eq(guildEvents.guildId, guildId)));
    if (!e || e.state !== "open")
      return void (await replyPrivate(
        interaction,
        t("Dieses Event gibt es nicht oder es ist schon vorbei."),
      ));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await cancelEvent(interaction.client, db, e.id);
    await interaction.editReply(
      t(
        "Event #{id} „{n1}“ ist abgesagt. Alle mit Zu- oder Vielleicht-Antwort bekommen Bescheid.",
        { id: e.id, n1: clip(e.title, 80) },
      ),
    );
  },
};
