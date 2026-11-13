import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { I18nProvider } from "@/components/I18n";
import { getUser } from "@/lib/session";
import { avatarUrl } from "@/lib/discord";
import { initLocale, LOCALES, t } from "@/lib/i18n";
import { currentTheme } from "@/lib/theme";
import { Icon } from "@/components/Icon";

export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return {
    title: t("Libremod Dashboard"),
    description: t("Libremod einstellen: kostenlose Moderation für Discord, ohne Paywall."),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await initLocale();
  const session = await getUser();
  const theme = await currentTheme();
  return (
    <html lang={locale} data-theme={theme ?? undefined}>
      <body>
        <header className="topbar">
          <Link href={session ? "/servers" : "/"} className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src="/logo-head.png" alt="" width={32} height={32} />
            {t("Libremod")}</Link>
          <div className="user">
            <form action="/api/theme" method="post" className="theme-switch">
              <button type="submit" name="theme" value="light" className="icon-button theme-to-light" title={t("Helles Design")} aria-label={t("Helles Design")}>
                <Icon name="sun" />
              </button>
              <button type="submit" name="theme" value="dark" className="icon-button theme-to-dark" title={t("Dunkles Design")} aria-label={t("Dunkles Design")}>
                <Icon name="moon" />
              </button>
            </form>
            <form action="/api/lang" method="post" className="lang-switch" aria-label={t("Sprache")}>
              {LOCALES.map((l) => (
                <button key={l} type="submit" name="lang" value={l} className="link small" aria-current={l === locale ? "true" : undefined}>
                  {l.toUpperCase()}
                </button>
              ))}
            </form>
            {session && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="avatar" src={avatarUrl(session.user)} alt="" />
                <span className="small">{session.user.username}</span>
                <form action="/api/auth/logout" method="post">
                  <button className="link small" type="submit">
                    {t("Abmelden")}
                  </button>
                </form>
              </>
            )}
          </div>
        </header>
        <main className="container">
          <I18nProvider locale={locale}>{children}</I18nProvider>
        </main>
      </body>
    </html>
  );
}
