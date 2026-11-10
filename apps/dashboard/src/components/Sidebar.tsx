"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarLinks({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const links = [
    { href: base, label: "Moderation" },
    { href: `${base}/automod`, label: "Auto-Mod" },
    { href: `${base}/cases`, label: "Fallakte" },
  ];
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <Link href="/servers" className="small muted" style={{ marginTop: "0.75rem" }}>
        ← Alle Server
      </Link>
    </>
  );
}
