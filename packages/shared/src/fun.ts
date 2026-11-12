/**
 * Community-Funktionen: Gewinnspiele, Umfragen, Erinnerungen und Geburtstage.
 * Gemeinsame Logik für Bot und Dashboard.
 */

// --- Gewinnspiele ---

import { t } from "./i18n.js";
export const GIVEAWAY_COLOR = 0xff6fae;
export const GIVEAWAY_ENDED_COLOR = 0x80848e;
export const MAX_GIVEAWAY_WINNERS = 20;
export const MAX_ACTIVE_GIVEAWAYS = 25;
export const MIN_GIVEAWAY_SECONDS = 60;
export const MAX_GIVEAWAY_SECONDS = 60 * 24 * 60 * 60;

const GW_PREFIX = "lmgw";

export function giveawayCustomId(id: number, action: "join" | "leave" = "join") {
  return `${GW_PREFIX}:${action}:${id}`;
}

export function parseGiveawayCustomId(customId: string): { action: "join" | "leave"; id: number } | null {
  const m = /^lmgw:(join|leave):(\d{1,10})$/.exec(customId);
  return m ? { action: m[1] as "join" | "leave", id: Number(m[2]) } : null;
}

/**
 * Zieht bis zu n verschiedene Gewinner (Fisher-Yates auf einer Kopie).
 * `exclude` sind Personen, die nicht noch einmal gewinnen sollen (z. B. beim Neu-Auslosen).
 */
export function pickWinners(entries: string[], n: number, random = Math.random, exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  const pool = [...new Set(entries)].filter((id) => !skip.has(id));
  const count = Math.min(Math.max(0, Math.floor(n)), pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

export interface GiveawayView {
  id: number;
  prize: string;
  description: string;
  winners: number;
  hostId: string;
  requiredRoleId: string | null;
  minLevel: number;
  endsAt: Date;
  ended: boolean;
  winnerIds: string[];
}

/** Nachricht für POST/PATCH /channels/{id}/messages und für discord.js. */
export function buildGiveawayMessage(g: GiveawayView, entrants: number) {
  const lines: string[] = [];
  if (g.description.trim()) lines.push(g.description.trim(), "");
  if (g.ended) {
    lines.push(
      g.winnerIds.length
        ? t("🏆 Gewinner: {n0}", { n0: g.winnerIds.map((id) => `<@${id}>`).join(", ") })
        : t("Leider hat niemand teilgenommen."),
    );
    lines.push(t("Beendet <t:{endsAt}:R>", { endsAt: unix(g.endsAt) }));
  } else {
    lines.push(t("Endet <t:{endsAt}:R> (<t:{endsAt}:f>)", { endsAt: unix(g.endsAt) }));
    lines.push(t("{n0} · Klicke auf den Knopf, um mitzumachen.", { n0: g.winners === 1 ? t("1 Gewinner") : t("{winners} Gewinner", { winners: g.winners }) }));
  }
  const rules: string[] = [];
  if (g.requiredRoleId) rules.push(t("Rolle <@&{requiredRoleId}>", { requiredRoleId: g.requiredRoleId }));
  if (g.minLevel > 0) rules.push(t("mindestens Level {minLevel}", { minLevel: g.minLevel }));
  if (rules.length) lines.push(t("Teilnahme nur mit: {n0}", { n0: rules.join(t(" und ")) }));
  lines.push(t("Veranstaltet von <@{hostId}>", { hostId: g.hostId }));

  return {
    embeds: [
      {
        title: `🎁 ${clip(g.prize, 240)}`,
        description: clip(lines.join("\n"), 4000),
        color: g.ended ? GIVEAWAY_ENDED_COLOR : GIVEAWAY_COLOR,
        footer: { text: t("{entrants} {n1} · Gewinnspiel #{id}", { entrants, n1: entrants === 1 ? t("Teilnahme") : t("Teilnahmen"), id: g.id }) },
        timestamp: g.endsAt.toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: g.ended ? 2 : 1,
            custom_id: giveawayCustomId(g.id),
            label: g.ended ? t("Beendet") : t("Mitmachen"),
            emoji: { name: "🎉" },
            disabled: g.ended,
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** Text der Gewinner-Bekanntgabe. */
export function giveawayResultText(prize: string, winnerIds: string[], reroll = false): string {
  if (!winnerIds.length) return t("Beim Gewinnspiel um **{n0}** gab es keine gültigen Teilnahmen.", { n0: clip(prize, 200) });
  const who = winnerIds.map((id) => `<@${id}>`).join(", ");
  return reroll
    ? winnerIds.length === 1
      ? t("🎲 Neu ausgelost: {who} gewinnt **{n2}**!", { who, n2: clip(prize, 200) })
      : t("🎲 Neu ausgelost: {who} gewinnen **{n2}**!", { who, n2: clip(prize, 200) })
    : t("🎉 Glückwunsch {who}! {n1} **{n2}** gewonnen.", { who, n1: winnerIds.length === 1 ? t("Du hast") : t("Ihr habt"), n2: clip(prize, 200) });
}

// --- Umfragen ---

export const MAX_POLL_OPTIONS = 10;
export const MAX_POLL_ANSWER_LENGTH = 55;
export const MAX_POLL_QUESTION_LENGTH = 300;
/** Discord erlaubt Umfragen von 1 bis 768 Stunden (32 Tage). */
export const MAX_POLL_HOURS = 768;

/** Antworten durch Semikolon oder Zeilenumbruch getrennt. Gibt eine Fehlermeldung oder die Liste zurück. */
export function parsePollOptions(input: string): { ok: true; options: string[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of input.split(/[;\n]/)) {
    const o = raw.trim();
    if (!o) continue;
    const key = o.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(o);
  }
  if (options.length < 2) return { ok: false, error: t("Bitte mindestens zwei Antworten angeben, getrennt mit `;`.") };
  if (options.length > MAX_POLL_OPTIONS) return { ok: false, error: t("Höchstens {MAX_POLL_OPTIONS} Antworten sind möglich.", { MAX_POLL_OPTIONS }) };
  const long = options.find((o) => o.length > MAX_POLL_ANSWER_LENGTH);
  if (long) return { ok: false, error: t("Die Antwort „{n0}“ ist zu lang (höchstens {MAX_POLL_ANSWER_LENGTH} Zeichen).", { n0: clip(long, 30), MAX_POLL_ANSWER_LENGTH }) };
  return { ok: true, options };
}

// --- Erinnerungen ---

export const MAX_REMINDERS_PER_USER = 25;
export const MAX_REMINDER_SECONDS = 365 * 24 * 60 * 60;

// --- Geburtstage ---

export const BIRTHDAY_TIMEZONE = "Europe/Berlin";
export const BIRTHDAY_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "{user}", description: "Erwähnung des Geburtstagskinds" },
  { key: "{name}", description: "Anzeigename" },
  { key: "{age}", description: "neues Alter (leer, wenn kein Jahr angegeben)" },
  { key: "{server}", description: "Servername" },
];

export const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export interface LocalDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  /** YYYY-MM-DD */
  iso: string;
}

/** Datum und Stunde in der angegebenen Zeitzone. */
export function localDate(now = new Date(), timeZone = BIRTHDAY_TIMEZONE): LocalDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), iso: `${parts.year}-${parts.month}-${parts.day}` };
}

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysInMonth(month: number, year: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Prüft eine Eingabe. Jahr ist optional (1900 bis heute). */
export function validateBirthday(day: number, month: number, year?: number | null, now = new Date()): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return t("Bitte einen Monat zwischen 1 und 12 angeben.");
  // Ohne Jahr ist der 29. Februar erlaubt.
  const maxDay = daysInMonth(month, year ?? 2000);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return t("Den {day}. {n1} gibt es {n2}nicht.", { day, n1: t(MONTH_NAMES[month - 1]), n2: year ? `${year} ` : "" });
  if (year != null) {
    const today = localDate(now);
    if (!Number.isInteger(year) || year < 1900 || year > today.year) return t("Bitte ein gültiges Geburtsjahr angeben.");
    if (year === today.year && (month > today.month || (month === today.month && day > today.day))) return t("Das Datum liegt in der Zukunft.");
  }
  return null;
}

