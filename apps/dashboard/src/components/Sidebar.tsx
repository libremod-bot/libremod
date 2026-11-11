"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

type NavLink = { href: string; label: string; icon: IconName };

export function SidebarLinks({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const groups: { title?: string; links: NavLink[] }[] = [
    { links: [{ href: base, label: "Übersicht", icon: "home" }] },
    {
      title: "Schutz",
      links: [
        { href: `${base}/moderation`, label: "Moderation", icon: "gavel" },
        { href: `${base}/automod`, label: "Auto-Mod", icon: "shield" },
        { href: `${base}/verification`, label: "Verifizierung", icon: "usercheck" },
        { href: `${base}/logging`, label: "Logging", icon: "log" },
        { href: `${base}/cases`, label: "Fallakte", icon: "list" },
        { href: `${base}/tickets`, label: "Tickets", icon: "ticket" },
      ],
    },
    {
      title: "Community",
      links: [
        { href: `${base}/welcome`, label: "Begrüßung", icon: "wave" },
        { href: `${base}/roles`, label: "Rollen", icon: "tag" },
        { href: `${base}/levels`, label: "Level", icon: "steps" },
        { href: `${base}/economy`, label: "Währung & Shop", icon: "coin" },
        { href: `${base}/giveaways`, label: "Gewinnspiele", icon: "gift" },
        { href: `${base}/birthdays`, label: "Geburtstage", icon: "cake" },
        { href: `${base}/commands`, label: "Eigene Befehle", icon: "slash" },
        { href: `${base}/schedule`, label: "Geplante Nachrichten", icon: "clock" },
        { href: `${base}/channels`, label: "Sprachkanäle & Zähler", icon: "mic" },
        { href: `${base}/tools`, label: "Highlights & Kanal-Pflege", icon: "sparkle" },
        { href: `${base}/notifications`, label: "Benachrichtigungen", icon: "bell" },
      ],
    },
  ];
  const active = (href: string) => pathname === href || (href !== base && pathname.startsWith(`${href}/`));
  return (
    <>
      <nav className="nav">
      {groups.map((g, i) => (
        <div className="nav-group" key={g.title ?? i}>
          {g.title && <div className="nav-title">{g.title}</div>}
          {g.links.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link" aria-current={active(l.href) ? "page" : undefined}>
              <Icon name={l.icon} />
              {l.label}
            </Link>
          ))}
        </div>
      ))}
      </nav>
      <Link href="/servers" className="nav-link nav-back">
        <Icon name="back" />
        Alle Server
      </Link>
    </>
  );
}
