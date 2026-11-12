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
  userMention,
} from "discord.js";
import {
  and,
  asc,
  birthdays,
  count,
  desc,
  eq,
  giveaways,
  reminders,
} from "@libremod/db";
import {
  ageOn,
  formatBirthday,
  formatDuration,
  localDate,
  MAX_ACTIVE_GIVEAWAYS,
  MAX_GIVEAWAY_SECONDS,
  MAX_GIVEAWAY_WINNERS,
  MAX_POLL_HOURS,
  MAX_POLL_QUESTION_LENGTH,
  MAX_REMINDER_SECONDS,
  MAX_REMINDERS_PER_USER,
  MIN_GIVEAWAY_SECONDS,
  nextBirthday,
  parseDuration,
  parsePollOptions,
  validateBirthday,
} from "@libremod/shared";
import type { Command } from "./types.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import {
  createGiveaway,
  endGiveaway,
  rerollGiveaway,
} from "../services/fun.js";
import { t } from "@libremod/shared";

const clip = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`;

// =============== /giveaway ===============

export const giveaway: Command = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Gewinnspiele starten und verwalten.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription(t("Startet ein neues Gewinnspiel."))
        .addStringOption((o) =>
          o
            .setName("preis")
            .setDescription(t("Was gibt es zu gewinnen?"))
            .setRequired(true)
            .setMaxLength(200),
        )
        .addStringOption((o) =>
          o
            .setName("dauer")
            .setDescription(t("Wie lange? z. B. 30m, 2h, 3d, 1w"))
            .setRequired(true)
            .setMaxLength(20),
        )
        .addIntegerOption((o) =>
          o
            .setName("gewinner")
            .setDescription(t("Anzahl Gewinner (Standard 1)"))
            .setMinValue(1)
            .setMaxValue(MAX_GIVEAWAY_WINNERS),
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
        .addStringOption((o) =>
          o
            .setName("beschreibung")
            .setDescription(t("Zusätzlicher Text"))
            .setMaxLength(1000),
        )
        .addRoleOption((o) =>
          o
            .setName("rolle")
            .setDescription(
              t("Nur Mitglieder mit dieser Rolle dürfen mitmachen"),
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName("level")
            .setDescription(t("Mindest-Level zum Mitmachen"))
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("end")
        .setDescription(t("Beendet ein Gewinnspiel sofort und lost aus."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Welches Gewinnspiel?"))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reroll")
        .setDescription(
          t("Lost für ein beendetes Gewinnspiel neue Gewinner aus."),
        )
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Welches Gewinnspiel?"))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("anzahl")
            .setDescription(t("Wie viele neue Gewinner? (Standard 1)"))
            .setMinValue(1)
            .setMaxValue(MAX_GIVEAWAY_WINNERS),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription(t("Zeigt laufende Gewinnspiele.")),
    ),

  async autocomplete(interaction, { db }) {
    if (!interaction.guildId) return;
    const ended = interaction.options.getSubcommand() === "reroll";
    const q = interaction.options.getFocused().toLowerCase();
    const rows = await db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.guildId, interaction.guildId),
          eq(giveaways.ended, ended),
        ),
      )
      .orderBy(ended ? desc(giveaways.endsAt) : asc(giveaways.endsAt))
      .limit(100);
    await interaction.respond(
      rows
        .filter(
          (g) =>
            g.prize.toLowerCase().includes(q) || String(g.id).startsWith(q),
        )
        .slice(0, 25)
        .map((g) => ({ name: clip(`#${g.id} ${g.prize}`, 100), value: g.id })),
    );
  },

  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "start") {
      const seconds = parseDuration(
        interaction.options.getString("dauer", true),
      );
      if (
        !seconds ||
        seconds < MIN_GIVEAWAY_SECONDS ||
        seconds > MAX_GIVEAWAY_SECONDS
      ) {
        return void (await replyPrivate(
          interaction,
          t(
            "Bitte eine Dauer zwischen 1 Minute und 60 Tagen angeben, z. B. `2h` oder `3d`.",
          ),
        ));
      }
      const [active] = await db
        .select({ n: count() })
        .from(giveaways)
        .where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false)));
      if ((active?.n ?? 0) >= MAX_ACTIVE_GIVEAWAYS) {
        return void (await replyPrivate(
          interaction,
          t(
            "Es laufen schon {MAX_ACTIVE_GIVEAWAYS} Gewinnspiele. Beende erst eins.",
            { MAX_ACTIVE_GIVEAWAYS },
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const g = await createGiveaway(interaction.client, db, {
          guildId,
          channelId: channel.id,
          prize: interaction.options.getString("preis", true),
          description: interaction.options.getString("beschreibung") ?? "",
          winners: interaction.options.getInteger("gewinner") ?? 1,
          hostId: interaction.user.id,
          requiredRoleId: role && role.id !== guildId ? role.id : null,
          minLevel: interaction.options.getInteger("level") ?? 0,
          endsAt: new Date(Date.now() + seconds * 1000),
        });
        await interaction.editReply(
          t("Gewinnspiel #{id} läuft in <#{channelId}> und endet {n2}.", {
            id: g.id,
            channelId: g.channelId,
            n2: time(g.endsAt, TimestampStyles.RelativeTime),
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
        .from(giveaways)
        .where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false)))
        .orderBy(asc(giveaways.endsAt))
        .limit(25);
      if (!rows.length)
        return void (await replyPrivate(
          interaction,
          t("Gerade läuft kein Gewinnspiel."),
        ));
      const lines = rows.map((g) =>
        t("**#{id}** {n1} · <#{channelId}> · endet {n3}", {
          id: g.id,
          n1: clip(g.prize, 80),
          channelId: g.channelId,
          n3: time(g.endsAt, TimestampStyles.RelativeTime),
        }),
      );
      return void (await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6fae)
            .setTitle(t("Laufende Gewinnspiele"))
            .setDescription(lines.join("\n")),
        ],
        flags: MessageFlags.Ephemeral,
      }));
    }

    const id = interaction.options.getInteger("nummer", true);
    const [g] = await db
      .select()
      .from(giveaways)
      .where(and(eq(giveaways.id, id), eq(giveaways.guildId, guildId)));
    if (!g)
      return void (await replyPrivate(
        interaction,
        t("Gewinnspiel #{id} gibt es auf diesem Server nicht.", { id }),
      ));

    if (sub === "end") {
      if (g.ended)
        return void (await replyPrivate(
          interaction,
          t(
            "Gewinnspiel #{id} ist schon beendet. Mit `/giveaway reroll` kannst du neu auslosen.",
            { id },
          ),
        ));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const done = await endGiveaway(interaction.client, db, g.id);
      const who = done?.winnerIds.length
        ? done.winnerIds.map(userMention).join(", ")
        : "niemand";
      return void (await interaction.editReply({
        content: t("Gewinnspiel #{id} ist beendet. Gewonnen hat: {who}", {
          id,
          who,
        }),
        allowedMentions: { parse: [] },
      }));
    }

    if (sub === "reroll") {
      if (!g.ended)
        return void (await replyPrivate(
          interaction,
          t(
            "Gewinnspiel #{id} läuft noch. Beende es erst mit `/giveaway end`.",
            { id },
          ),
        ));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const winners = await rerollGiveaway(
        interaction.client,
        db,
        g,
        interaction.options.getInteger("anzahl") ?? 1,
      );
      return void (await interaction.editReply({
        content: winners.length
          ? t("Neu ausgelost: {n0}", {
              n0: winners.map(userMention).join(", "),
            })
          : t("Es gibt keine weiteren Teilnehmenden, die gewinnen könnten."),
        allowedMentions: { parse: [] },
      }));
    }
  },
};

