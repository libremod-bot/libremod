/**
 * Reine Prüf-Funktionen der Auto-Moderation. Sie kennen weder Discord noch die Datenbank
 * und sind dadurch einfach zu testen. Rückgabe: Grund des Verstoßes oder null.
 */

import { t } from "./i18n.js";
export const DEFAULT_THRESHOLDS = {
  /** Nachrichten innerhalb von SPAM_WINDOW_MS */
  spam: 5,
  /** Anteil Großbuchstaben in Prozent */
  caps: 70,
  /** Erwähnungen pro Nachricht */
  mentions: 5,
} as const;

export const SPAM_WINDOW_MS = 5_000;
export const DUPLICATE_WINDOW_MS = 30_000;
export const DUPLICATE_LIMIT = 3;
const CAPS_MIN_LETTERS = 10;

const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|dsc\.gg)\/[\w-]+/i;
const URL_RE = /\bhttps?:\/\/([^\s/<>"')]+)/gi;

export function checkInvites(content: string): string | null {
  return INVITE_RE.test(content) ? t("Einladungslink zu einem anderen Server") : null;
}

/** Erlaubte Domains gelten inklusive Subdomains (example.com erlaubt auch www.example.com). */
export function checkLinks(content: string, allowedDomains: string[] = []): string | null {
  const allowed = allowedDomains.map((d) => d.toLowerCase().replace(/^\*?\./, ""));
  for (const match of content.matchAll(URL_RE)) {
    const host = match[1]!.toLowerCase().split(":")[0]!.split("@").pop()!;
    const ok = allowed.some((d) => host === d || host.endsWith(`.${d}`));
    if (!ok) return t("Link zu {host}", { host });
  }
  return null;
}

/** Dateiarten, die Programme starten oder Systemeinstellungen ändern können. */
export const DEFAULT_BLOCKED_EXTENSIONS = [
  "exe", "scr", "com", "bat", "cmd", "msi", "msix", "ps1", "vbs", "vbe", "js", "jse", "wsf", "hta",
  "jar", "apk", "dll", "lnk", "reg", "cpl", "pif", "dmg", "pkg", "app", "sh", "iso",
];

/** Endung in Kleinbuchstaben ohne Punkt aufräumen; ungültige Einträge fallen weg. */
export function cleanExtensions(list: string[]): string[] {
  const out = list.map((e) => e.trim().toLowerCase().replace(/^\*?\./, "")).filter((e) => /^[a-z0-9]{1,10}$/.test(e));
  return [...new Set(out)];
}

/** Prüft Dateinamen von Anhängen. Zählt die letzte Endung, „bild.jpg.exe“ ist also eine .exe. */
export function checkFiles(names: string[], blocked: string[] = DEFAULT_BLOCKED_EXTENSIONS): string | null {
  const set = new Set(cleanExtensions(blocked));
  for (const name of names) {
    const ext = /\.([^.\s]+)\s*$/.exec(name)?.[1]?.toLowerCase();
    if (ext && set.has(ext)) return t("Gesperrte Dateiart (.{ext})", { ext });
  }
  return null;
}

export function checkCaps(content: string, thresholdPercent: number = DEFAULT_THRESHOLDS.caps): string | null {
  const letters = content.replace(/<[@#:&!a-z0-9_]+>/gi, "").match(/\p{L}/gu) ?? [];
  if (letters.length < CAPS_MIN_LETTERS) return null;
  const upper = letters.filter((l) => l !== l.toLowerCase()).length;
  const percent = (upper / letters.length) * 100;
  return percent >= thresholdPercent ? t("Zu viele Großbuchstaben ({n0} %)", { n0: Math.round(percent) }) : null;
}

export function checkMentions(
  mentionCount: number,
  everyoneAttempt: boolean,
  threshold: number = DEFAULT_THRESHOLDS.mentions,
): string | null {
  if (everyoneAttempt) return t("Versuch, @everyone oder @here zu erwähnen");
  return mentionCount >= threshold ? t("Zu viele Erwähnungen ({mentionCount})", { mentionCount }) : null;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Kleinschreibung, Akzente weg, einfache Ersatzzeichen auflösen und Wiederholungen kürzen. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/(\p{L})\1{2,}/gu, "$1$1");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Baut aus der Wortliste einen Ausdruck. "idiot*" trifft auch "idioten". */
export function compileWordList(words: string[]): RegExp | null {
  const parts = words
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => {
      const wildcard = w.endsWith("*");
      const base = escapeRegex(normalizeText(wildcard ? w.slice(0, -1) : w));
      return wildcard ? `${base}\\p{L}*` : base;
    });
  if (!parts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "u");
}

export function checkWords(content: string, list: RegExp | null): string | null {
  if (!list) return null;
  return list.test(normalizeText(content)) ? t("Verbotenes Wort") : null;
}

/**
 * Merkt sich die letzten Nachrichten pro Person und erkennt Spam: zu viele Nachrichten
 * in kurzer Zeit oder mehrfach derselbe Text.
 */
export class SpamTracker {
  private history = new Map<string, { at: number; text: string }[]>();

  check(key: string, content: string, threshold: number = DEFAULT_THRESHOLDS.spam, now = Date.now()): string | null {
    const text = normalizeText(content).trim();
    const entries = (this.history.get(key) ?? []).filter((e) => now - e.at < DUPLICATE_WINDOW_MS);
    entries.push({ at: now, text });
    this.history.set(key, entries);

    const recent = entries.filter((e) => now - e.at < SPAM_WINDOW_MS).length;
    if (recent >= threshold) return t("Zu viele Nachrichten ({recent} in {n1} Sekunden)", { recent, n1: SPAM_WINDOW_MS / 1000 });

    if (text) {
      const duplicates = entries.filter((e) => e.text === text).length;
      if (duplicates >= DUPLICATE_LIMIT) return t("Dieselbe Nachricht mehrfach gesendet");
    }
    return null;
  }

  /** Alte Einträge entfernen, damit der Speicher nicht wächst. */
  sweep(now = Date.now()) {
    for (const [key, entries] of this.history) {
      const kept = entries.filter((e) => now - e.at < DUPLICATE_WINDOW_MS);
      if (kept.length) this.history.set(key, kept);
      else this.history.delete(key);
    }
  }

  get size() {
    return this.history.size;
  }
}

/** Erkennt viele Beitritte in kurzer Zeit. */
export class JoinTracker {
  private joins = new Map<string, number[]>();

  /** Gibt true zurück, sobald die Schwelle innerhalb des Fensters erreicht ist. */
  record(guildId: string, threshold: number, windowSeconds: number, now = Date.now()): boolean {
    const recent = (this.joins.get(guildId) ?? []).filter((tItem) => now - tItem < windowSeconds * 1000);
    recent.push(now);
    this.joins.set(guildId, recent);
    return recent.length >= threshold;
  }
}
