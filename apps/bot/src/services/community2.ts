import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type User,
} from "discord.js";
import {
  and,
  countingChannels,
  eq,
  lte,
  sql,
  suggestions,
  suggestionSettings,
  suggestionVotes,
  tempRoles,
  type CountingChannel,
  type Db,
  type Suggestion,
  type SuggestionSettings,
  type SuggestionStatus,
} from "@libremod/db";
import {
  applyVote,
  buildSuggestionMessage,
  countReaction,
  extendExpiry,
  judgeCount,
  MIN_SUGGESTION_LENGTH,
  parseCount,
  parseSuggestionCustomId,
  SUGGESTION_STATUS,
} from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";
import { inGuildLocale } from "../i18n.js";

const isGone = (err: unknown) =>
  err instanceof DiscordAPIError &&
  [
    RESTJSONErrorCodes.UnknownMessage,
    RESTJSONErrorCodes.UnknownChannel,
    RESTJSONErrorCodes.MissingAccess,
  ].includes(err.code as number);

// =============== Vorschläge ===============

const settingsCache = new Map<
  string,
  { s: SuggestionSettings | null; at: number }
>();

export function invalidateSuggestions(guildId: string) {
  settingsCache.delete(guildId);
}

export async function loadSuggestionSettings(db: Db, guildId: string) {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < 60_000) return hit.s;
  const [s] = await db
    .select()
    .from(suggestionSettings)
    .where(eq(suggestionSettings.guildId, guildId));
  settingsCache.set(guildId, { s: s ?? null, at: Date.now() });
  return s ?? null;
}

export const isSuggestionInteraction = (customId: string) =>
  customId.startsWith("lmsg:");

function view(s: Suggestion, author?: User | null) {
  return {
    ...s,
    authorName: author?.globalName ?? author?.username,
    authorAvatar: author?.displayAvatarURL({ size: 64 }),
  };
}

/** Legt einen Vorschlag an und postet ihn. Bei einem Fehler wird er wieder entfernt. */
export async function createSuggestion(
  guild: Guild,
  db: Db,
  settings: SuggestionSettings,
  author: User,
  text: string,
) {
  if (!settings.channelId) throw new Error(t("Kein Vorschläge-Kanal"));
  const [counter] = await db
    .update(suggestionSettings)
    .set({ counter: sql`${suggestionSettings.counter} + 1` })
    .where(eq(suggestionSettings.guildId, guild.id))
    .returning({ counter: suggestionSettings.counter });
  const [row] = await db
    .insert(suggestions)
    .values({
      guildId: guild.id,
      number: counter!.counter,
      channelId: settings.channelId,
      authorId: author.id,
      text,
    })
    .returning();
  try {
    const channel = await guild.channels.fetch(settings.channelId);
    if (!channel?.isSendable()) throw new Error(t("Kanal nicht beschreibbar"));
    const msg = await channel.send(
      buildSuggestionMessage(view(row!, author), settings.anonymous) as never,
    );
    await db
      .update(suggestions)
      .set({ messageId: msg.id })
      .where(eq(suggestions.id, row!.id));
    if (settings.threads && "startThread" in msg) {
      await msg
        .startThread({
          name: t("Vorschlag #{number}", { number: row!.number }).slice(0, 100),
          autoArchiveDuration: 10080,
        })
        .catch(() => {});
    }
    return { ...row!, messageId: msg.id };
  } catch (err) {
    await db.delete(suggestions).where(eq(suggestions.id, row!.id));
    throw err;
  }
}