// =============== /poll ===============

export const poll: Command = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Startet eine Umfrage.")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("frage")
        .setDescription(t("Die Frage"))
        .setRequired(true)
        .setMaxLength(MAX_POLL_QUESTION_LENGTH),
    )
    .addStringOption((o) =>
      o
        .setName("antworten")
        .setDescription(t("Antworten, getrennt mit ; (2 bis 10)"))
        .setRequired(true)
        .setMaxLength(600),
    )
    .addIntegerOption((o) =>
      o
        .setName("stunden")
        .setDescription(t("Laufzeit in Stunden (Standard 24)"))
        .setMinValue(1)
        .setMaxValue(MAX_POLL_HOURS),
    )
    .addBooleanOption((o) =>
      o
        .setName("mehrfach")
        .setDescription(t("Dürfen mehrere Antworten gewählt werden?")),
    ),
  async execute(interaction) {
    if (!inGuild(interaction)) return;
    const parsed = parsePollOptions(
      interaction.options.getString("antworten", true),
    );
    if (!parsed.ok) return void (await replyPrivate(interaction, parsed.error));
    await interaction.reply({
      poll: {
        question: { text: interaction.options.getString("frage", true) },
        answers: parsed.options.map((text) => ({ text })),
        duration: interaction.options.getInteger("stunden") ?? 24,
        allowMultiselect: interaction.options.getBoolean("mehrfach") ?? false,
      },
      allowedMentions: { parse: [] },
    });
  },
};

