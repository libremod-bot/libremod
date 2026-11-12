import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@libremod/shared/i18n";
import { env } from "@/lib/env";
import { LOCALE_COOKIE } from "@/lib/i18n";

/** Sprache des Dashboards wechseln und zur vorherigen Seite zurück. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const lang = form.get("lang");
  let back = "/";
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === new URL(env.dashboardUrl).origin) back = url.pathname + url.search;
    } catch {
      /* ungültig: Startseite */
    }
  }
  const res = NextResponse.redirect(new URL(back, env.dashboardUrl), 303);
  if (isLocale(lang)) {
    res.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax", secure: env.dashboardUrl.startsWith("https://"), httpOnly: true });
  }
  return res;
}
