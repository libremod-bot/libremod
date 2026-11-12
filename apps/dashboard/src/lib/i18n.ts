import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, setLocaleResolver, type Locale } from "@libremod/shared/i18n";

export { t, tl, intlLocale, currentLocale, LOCALES, LOCALE_NAMES, type Locale } from "@libremod/shared/i18n";

/** Cookie mit der gewählten Sprache des Dashboards. */
export const LOCALE_COOKIE = "libremod_lang";

// Seiten: eine Ablage pro Anfrage (React cache). Server-Aktionen und Routen: AsyncLocalStorage.
const pageStore = cache((): { locale: Locale | null } => ({ locale: null }));
const actionStore = new AsyncLocalStorage<{ locale: Locale | null }>();

function page() {
  try {
    return pageStore();
  } catch {
    return null;
  }
}

setLocaleResolver(() => actionStore.getStore()?.locale ?? page()?.locale ?? null);

/** Wählt aus dem Accept-Language-Kopf des Browsers die passende Sprache. */
export function fromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const langs = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { base: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);
  for (const l of langs) if (isLocale(l.base)) return l.base;
  return "en";
}

/**
 * Legt die Sprache für diese Anfrage fest (Cookie, sonst Browser). Muss vor dem ersten `t()` laufen;
 * `getUser()` und `requireGuildAccess()` erledigen das.
 */
export async function initLocale(): Promise<Locale> {
  // Synchron vor dem ersten await, damit Server-Aktionen den Kontext erben.
  let store = actionStore.getStore();
  if (!store) {
    store = { locale: null };
    actionStore.enterWith(store);
  }
  const ref = page();
  if (store.locale) {
    if (ref) ref.locale = store.locale;
    return store.locale;
  }
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(chosen) ? chosen : fromAcceptLanguage((await headers()).get("accept-language"));
  store.locale = locale;
  if (ref) ref.locale = locale;
  return locale;
}

// Formatierer, die bei jedem Aufruf die aktuelle Sprache nehmen (dürfen auf Modulebene stehen).
import { intlLocale as currentIntl } from "@libremod/shared/i18n";
export const dateFmt = (opts?: Intl.DateTimeFormatOptions) => ({ format: (d: Date | number) => new Intl.DateTimeFormat(currentIntl(), opts).format(d) });
export const numFmt = (opts?: Intl.NumberFormatOptions) => ({ format: (n: number | bigint) => new Intl.NumberFormat(currentIntl(), opts).format(n) });
export const relFmt = (opts?: Intl.RelativeTimeFormatOptions) => ({
  format: (v: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(currentIntl(), opts).format(v, unit),
});
