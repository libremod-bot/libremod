import { guildIconUrl } from "@/lib/discord";

export function GuildIcon({ guild }: { guild: { id: string; name: string; icon: string | null } }) {
  const url = guildIconUrl(guild);
  const initials = guild.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="guild-icon" src={url} alt="" /> : <div className="guild-icon">{initials}</div>;
}
