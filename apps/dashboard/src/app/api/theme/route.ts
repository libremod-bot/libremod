import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

/** Hell oder dunkel umschalten und zur vorherigen Seite zurück. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const theme = form.get("theme");
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
  if (isTheme(theme)) {
    res.cookies.set(THEME_COOKIE, theme, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax", secure: env.dashboardUrl.startsWith("https://"), httpOnly: true });
  }
  return res;
}
