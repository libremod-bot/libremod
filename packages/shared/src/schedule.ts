/** Zeitpläne für wiederkehrende Nachrichten. Uhrzeiten gelten in deutscher Zeit (Sommer- und Winterzeit). */

import { t } from "./i18n.js";
export const SCHEDULE_TIME_ZONE = "Europe/Berlin";
export const MIN_INTERVAL_MINUTES = 10;

export type Schedule =
  | { kind: "interval"; intervalMinutes: number }
  | { kind: "daily"; timeOfDay: string }
  | { kind: "weekly"; timeOfDay: string; weekday: number };

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Ortszeit in Berlin für einen Zeitpunkt. */
export function berlinParts(date: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday as string] ?? 1,
  };
}

/** Wandelt eine Berliner Ortszeit in einen echten Zeitpunkt um. */
export function berlinToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = shown - wanted;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export function parseTimeOfDay(value: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** Nächster Termin strikt nach `after`. */
export function nextRun(schedule: Schedule, after: Date): Date {
  if (schedule.kind === "interval") {
    return new Date(after.getTime() + Math.max(MIN_INTERVAL_MINUTES, schedule.intervalMinutes) * 60_000);
  }
  const time = parseTimeOfDay(schedule.timeOfDay) ?? { hour: 12, minute: 0 };
  const today = berlinParts(after);
  // Kalendertage in Berlin durchgehen (UTC-Mittag als Hilfsdatum, damit Datumsrechnung stabil bleibt).
  const base = Date.UTC(today.year, today.month - 1, today.day, 12);
  for (let offset = 0; offset <= 8; offset++) {
    const d = new Date(base + offset * 86_400_000);
    const weekday = ((d.getUTCDay() + 6) % 7) + 1;
    if (schedule.kind === "weekly" && weekday !== schedule.weekday) continue;
    const candidate = berlinToDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), time.hour, time.minute);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error(t("Kein nächster Termin gefunden"));
}

export const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function describeSchedule(s: Schedule): string {
  if (s.kind === "interval") {
    const m = s.intervalMinutes;
    if (m % 1440 === 0) return m === 1440 ? t("jeden Tag") : t("alle {n0} Tage", { n0: m / 1440 });
    if (m % 60 === 0) return m === 60 ? t("jede Stunde") : t("alle {n0} Stunden", { n0: m / 60 });
    return t("alle {m} Minuten", { m });
  }
  if (s.kind === "daily") return t("täglich um {timeOfDay} Uhr", { timeOfDay: s.timeOfDay });
  return t("jeden {n0} um {timeOfDay} Uhr", { n0: t(WEEKDAY_NAMES[s.weekday - 1]), timeOfDay: s.timeOfDay });
}

/** Baut einen Zeitplan aus einer Datenbankzeile. */
export function toSchedule(m: { kind: string; intervalMinutes: number | null; timeOfDay: string | null; weekday: number | null }): Schedule {
  if (m.kind === "interval") return { kind: "interval", intervalMinutes: m.intervalMinutes ?? 60 };
  if (m.kind === "daily") return { kind: "daily", timeOfDay: m.timeOfDay ?? "12:00" };
  return { kind: "weekly", timeOfDay: m.timeOfDay ?? "12:00", weekday: m.weekday ?? 1 };
}
