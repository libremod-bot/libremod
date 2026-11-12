/**
 * Wortkette, Zitate und Sprachkanal-Rollen: gemeinsame Logik für Bot und Dashboard.
 */

// --- Wortkette ---

import { t } from "./i18n.js";
export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 40;

/** Ein einzelnes Wort aus Buchstaben (Bindestrich erlaubt), kleingeschrieben. Sonst null. */
export function parseWord(content: string): string | null {
  const tItem = content.trim().toLocaleLowerCase("de-DE");
  if (tItem.length < MIN_WORD_LENGTH || tItem.length > MAX_WORD_LENGTH) return null;
  return /^\p{L}+(?:-\p{L}+)*$/u.test(tItem) ? tItem : null;
}

/** Buchstabe ohne Akzent und Umlaut-Punkte, ß zählt als s. */
function baseLetter(ch: string): string {
  if (ch === "ß") return "s";
  return ch.normalize("NFD").replace(/\p{M}/gu, "");
}

export function firstLetter(word: string): string {
  return baseLetter([...word.replace(/-/g, "")][0] ?? "");
}

export function lastLetter(word: string): string {
  const letters = [...word.replace(/-/g, "")];
  return baseLetter(letters[letters.length - 1] ?? "");
}

export type WordResult = "ok" | "letter" | "twice" | "used";

export function judgeWord(
  state: { lastWord: string | null; lastUserId: string | null; allowSameUser: boolean },
  userId: string,
  word: string,
  alreadyUsed: boolean,
): WordResult {
  if (state.lastWord && firstLetter(word) !== lastLetter(state.lastWord)) return "letter";
  if (!state.allowSameUser && state.lastUserId === userId) return "twice";
  if (alreadyUsed) return "used";
  return "ok";
}

export function wordHint(result: Exclude<WordResult, "ok">, lastWord: string | null): string {
  if (result === "letter") return t("Das nächste Wort muss mit **{n0}** anfangen.", { n0: lastLetter(lastWord ?? "").toUpperCase() });
  if (result === "twice") return t("Bitte warte, bis jemand anderes ein Wort geschrieben hat.");
  return t("Dieses Wort gab es in dieser Kette schon.");
}

// --- Zitate ---

export const MAX_QUOTE_LENGTH = 1000;

export interface QuoteView {
  number: number;
  text: string;
  authorId: string | null;
  authorName: string | null;
  channelId: string | null;
  messageId: string | null;
  guildId: string;
  createdAt: Date;
}

/** Embed für ein Zitat (Discord-API-Form). */
export function quoteEmbed(q: QuoteView, avatarUrl?: string) {
  const who = q.authorId ? `<@${q.authorId}>` : (q.authorName ?? "Unbekannt");
  const link = q.channelId && q.messageId ? ` · [zur Nachricht](https://discord.com/channels/${q.guildId}/${q.channelId}/${q.messageId})` : "";
  return {
    description: `„${q.text.length > 3900 ? `${q.text.slice(0, 3899)}…` : q.text}“\n\n— ${who}${link}`,
    color: 0xf5c542,
    footer: { text: t("Zitat #{number}", { number: q.number }) },
    timestamp: q.createdAt.toISOString(),
    ...(avatarUrl ? { thumbnail: { url: avatarUrl } } : {}),
  };
}

// --- Sprachkanal-Rollen ---

export const ANY_VOICE_CHANNEL = "*";

/** Welche Rollen jemand in diesem Sprachkanal haben soll (null = in keinem Kanal). */
export function voiceRolesFor(rows: { channelId: string; roleId: string }[], channelId: string | null): Set<string> {
  if (!channelId) return new Set();
  return new Set(rows.filter((r) => r.channelId === ANY_VOICE_CHANNEL || r.channelId === channelId).map((r) => r.roleId));
}
