/**
 * Sprache des Bots: pro Server einstellbar (Dashboard oder /config sprache). Ohne Einstellung gilt die
 * Community-Sprache des Servers aus Discord. Alles, was ein Ereignis auslöst, läuft im Kontext dieser Sprache,
 * sodass `t()` überall die richtige Sprache findet.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Guild, type Client } from "discord.js";
import { eq, guildSettings, type Db } from "@libremod/db";
import {
  DEFAULT_LOCALE,
  isLocale,
  setLocaleResolver,
  toLocale,
  type Locale,
} from "@libremod/shared";

const store = new AsyncLocalStorage<Locale>();
setLocaleResolver(() => store.getStore() ?? null);

const TTL = 60_000;
const cache = new Map<string, { locale: Locale; at: number }>();
let database: Db | undefined;
let discord: Client | undefined;

export function initI18n(db: Db, client?: Client) {
  database = db;
  discord = client;
}

export function invalidateLocale(guildId: string) {
  cache.delete(guildId);
}

/** Sprache für neue Server: Community-Sprache aus Discord, sonst Englisch. */
export const localeFromDiscord = (
  preferred: string | null | undefined,
): Locale => toLocale(preferred, "en");

export function cachedLocale(guildId: string): Locale | undefined {
  const hit = cache.get(guildId);
  return hit && Date.now() - hit.at < TTL ? hit.locale : undefined;
}

export async function guildLocale(
  guildId: string | null | undefined,
): Promise<Locale> {
  if (!guildId) return DEFAULT_LOCALE;
  const hit = cachedLocale(guildId);
  if (hit) return hit;
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const [row] = database
      ? await database
          .select({ locale: guildSettings.locale })
          .from(guildSettings)
          .where(eq(guildSettings.guildId, guildId))
      : [];
    if (row && isLocale(row.locale)) locale = row.locale;
    else if (discord)
      locale = localeFromDiscord(
        discord.guilds.cache.get(guildId)?.preferredLocale,
      );
  } catch {
    /* Datenbank kurz weg: Standard */
  }
  cache.set(guildId, { locale, at: Date.now() });
  return locale;
}

export const runInLocale = <T>(locale: Locale, fn: () => T): T =>
  store.run(locale, fn);

/** Führt `fn` in der Sprache des Servers aus. */
export async function inGuildLocale<T>(
  guildId: string | null | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  return store.run(await guildLocale(guildId), fn);
}

function guildIdOf(args: unknown[]): string | null {
  for (const a of args) {
    if (!a || typeof a !== "object") continue;
    if (a instanceof Guild) return a.id;
    const o = a as {
      guildId?: unknown;
      guild?: { id?: unknown } | null;
      message?: { guildId?: unknown };
    };
    if (typeof o.guildId === "string") return o.guildId;
    if (o.guild && typeof o.guild.id === "string") return o.guild.id;
    if (o.message && typeof o.message.guildId === "string")
      return o.message.guildId;
  }
  return null;
}

/** Lässt alle Ereignis-Handler des Clients in der Sprache des betroffenen Servers laufen. */
export function localizeListeners(client: Client) {
  const wrap =
    (listener: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const guildId = guildIdOf(args);
      if (!guildId) return listener(...args);
      const hit = cachedLocale(guildId);
      if (hit) return store.run(hit, () => listener(...args));
      void guildLocale(guildId).then((l) =>
        store.run(l, () => listener(...args)),
      );
    };
  const on = client.on.bind(client);
  const once = client.once.bind(client);
  client.on = ((event: string, listener: (...args: unknown[]) => unknown) =>
    on(event, wrap(listener))) as typeof client.on;
  client.once = ((event: string, listener: (...args: unknown[]) => unknown) =>
    once(event, wrap(listener))) as typeof client.once;
}
