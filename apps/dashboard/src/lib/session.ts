import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { env } from "./env";
import { initLocale } from "./i18n";

export interface SessionUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface SessionData {
  user?: SessionUser;
  accessToken?: string;
  /** Unix-Zeit in Millisekunden */
  expiresAt?: number;
  /** Schutz gegen gefälschte Login-Rückleitungen */
  oauthState?: string;
  /** Wohin es nach dem Login geht, z. B. zur Einspruch-Seite. */
  returnTo?: string;
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    cookieName: "libremod_session",
    password: env.sessionSecret,
    ttl: 7 * 24 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.dashboardUrl.startsWith("https://"),
      path: "/",
    },
  });
}

/** Liefert den eingeloggten Nutzer oder null, wenn keine gültige Sitzung besteht. */
export async function getUser() {
  await initLocale();
  const session = await getSession();
  if (!session.user || !session.accessToken || (session.expiresAt ?? 0) < Date.now()) return null;
  return { user: session.user, accessToken: session.accessToken };
}