/** Am 29. Februar Geborene feiern in Nicht-Schaltjahren am 28. Februar. */
export function celebrationDay(month: number, day: number, year: number): { month: number; day: number } {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { month: 2, day: 28 };
  return { month, day };
}

/** Alle (Monat, Tag)-Paare, die an diesem Datum gefeiert werden. */
export function birthdayKeysOn(date: { year: number; month: number; day: number }): { month: number; day: number }[] {
  const keys = [{ month: date.month, day: date.day }];
  if (date.month === 2 && date.day === 28 && !isLeapYear(date.year)) keys.push({ month: 2, day: 29 });
  return keys;
}

/** Nächster Geburtstag ab heute (heute zählt mit). Gibt das Datum und die Tage bis dahin zurück. */
export function nextBirthday(b: { month: number; day: number }, today: { year: number; month: number; day: number }) {
  const ref = Date.UTC(today.year, today.month - 1, today.day);
  for (const year of [today.year, today.year + 1, today.year + 2]) {
    const c = celebrationDay(b.month, b.day, year);
    const tItem = Date.UTC(year, c.month - 1, c.day);
    if (tItem >= ref) return { year, month: c.month, day: c.day, inDays: Math.round((tItem - ref) / 86_400_000) };
  }
  throw new Error("unreachable");
}

/** Alter, das an diesem Geburtstag erreicht wird. */
export function ageOn(birthYear: number | null | undefined, year: number): number | null {
  return birthYear ? year - birthYear : null;
}

export function formatBirthday(b: { month: number; day: number; year?: number | null }): string {
  return `${b.day}. ${t(MONTH_NAMES[b.month - 1])}${b.year ? ` ${b.year}` : ""}`;
}

export function renderBirthdayMessage(template: string, v: { userId: string; name: string; age: number | null; server: string }): string {
  return template
    .replaceAll("{user}", `<@${v.userId}>`)
    .replaceAll("{name}", v.name)
    .replaceAll("{age}", v.age == null ? "" : String(v.age))
    .replaceAll("{server}", v.server)
    .slice(0, 2000);
}
