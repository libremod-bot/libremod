import { intlLocale } from "./i18n.js";
/** Eigene Befehle und Zähler-Kanäle. */

export const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;
export const MAX_CUSTOM_COMMANDS = 50;

/** Namen der eingebauten Befehle, die eigene Befehle nicht überschreiben dürfen. */
export const RESERVED_COMMANDS = [
  "ping", "config", "automod", "logging", "welcome", "rank", "leaderboard", "xp",
  "warn", "timeout", "untimeout", "kick", "ban", "unban", "purge", "cases", "case", "ticket",
  "balance", "daily", "work", "pay", "shop", "buy", "inventory", "richlist", "coins",
  "giveaway", "poll", "remind", "birthday", "verify", "lockdown", "unlock", "note", "modstats",
  "suggest", "suggestion", "temprole", "quote", "massban", "masskick", "masstimeout", "event",
];

/** Antworten werden durch eine Zeile mit genau "---" getrennt. */
export function splitResponses(input: string): string[] {
  return input
    .replace(/\r\n?/g, "\n")
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pickResponse(responses: string[], random = Math.random): string {
  return responses[Math.floor(random() * responses.length)] ?? "";
}

export interface CounterValues {
  members: number;
  boosts: number;
  channels: number;
  roles: number;
}

export const COUNTER_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "{members}", description: "Mitglieder" },
  { key: "{boosts}", description: "Server-Boosts" },
  { key: "{channels}", description: "Kanäle" },
  { key: "{roles}", description: "Rollen" },
];

const nf = { format: (n: number | bigint) => new Intl.NumberFormat(intlLocale()).format(n) };

export function renderCounter(template: string, v: CounterValues): string {
  return template
    .replace(/\{(members|boosts|channels|roles)\}/gi, (_, k: string) => nf.format(v[k.toLowerCase() as keyof CounterValues]))
    .slice(0, 100);
}
