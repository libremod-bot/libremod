// --- Highlight-Kanal ---

/**
 * Erkennt ein Emoji aus dem Dashboard: Unicode-Emoji, `<:name:id>`, `<a:name:id>` oder eine reine ID.
 * Gespeichert wird das Unicode-Zeichen bzw. die ID des Server-Emojis.
 */
export function parseEmojiInput(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  const custom = /^<a?:\w{2,32}:(\d{17,20})>$/.exec(input);
  if (custom) return custom[1]!;
  if (/^\d{17,20}$/.test(input)) return input;
  // Genau ein Emoji (ggf. mit Varianten, Hautfarbe, ZWJ-Folgen), keine Buchstaben.
  if (input.length > 32 || /[\p{L}\p{N}\s]/u.test(input.replace(/[\u{1F1E6}-\u{1F1FF}#*0-9️⃣]/gu, ""))) return null;
  if (!/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|⃣/u.test(input)) return null;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(input)];
  return segments.length === 1 ? input : null;
}

/** Schlüssel einer Reaktion zum Vergleich mit {@link parseEmojiInput}. */
export function reactionKey(emoji: { id: string | null; name: string | null }) {
  return emoji.id ?? (emoji.name ? emoji.name.replace(/️/g, "") : "");
}

export function emojiMatches(stored: string, emoji: { id: string | null; name: string | null }) {
  return stored.replace(/️/g, "") === reactionKey(emoji);
}

// --- Kanäle leeren ---

export const PURGE_INTERVALS: { hours: number; label: string }[] = [
  { hours: 1, label: "jede Stunde" },
  { hours: 6, label: "alle 6 Stunden" },
  { hours: 12, label: "alle 12 Stunden" },
  { hours: 24, label: "täglich" },
  { hours: 72, label: "alle 3 Tage" },
  { hours: 168, label: "wöchentlich" },
];

export function purgeIntervalLabel(hours: number) {
  return PURGE_INTERVALS.find((i) => i.hours === hours)?.label ?? `alle ${hours} Stunden`;
}

/** Discord löscht nur Nachrichten, die jünger als 14 Tage sind, gesammelt. */
export const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;

// --- Automatischer Langsam-Modus ---

/** Stufen, die Discord im Kanalmenü auch anbietet (Sekunden). */
export const SLOWMODE_STEPS = [0, 5, 10, 15, 30, 60, 120, 300, 600] as const;

export interface SlowmodeConfig {
  messagesPerMinute: number;
  minSeconds: number;
  maxSeconds: number;
}

/**
 * Nächste Langsam-Modus-Stufe.
 * Ab der Schwelle eine Stufe, bei doppelter Aktivität zwei usw. Hoch geht es sofort,
 * runter immer nur eine Stufe pro Prüfung, damit der Kanal nicht hin- und herspringt.
 */
export function nextSlowmode(current: number, messagesLastMinute: number, cfg: SlowmodeConfig): number {
  const allowed = SLOWMODE_STEPS.filter((s) => s >= cfg.minSeconds && s <= cfg.maxSeconds);
  if (!allowed.length) return current;
  let level = 0;
  if (cfg.messagesPerMinute > 0 && messagesLastMinute >= cfg.messagesPerMinute) {
    level = Math.floor(Math.log2(messagesLastMinute / cfg.messagesPerMinute)) + 1;
  }
  const target = allowed[Math.min(level, allowed.length - 1)]!;
  if (target >= current) return target;
  // Eine Stufe runter.
  const lower = allowed.filter((s) => s < current);
  const oneDown = lower.length ? lower[lower.length - 1]! : allowed[0]!;
  return Math.max(target, oneDown);
}

export function formatSeconds(s: number) {
  if (s === 0) return "aus";
  if (s < 60) return `${s} Sek.`;
  return `${s / 60} Min.`;
}
