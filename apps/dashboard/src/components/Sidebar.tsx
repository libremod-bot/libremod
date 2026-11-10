"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export function SidebarLinks({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: base, label: "Übersicht", icon: "home" },
    { href: `${base}/moderation`, label: "Moderation", icon: "gavel" },
    { href: `${base}/automod`, label: "Auto-Mod", icon: "shield" },
    { href: `${base}/cases`, label: "Fallakte", icon: "list" },
  ];
  return (
    <>
      <div className="nav-group">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link" aria-current={pathname === l.href ? "page" : undefined}>
            <Icon name={l.icon} />
            {l.label}
          </Link>
        ))}
      </div>
      <Link href="/servers" className="nav-link nav-back">
        <Icon name="back" />
        Alle Server
      </Link>
    </>
  );
}
