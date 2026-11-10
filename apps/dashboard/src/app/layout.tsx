import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getUser } from "@/lib/session";
import { avatarUrl } from "@/lib/discord";

export const metadata: Metadata = {
  title: "Libremod Dashboard",
  description: "Libremod einstellen: kostenlose Moderation für Discord, ohne Paywall.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getUser();
  return (
    <html lang="de">
      <body>
        <header className="topbar">
          <Link href={session ? "/servers" : "/"} className="brand">
            Libre<span>mod</span>
          </Link>
          {session && (
            <div className="user">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="avatar" src={avatarUrl(session.user)} alt="" />
              <span className="small">{session.user.username}</span>
              <form action="/api/auth/logout" method="post">
                <button className="link small" type="submit">
                  Abmelden
                </button>
              </form>
            </div>
          )}
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
