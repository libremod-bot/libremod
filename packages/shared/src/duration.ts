import { t } from "./i18n.js";
const UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
};

/**
 * Liest Dauerangaben wie "30m", "2h", "1d12h" oder "1w" und gibt Sekunden zurück.
 * Gibt null zurück, wenn die Eingabe nicht verstanden wird.
 */
export function parseDuration(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!cleaned || !/^(\d+[smhdw])+$/.test(cleaned)) return null;

  let total = 0;
  for (const [, amount, unit] of cleaned.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(amount) * UNITS[unit!]!;
  }
  return total > 0 ? total : null;
}

/** Gibt Sekunden lesbar auf Deutsch aus, z. B. "1 Tag 2 Stunden". */
export function formatDuration(seconds: number): string {
  const parts: string[] = [];
  const steps: [number, string, string][] = [
    [UNITS.w!, "Woche", "Wochen"],
    [UNITS.d!, "Tag", "Tage"],
    [UNITS.h!, "Stunde", "Stunden"],
    [UNITS.m!, "Minute", "Minuten"],
    [1, "Sekunde", "Sekunden"],
  ];
  let rest = seconds;
  for (const [size, one, many] of steps) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n} ${n === 1 ? one : many}`);
      rest -= n * size;
    }
  }
  return parts.length ? parts.slice(0, 2).join(" ") : t("0 Sekunden");
}

/** Discord erlaubt Timeouts von höchstens 28 Tagen. */
export const MAX_TIMEOUT_SECONDS = 28 * UNITS.d!;