export async function handleSuggestionVote(
  interaction: ButtonInteraction,
  db: Db,
) {
  const parsed = parseSuggestionCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return;
  const clicked = parsed.action === "up" ? 1 : -1;
  const userId = interaction.user.id;

  const result = await db.transaction(async (tx) => {
    // Sperrt den Vorschlag kurz, damit Doppelklicks sauber nacheinander laufen.
    const [s] = await tx
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.id, parsed.id),
          eq(suggestions.guildId, interaction.guildId),
        ),
      )
      .for("update");
    if (!s) return "missing" as const;
    if (!SUGGESTION_STATUS[s.status].voting) return "closed" as const;
    if (s.authorId === userId) return "own" as const;
    const [prev] = await tx
      .select()
      .from(suggestionVotes)
      .where(
        and(
          eq(suggestionVotes.suggestionId, s.id),
          eq(suggestionVotes.userId, userId),
        ),
      );
    const v = applyVote((prev?.vote as 1 | -1 | undefined) ?? null, clicked);
    if (v.next === null)
      await tx
        .delete(suggestionVotes)
        .where(
          and(
            eq(suggestionVotes.suggestionId, s.id),
            eq(suggestionVotes.userId, userId),
          ),
        );
    else
      await tx
        .insert(suggestionVotes)
        .values({ suggestionId: s.id, userId, vote: v.next })
        .onConflictDoUpdate({
          target: [suggestionVotes.suggestionId, suggestionVotes.userId],
          set: { vote: v.next },
        });
    const [updated] = await tx
      .update(suggestions)
      .set({
        up: sql`${suggestions.up} + ${v.up}`,
        down: sql`${suggestions.down} + ${v.down}`,
      })
      .where(eq(suggestions.id, s.id))
      .returning();
    return { row: updated!, next: v.next };
  });

  const reply = (content: string) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (result === "missing")
    return void (await reply(t("Diesen Vorschlag gibt es nicht mehr.")));
  if (result === "closed")
    return void (await reply(
      t("Über diesen Vorschlag ist schon entschieden."),
    ));
  if (result === "own")
    return void (await reply(
      t("Für den eigenen Vorschlag kannst du nicht abstimmen."),
    ));

  const settings = await loadSuggestionSettings(db, interaction.guildId);
  const author = await interaction.client.users
    .fetch(result.row.authorId)
    .catch(() => null);
  await interaction.update(
    buildSuggestionMessage(
      view(result.row, author),
      settings?.anonymous ?? false,
    ) as never,
  );
}

/** Ändert den Status, aktualisiert die Nachricht und informiert auf Wunsch den Verfasser. */
export async function setSuggestionStatus(
  client: Client,
  db: Db,
  guildId: string,
  number: number,
  status: SuggestionStatus,
  reason: string | null,
  by: string,
) {
  const [row] = await db
    .update(suggestions)
    .set({ status, statusReason: reason, statusBy: by })
    .where(
      and(eq(suggestions.guildId, guildId), eq(suggestions.number, number)),
    )
    .returning();
  if (!row) return null;
  const settings = await loadSuggestionSettings(db, guildId);
  const author = await client.users.fetch(row.authorId).catch(() => null);
  if (row.messageId) {
    await client.rest
      .patch(`/channels/${row.channelId}/messages/${row.messageId}`, {
        body: buildSuggestionMessage(
          view(row, author),
          settings?.anonymous ?? false,
        ),
      })
      .catch((err) => {
        if (!isGone(err))
          logger.warn(
            { err, suggestion: row.id },
            "Vorschlag-Nachricht nicht aktualisiert",
          );
      });
  }
  if (settings?.dmAuthor && author && status !== "open") {
    const st = SUGGESTION_STATUS[status];
    const guild = client.guilds.cache.get(guildId);
    const link = row.messageId
      ? `\nhttps://discord.com/channels/${guildId}/${row.channelId}/${row.messageId}`
      : "";
    await author
      .send(
        t(
          "{emoji} Dein Vorschlag #{number} auf **{n2}** ist jetzt: **{label}**{n4}{link}",
          {
            emoji: st.emoji,
            number: row.number,
            n2: guild?.name ?? t("dem Server"),
            label: t(st.label),
            n4: reason ? t("\nBegründung: {reason}", { reason }) : "",
            link,
          },
        ).slice(0, 2000),
      )
      .catch(() => {});
  }
  return row;
}

