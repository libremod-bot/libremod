"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREAS } from "@/lib/areas";
import { useT } from "./I18n";
import { Icon, type IconName } from "./Icon";

type NavLink = { href: string; label: string; icon: IconName };

/** `allowed`: Bereiche, die die Person sehen darf. `null` heißt: alles (Server verwalten). */
export function SidebarLinks({ guildId, allowed }: { guildId: string; allowed: string[] | null }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const groups: { title?: string; links: NavLink[] }[] = [{ links: [{ href: base, label: t("Übersicht"), icon: "home" }] }];
  for (const a of AREAS) {
    if (allowed && !allowed.includes(a.key)) continue;
    let g = groups.find((x) => x.title === a.group);
    if (!g) groups.push((g = { title: a.group, links: [] }));
    g.links.push({ href: `${base}/${a.key}`, label: t(a.label), icon: a.icon });
  }
  const active = (href: string) => pathname === href || (href !== base && pathname.startsWith(`${href}/`));
  return (
    <>
      <nav className="nav">
        {groups.map((g, i) => (
          <div className="nav-group" key={g.title ?? i}>
            {g.title && <div className="nav-title">{t(g.title)}</div>}
            {g.links.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link" aria-current={active(l.href) ? "page" : undefined}>
                <Icon name={l.icon} />
                {t(l.label)}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <Link href="/servers" className="nav-link nav-back">
        <Icon name="back" />
        {t("Alle Server")}</Link>
    </>
  );
}
