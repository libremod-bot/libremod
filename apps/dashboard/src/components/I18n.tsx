"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, tl, type Locale, type Vars } from "@libremod/shared/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Übersetzen in Client-Komponenten: const t = useT(); t("Deutscher Text") */
export function useT() {
  const locale = useContext(LocaleContext);
  return (text: string, vars?: Vars) => tl(locale, text, vars);
}

export const useLocale = () => useContext(LocaleContext);