/** Normale Nachrichten im Vorschläge-Kanal werden zu Vorschlägen. Gibt true zurück, wenn die Nachricht behandelt wurde. */
export async function handleSuggestionMessage(
  message: Message,
  db: Db,
): Promise<boolean> {
  if (!message.inGuild() || message.author.bot || message.system) return false;
  const s = await loadSuggestionSettings(db, message.guildId);
  if (!s?.enabled || !s.autoConvert || s.channelId !== message.channelId)
    return false;
  const text = message.content.trim();
  await message.delete().catch(() => {});
  if (text.length < MIN_SUGGESTION_LENGTH) {
    const hint = await message.channel
      .send({
        content: t(
          "<@{id}>, bitte beschreibe deinen Vorschlag in mindestens {MIN_SUGGESTION_LENGTH} Zeichen.",
          { id: message.author.id, MIN_SUGGESTION_LENGTH },
        ),
        allowedMentions: { users: [message.author.id] },
      })
      .catch(() => null);
    if (hint) setTimeout(() => void hint.delete().catch(() => {}), 8000);
    return true;
  }
  await createSuggestion(
    message.guild,
    db,
    s,
    message.author,
    text.slice(0, 2000),
  );
  return true;
}

// =============== Rollen mit Ablaufdatum ===============

/** Vergibt eine Rolle auf Zeit. Läuft schon eine, wird sie verlängert. */
export async function addTempRole(
  member: GuildMember,
  db: Db,
  roleId: string,
  seconds: number,
  by: string | null,
  source: string | null,
) {
  const [existing] = await db
    .select()
    .from(tempRoles)
    .where(
      and(
        eq(tempRoles.guildId, member.guild.id),
        eq(tempRoles.userId, member.id),
        eq(tempRoles.roleId, roleId),
      ),
    );
  const expiresAt = extendExpiry(existing?.expiresAt ?? null, seconds);
  await db
    .insert(tempRoles)
    .values({
      guildId: member.guild.id,
      userId: member.id,
      roleId,
      expiresAt,
      addedBy: by,
      source,
    })
    .onConflictDoUpdate({
      target: [tempRoles.guildId, tempRoles.userId, tempRoles.roleId],
      set: { expiresAt, addedBy: by, source },
    });
  if (!member.roles.cache.has(roleId))
    await member.roles.add(
      roleId,
      source ? t("Auf Zeit: {source}", { source }) : t("Rolle auf Zeit"),
    );
  return expiresAt;
}

export async function removeTempRole(
  member: GuildMember,
  db: Db,
  roleId: string,
  reason: string,
) {
  const gone = await db
    .delete(tempRoles)
    .where(
      and(
        eq(tempRoles.guildId, member.guild.id),
        eq(tempRoles.userId, member.id),
        eq(tempRoles.roleId, roleId),
      ),
    )
    .returning();
  if (member.roles.cache.has(roleId)) await member.roles.remove(roleId, reason);
  return gone.length > 0;
}

export async function runExpiredTempRoles(
  client: Client,
  db: Db,
  now = new Date(),
) {
  const due = await db
    .select()
    .from(tempRoles)
    .where(lte(tempRoles.expiresAt, now))
    .limit(50);
  for (const tItem of due) {
    await inGuildLocale(tItem.guildId, async () => {
      const guild = client.guilds.cache.get(tItem.guildId);
      if (!guild) return;
      // Nur entfernen, wenn der Eintrag noch abgelaufen ist (nicht inzwischen verlängert).
      const [claimed] = await db
        .delete(tempRoles)
        .where(
          and(
            eq(tempRoles.guildId, tItem.guildId),
            eq(tempRoles.userId, tItem.userId),
            eq(tempRoles.roleId, tItem.roleId),
            lte(tempRoles.expiresAt, now),
          ),
        )
        .returning();
      if (!claimed) return;
      const member = await guild.members.fetch(tItem.userId).catch(() => null);
      await member?.roles
        .remove(tItem.roleId, t("Rolle auf Zeit abgelaufen"))
        .catch((err) =>
          logger.warn(
            { err, guildId: tItem.guildId },
            "Rolle auf Zeit nicht entfernt",
          ),
        );
    });
  }
}

