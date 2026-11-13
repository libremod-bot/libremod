import { GuildIcon } from "@/components/GuildIcon";
import { Icon } from "@/components/Icon";
import { Search } from "@/components/Search";
import { SidebarLinks } from "@/components/Sidebar";
import { requireGuildAccess } from "@/lib/access";
import { t } from "@/lib/i18n";

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild, access } = await requireGuildAccess(guildId);

  return (
    <div className="layout">
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" tabIndex={-1} />
      <label htmlFor="nav-toggle" className="button secondary nav-open">
        <Icon name="menu" /> {guild.name}
      </label>
      <nav className="sidebar" aria-label={t("Bereiche")}>
        <div className="sidebar-head">
          <GuildIcon guild={guild} />
          <strong>{guild.name}</strong>
        </div>
        <Search guildId={guildId} allowed={access.full ? null : access.areas} />
        <SidebarLinks guildId={guildId} allowed={access.full ? null : access.areas} />
      </nav>
      <div className="stack">{children}</div>
    </div>
  );
}
