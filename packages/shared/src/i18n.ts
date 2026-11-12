/**
 * Mehrsprachigkeit. Texte stehen im Code auf Deutsch und werden über `t("Deutscher Text")` übersetzt.
 * Die Übersetzungen liegen in i18n/<sprache>.ts, Schlüssel ist jeweils der deutsche Text.
 * Fehlt eine Übersetzung, bleibt der deutsche Text stehen.
 *
 * Welche Sprache gerade gilt, entscheidet die App über `setLocaleResolver` (Bot: Sprache des Servers,
 * Dashboard: Sprache der angemeldeten Person).
 */
import { en } from "./i18n/en.js";

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

export const LOCALE_NAMES: Record<Locale, string> = { de: "Deutsch", en: "English" };
/** Für Intl (Datum, Zahlen) */
export const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-GB" };

const DICTS: Record<Locale, Record<string, string> | null> = { de: null, en };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Wandelt z. B. "en-US" oder "de" in eine unterstützte Sprache um. */
export function toLocale(v: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!v) return fallback;
  const base = v.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : fallback;
}

let resolver: () => Locale | null | undefined = () => null;

/** Legt fest, woher `t()` die aktuelle Sprache nimmt. */
export function setLocaleResolver(fn: () => Locale | null | undefined) {
  resolver = fn;
}

export function currentLocale(): Locale {
  return resolver() ?? DEFAULT_LOCALE;
}

export type Vars = Record<string, string | number | null | undefined>;

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m)) : s;

/** Übersetzt einen deutschen Text in die aktuelle Sprache. Platzhalter wie {name} werden aus `vars` gefüllt. */
export function t(text: string | null | undefined, vars?: Vars): string {
  return tl(currentLocale(), text, vars);
}

/** Wie `t`, aber mit fester Sprache. */
export function tl(locale: Locale, text: string | null | undefined, vars?: Vars): string {
  if (!text) return "";
  const dict = DICTS[locale];
  return fill((dict && dict[text]) || text, vars);
}

/** Alle Übersetzungen eines Textes, z. B. für Discord-Befehle. */
export function translations(text: string): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {};
  for (const l of LOCALES) {
    const d = DICTS[l];
    if (d?.[text]) out[l] = d[text];
  }
  return out;
}

export const intlLocale = () => INTL_LOCALE[currentLocale()];

/** Nur für Prüfungen: das Wörterbuch einer Sprache. */
export const dictionary = (l: Locale) => DICTS[l] ?? {};
