import type { Message, VoiceState } from "discord.js";
import { and, eq, sql, voiceRoles, wordChainChannels, wordChainWords, quotes, type Db, type VoiceRole } from "@libremod/db";
import { judgeWord, parseWord, voiceRolesFor, wordHint } from "@libremod/shared";
import { logger } from "../logger.js";

// =============== Sprachkanal-Rollen ===============

const voiceCache = new Map<string, { rows: VoiceRole[]; loadedAt: number }>();
const CACHE_TTL_MS = 60_000;

export function invalidateVoiceRoles(guildId: string) {
  voiceCache.delete(guildId);
}

async function loadVoiceRoles(db: Db, guildId: string) {
  const hit = voiceCache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.rows;
  const rows = await db.select().from(voiceRoles).where(eq(voiceRoles.guildId, guildId));
  voiceCache.set(guildId, { rows, loadedAt: Date.now() });
  return rows;
}

/** Gibt beim Betreten die passenden Rollen und nimmt sie beim Verlassen oder Wechseln wieder weg. */
export async function onVoiceRoleState(before: VoiceState, after: VoiceState, db: Db) {
  if (before.channelId === after.channelId) return;
  const member = after.member ?? before.member;
  if (!member || member.user.bot) return;
  const rows = await loadVoiceRoles(db, member.guild.id);
  if (!rows.length) return;
  const all = new Set(rows.map((r) => r.roleId));
  const want = voiceRolesFor(rows, after.channelId);
  const me = member.guild.members.me;
  const manageable = (id: string) => {
    const role = member.guild.roles.cache.get(id);
    return !!role && !role.managed && !!me && role.position < me.roles.highest.position;
  };
  const add = [...want].filter((id) => manageable(id) && !member.roles.cache.has(id));
  const remove = [...all].filter((id) => !want.has(id) && manageable(id) && member.roles.cache.has(id));
  try {
    if (add.length) await member.roles.add(add, "Libremod: im Sprachkanal");
    if (remove.length) await member.roles.remove(remove, "Libremod: Sprachkanal verlassen");
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id }, "Sprachkanal-Rolle konnte nicht geändert werden");
  }
}

// =============== Wortkette ===============

let chainIds: Set<string> | null = null;

export function invalidateWordChains() {
  chainIds = null;
}

async function isChainChannel(db: Db, channelId: string) {
  if (!chainIds) chainIds = new Set((await db.select({ id: wordChainChannels.channelId }).from(wordChainChannels)).map((r) => r.id));
  return chainIds.has(channelId);
}

const queues = new Map<string, Promise<unknown>>();

/** Nachrichten pro Kanal strikt nacheinander, damit die Kette stimmt. */
export function handleWordChainMessage(message: Message, db: Db): Promise<void> {
  const prev = queues.get(message.channelId) ?? Promise.resolve();
  const next = prev.then(() => chainOne(message, db)).catch((err) => logger.warn({ err, channel: message.channelId }, "Wortkette fehlgeschlagen"));
  queues.set(message.channelId, next);
  void next.then(() => {
    if (queues.get(message.channelId) === next) queues.delete(message.channelId);
  });
  return next;
}

async function hint(message: Message<true>, text: string) {
  const reply = await message.channel.send({ content: `<@${message.author.id}> ${text}`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  if (reply) setTimeout(() => void reply.delete().catch(() => {}), 6000).unref();
}

async function chainOne(message: Message, db: Db) {
  if (!message.inGuild() || message.author.bot || message.system) return;
  if (!(await isChainChannel(db, message.channelId))) return;
  const [state] = await db.select().from(wordChainChannels).where(eq(wordChainChannels.channelId, message.channelId));
  if (!state) return;
  const word = parseWord(message.content);
  if (!word) {
    await message.delete().catch(() => {});
    await hint(message, "Hier zählt nur ein einzelnes Wort.");
    return;
  }
  const [used] = await db
    .select({ w: wordChainWords.word })
    .from(wordChainWords)
    .where(and(eq(wordChainWords.channelId, state.channelId), eq(wordChainWords.word, word)));
  const verdict = judgeWord(state, message.author.id, word, !!used);
  if (verdict !== "ok") {
    await message.delete().catch(() => {});
    await hint(message, wordHint(verdict, state.lastWord));
    return;
  }
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(wordChainChannels)
      .set({ lastWord: word, lastUserId: message.author.id, length: sql`${wordChainChannels.length} + 1`, record: sql`greatest(${wordChainChannels.record}, ${wordChainChannels.length} + 1)` })
      .where(and(eq(wordChainChannels.channelId, state.channelId), eq(wordChainChannels.length, state.length)))
      .returning();
    if (!row) return null;
    await tx.insert(wordChainWords).values({ channelId: state.channelId, word }).onConflictDoNothing();
    return row;
  });
  if (!saved) {
    await message.delete().catch(() => {});
    return;
  }
  await message.react("✅").catch(() => {});
  if (saved.length > state.record && state.record > 0 && saved.length === state.record + 1) {
    await message.channel.send({ content: `🎉 Neuer Rekord: **${saved.length}** Wörter am Stück!` }).catch(() => {});
  }
}

/** Kette neu starten: Wörter vergessen, Länge auf 0. */
export async function resetWordChain(db: Db, channelId: string) {
  await db.transaction(async (tx) => {
    await tx.update(wordChainChannels).set({ lastWord: null, lastUserId: null, length: 0 }).where(eq(wordChainChannels.channelId, channelId));
    await tx.delete(wordChainWords).where(eq(wordChainWords.channelId, channelId));
  });
}

// =============== Zitate ===============

/** Speichert ein Zitat mit der nächsten freien Nummer. Gibt null zurück, wenn die Nachricht schon gespeichert ist. */
export async function saveQuote(
  db: Db,
  q: { guildId: string; text: string; authorId: string | null; authorName: string | null; savedBy: string; channelId: string | null; messageId: string | null },
) {
  return db.transaction(async (tx) => {
    // Pro Server nacheinander nummerieren, damit gleichzeitige Speicherungen keine Nummer doppelt vergeben.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`quotes:${q.guildId}`}))`);
    const [row] = await tx
      .insert(quotes)
      .values({ ...q, number: sql`coalesce((select max(${quotes.number}) from ${quotes} where ${quotes.guildId} = ${q.guildId}), 0) + 1` })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  });
}
