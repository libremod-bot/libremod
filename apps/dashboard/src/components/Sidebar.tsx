"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AREAS } from "@/lib/areas";
import { useT } from "./I18n";
import { Icon, type IconName } from "./Icon";

type NavLink = { href: string; label: string; icon: IconName };

/** `allowed`: Bereiche, die die Person sehen darf. `null` heißt: alles (Server verwalten). */
export function SidebarLinks({ guildId, allowed }: { guildId: string; allowed: string[] | null }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const groups: { title: string; links: NavLink[] }[] = [];
  for (const a of AREAS) {
    if (allowed && !allowed.includes(a.key)) continue;
    let g = groups.find((x) => x.title === a.group);
    if (!g) groups.push((g = { title: a.group, links: [] }));
    g.links.push({ href: `${base}/${a.key}`, label: a.label, icon: a.icon });
  }
  const active = (href: string) => pathname === href || (href !== base && pathname.startsWith(`${href}/`));

  // Auf dem Handy die Schublade nach einem Klick wieder schließen.
  useEffect(() => {
    const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }, [pathname]);

  return (
    <>
      <nav className="nav">
        <Link href={base} className="nav-link" aria-current={pathname === base ? "page" : undefined}>
          <Icon name="home" />
          {t("Übersicht")}
        </Link>
        {groups.map((g) => {
          const current = g.links.some((l) => active(l.href));
          return (
            <details className="nav-group" key={g.title} open={current || undefined}>
              <summary>
                {t(g.title)}
                <span className="nav-count">{g.links.length}</span>
                <Icon name="chevron" size={16} />
              </summary>
              {g.links.map((l) => (
                <Link key={l.href} href={l.href} className="nav-link" aria-current={active(l.href) ? "page" : undefined}>
                  <Icon name={l.icon} />
                  {t(l.label)}
                </Link>
              ))}
            </details>
          );
        })}
      </nav>
      <Link href="/servers" className="nav-link nav-back">
        <Icon name="back" />
        {t("Alle Server")}</Link>
    </>
  );
}