// =============== /remind ===============

export const remind: Command = {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Erinnerungen für dich.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription(t("Erinnert dich später an etwas."))
        .addStringOption((o) =>
          o
            .setName("in")
            .setDescription(t("Wann? z. B. 10m, 2h, 1d12h, 2w"))
            .setRequired(true)
            .setMaxLength(20),
        )
        .addStringOption((o) =>
          o
            .setName("text")
            .setDescription(t("Woran soll ich dich erinnern?"))
            .setRequired(true)
            .setMaxLength(1000),
        )
        .addBooleanOption((o) =>
          o
            .setName("privat")
            .setDescription(t("Per Direktnachricht statt hier im Kanal")),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription(t("Zeigt deine offenen Erinnerungen.")),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription(t("Löscht eine Erinnerung."))
        .addIntegerOption((o) =>
          o
            .setName("nummer")
            .setDescription(t("Welche Erinnerung?"))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, { db }) {
    if (!interaction.guildId) return;
    const rows = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.guildId, interaction.guildId),
          eq(reminders.userId, interaction.user.id),
        ),
      )
      .orderBy(asc(reminders.dueAt))
      .limit(25);
    const q = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      rows
        .filter((r) => r.text.toLowerCase().includes(q))
        .map((r) => ({ name: clip(`#${r.id} ${r.text}`, 100), value: r.id })),
    );
  },

  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const mine = and(
      eq(reminders.guildId, interaction.guildId),
      eq(reminders.userId, interaction.user.id),
    );

    if (sub === "set") {
      const seconds = parseDuration(interaction.options.getString("in", true));
      if (!seconds || seconds < 60 || seconds > MAX_REMINDER_SECONDS) {
        return void (await replyPrivate(
          interaction,
          t(
            "Bitte eine Zeit zwischen 1 Minute und 1 Jahr angeben, z. B. `30m`, `2h` oder `3d`.",
          ),
        ));
      }
      const [open] = await db
        .select({ n: count() })
        .from(reminders)
        .where(mine);
      if ((open?.n ?? 0) >= MAX_REMINDERS_PER_USER) {
        return void (await replyPrivate(
          interaction,
          t(
            "Du hast schon {MAX_REMINDERS_PER_USER} offene Erinnerungen. Lösche erst eine mit `/remind delete`.",
            { MAX_REMINDERS_PER_USER },
          ),
        ));
      }
      const dueAt = new Date(Date.now() + seconds * 1000);
      const dm = interaction.options.getBoolean("privat") ?? false;
      const [r] = await db
        .insert(reminders)
        .values({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          text: interaction.options.getString("text", true),
          dm,
          dueAt,
        })
        .returning();
      return void (await replyPrivate(
        interaction,
        t(
          "Alles klar, ich erinnere dich {n0} (in {seconds}) {n2}. Nummer #{id}.",
          {
            n0: time(dueAt, TimestampStyles.RelativeTime),
            seconds: formatDuration(seconds),
            n2: dm ? t("per Direktnachricht") : t("hier im Kanal"),
            id: r!.id,
          },
        ),
      ));
    }

    if (sub === "list") {
      const rows = await db
        .select()
        .from(reminders)
        .where(mine)
        .orderBy(asc(reminders.dueAt))
        .limit(MAX_REMINDERS_PER_USER);
      if (!rows.length)
        return void (await replyPrivate(
          interaction,
          t("Du hast keine offenen Erinnerungen."),
        ));
      const lines = rows.map(
        (r) =>
          `**#${r.id}** ${time(r.dueAt, TimestampStyles.RelativeTime)}${r.dm ? " ✉️" : ""} · ${clip(r.text.replace(/\s+/g, " "), 80)}`,
      );
      return void (await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x4cb4ff)
            .setTitle(t("Deine Erinnerungen"))
            .setDescription(lines.join("\n")),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      }));
    }

    const id = interaction.options.getInteger("nummer", true);
    const gone = await db
      .delete(reminders)
      .where(and(mine, eq(reminders.id, id)))
      .returning();
    await replyPrivate(
      interaction,
      gone.length
        ? t("Erinnerung #{id} ist gelöscht.", { id })
        : t("Du hast keine Erinnerung #{id}.", { id }),
    );
  },
};

// =============== /birthday ===============