export async function onTempRoleMemberLeave(
  member: GuildMember | PartialGuildMember,
  db: Db,
) {
  await db
    .delete(tempRoles)
    .where(
      and(
        eq(tempRoles.guildId, member.guild.id),
        eq(tempRoles.userId, member.id),
      ),
    );
}

// =============== Zähl-Kanal ===============

let countingIds: Set<string> | null = null;

export function invalidateCounting() {
  countingIds = null;
}

async function isCountingChannel(db: Db, channelId: string) {
  if (!countingIds)
    countingIds = new Set(
      (
        await db
          .select({ id: countingChannels.channelId })
          .from(countingChannels)
      ).map((r) => r.id),
    );
  return countingIds.has(channelId);
}

// Nachrichten pro Kanal strikt nacheinander abarbeiten, damit die Reihenfolge stimmt.
const queues = new Map<string, Promise<unknown>>();

export function handleCountMessage(message: Message, db: Db): Promise<void> {
  const prev = queues.get(message.channelId) ?? Promise.resolve();
  const next = prev
    .then(() => countOne(message, db))
    .catch((err) =>
      logger.warn({ err, channel: message.channelId }, "Zählen fehlgeschlagen"),
    );
  queues.set(message.channelId, next);
  void next.then(() => {
    if (queues.get(message.channelId) === next)
      queues.delete(message.channelId);
  });
  return next;
}

async function countOne(message: Message, db: Db) {
  if (!message.inGuild() || message.author.bot || message.system) return;
  if (!(await isCountingChannel(db, message.channelId))) return;
  const [state] = await db
    .select()
    .from(countingChannels)
    .where(eq(countingChannels.channelId, message.channelId));
  if (!state) return;
  const n = parseCount(message.content);
  if (n === null) {
    if (state.onlyNumbers) await message.delete().catch(() => {});
    return;
  }
  let verdict = judgeCount(state, message.author.id, n);
  if (verdict === "ok") {
    const [saved] = await db
      .update(countingChannels)
      .set({
        current: n,
        lastUserId: message.author.id,
        record: sql`greatest(${countingChannels.record}, ${n})`,
      })
      .where(
        and(
          eq(countingChannels.channelId, state.channelId),
          eq(countingChannels.current, state.current),
        ),
      )
      .returning();
    if (saved) {
      await message.react(countReaction(n)).catch(() => {});
      if (n > state.record && state.record > 0 && n === state.record + 1) {
        await message.channel
          .send({ content: t("🎉 Neuer Rekord: **{n}**!", { n }) })
          .catch(() => {});
      }
      return;
    }
    verdict = "late";
  }
  if (verdict === "late") {
    await message.delete().catch(() => {});
    return;
  }
  await fail(message, db, state, n, verdict);
}

async function fail(
  message: Message<true>,
  db: Db,
  state: CountingChannel,
  n: number,
  verdict: "wrong" | "twice",
) {
  if (!state.resetOnFail) {
    await message.delete().catch(() => {});
    return;
  }
  const [reset] = await db
    .update(countingChannels)
    .set({
      current: 0,
      lastUserId: null,
      fails: sql`${countingChannels.fails} + 1`,
    })
    .where(
      and(
        eq(countingChannels.channelId, state.channelId),
        eq(countingChannels.current, state.current),
      ),
    )
    .returning();
  if (!reset) return;
  await message.react("❌").catch(() => {});
  const why =
    verdict === "twice"
      ? t("<@{id}> hat zweimal hintereinander gezählt.", {
          id: message.author.id,
        })
      : t("<@{id}> hat sich verzählt: **{n}** statt **{n2}**.", {
          id: message.author.id,
          n,
          n2: state.current + 1,
        });
  await message.channel
    .send({
      content: t("{why} Wir fangen wieder bei **1** an. Rekord: **{record}**", {
        why,
        record: reset.record,
      }),
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

export function startCommunityJobs(client: Client, db: Db): NodeJS.Timeout[] {
  return [
    setInterval(
      () =>
        void runExpiredTempRoles(client, db).catch((err) =>
          logger.error({ err }, "Rollen auf Zeit fehlgeschlagen"),
        ),
      60_000,
    ),
  ];
}
