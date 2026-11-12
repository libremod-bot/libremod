import { GuildIcon } from "@/components/GuildIcon";
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
      <nav className="sidebar" aria-label={t("Bereiche")}>
        <div className="sidebar-head">
          <GuildIcon guild={guild} />
          <strong>{guild.name}</strong>
        </div>
        <SidebarLinks guildId={guildId} allowed={access.full ? null : access.areas} />
      </nav>
      <div className="stack">{children}</div>
    </div>
  );
}
