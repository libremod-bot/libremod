import { GuildIcon } from "@/components/GuildIcon";
import { SidebarLinks } from "@/components/Sidebar";
import { requireGuildAccess } from "@/lib/access";

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Bereiche">
        <div className="sidebar-head">
          <GuildIcon guild={guild} />
          <strong>{guild.name}</strong>
        </div>
        <SidebarLinks guildId={guildId} />
      </nav>
      <div>{children}</div>
    </div>
  );
}