export const birthday: Command = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Geburtstage auf diesem Server.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription(t("Trägt deinen Geburtstag ein."))
        .addIntegerOption((o) =>
          o
            .setName("tag")
            .setDescription(t("Tag (1–31)"))
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31),
        )
        .addIntegerOption((o) =>
          o
            .setName("monat")
            .setDescription(t("Monat (1–12)"))
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12),
        )
        .addIntegerOption((o) =>
          o
            .setName("jahr")
            .setDescription(
              t("Jahr (freiwillig, dann wird das Alter angezeigt)"),
            )
            .setMinValue(1900)
            .setMaxValue(2100),
        ),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription(t("Entfernt deinen Geburtstag.")),
    )
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription(t("Zeigt einen Geburtstag."))
        .addUserOption((o) =>
          o
            .setName("mitglied")
            .setDescription(t("Wessen Geburtstag? Leer = deiner")),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription(t("Die nächsten Geburtstage.")),
    ),

  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const today = localDate();

    if (sub === "set") {
      const day = interaction.options.getInteger("tag", true);
      const month = interaction.options.getInteger("monat", true);
      const year = interaction.options.getInteger("jahr");
      const error = validateBirthday(day, month, year);
      if (error) return void (await replyPrivate(interaction, error));
      await db
        .insert(birthdays)
        .values({ guildId, userId: interaction.user.id, month, day, year })
        .onConflictDoUpdate({
          target: [birthdays.guildId, birthdays.userId],
          set: { month, day, year },
        });
      const next = nextBirthday({ month, day }, today);
      const when =
        next.inDays === 0
          ? t("Das ist heute! 🎂")
          : t("Noch {inDays} {n1}.", {
              inDays: next.inDays,
              n1: next.inDays === 1 ? "Tag" : "Tage",
            });
      return void (await replyPrivate(
        interaction,
        t("Gespeichert: {n0}. {when}", {
          n0: formatBirthday({ day, month, year }),
          when,
        }),
      ));
    }

    if (sub === "remove") {
      const gone = await db
        .delete(birthdays)
        .where(
          and(
            eq(birthdays.guildId, guildId),
            eq(birthdays.userId, interaction.user.id),
          ),
        )
        .returning();
      return void (await replyPrivate(
        interaction,
        gone.length
          ? t("Dein Geburtstag ist entfernt.")
          : t("Du hattest keinen Geburtstag eingetragen."),
      ));
    }

    if (sub === "show") {
      const user = interaction.options.getUser("mitglied") ?? interaction.user;
      const [b] = await db
        .select()
        .from(birthdays)
        .where(
          and(eq(birthdays.guildId, guildId), eq(birthdays.userId, user.id)),
        );
      const self = user.id === interaction.user.id;
      if (!b) {
        return void (await replyPrivate(
          interaction,
          self
            ? t(
                "Du hast noch keinen Geburtstag eingetragen. Das geht mit `/birthday set`.",
              )
            : t("{id} hat keinen Geburtstag eingetragen.", {
                id: userMention(user.id),
              }),
        ));
      }
      const next = nextBirthday(b, today);
      const age = ageOn(b.year, next.year);
      // Das Jahr zeigen wir nur der Person selbst.
      const date = formatBirthday(self ? b : { day: b.day, month: b.month });
      const when =
        next.inDays === 0
          ? t("heute 🎂")
          : t("in {inDays} {n1}", {
              inDays: next.inDays,
              n1: next.inDays === 1 ? "Tag" : "Tagen",
            });
      return void (await replyPrivate(
        interaction,
        t("{n0} Geburtstag: {date}. Der nächste ist {when}{n3}.", {
          n0: self ? "Dein" : `${userMention(user.id)}s`,
          date,
          when,
          n3: age && self ? t(" (dann {age})", { age }) : "",
        }),
      ));
    }

    // list
    const rows = await db
      .select()
      .from(birthdays)
      .where(eq(birthdays.guildId, guildId))
      .limit(2000);
    const upcoming = rows
      .map((b) => ({ b, next: nextBirthday(b, today) }))
      .sort((a, z) => a.next.inDays - z.next.inDays)
      .slice(0, 15);
    if (!upcoming.length)
      return void (await replyPrivate(
        interaction,
        t(
          "Hier hat noch niemand einen Geburtstag eingetragen. Mach den Anfang mit `/birthday set`.",
        ),
      ));
    const lines = upcoming.map(({ b, next }) => {
      const when =
        next.inDays === 0
          ? t("**heute** 🎂")
          : next.inDays === 1
            ? "morgen"
            : t("in {inDays} Tagen", { inDays: next.inDays });
      return `${formatBirthday({ day: next.day, month: next.month })} · ${userMention(b.userId)} · ${when}`;
    });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff9f43)
          .setTitle(t("🎂 Die nächsten Geburtstage"))
          .setDescription(lines.join("\n")),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
