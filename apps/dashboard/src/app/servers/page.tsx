import Link from "next/link";
import { redirect } from "next/navigation";
import { GuildIcon } from "@/components/GuildIcon";
import { botIsInGuild, getManageableGuilds, inviteUrl } from "@/lib/discord";
import { getUser } from "@/lib/session";

export const metadata = { title: "Deine Server · Libremod" };

export default async function ServersPage() {
  const session = await getUser();
  if (!session) redirect("/");

  const guilds = await getManageableGuilds(session.user.id, session.accessToken);
  const withBot = await Promise.all(guilds.map(async (g) => ({ ...g, hasBot: await botIsInGuild(g.id) })));
  withBot.sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name));

  return (
    <>
      <h1>Deine Server</h1>
      <p className="muted">Hier erscheinen alle Server, auf denen du „Server verwalten“ darfst.</p>
      {withBot.length === 0 ? (
        <div className="card">Du verwaltest noch keinen Server.</div>
      ) : (
        <div className="guild-grid">
          {withBot.map((g) => (
            <div className="guild" key={g.id}>
              <GuildIcon guild={g} />
              <div className="guild-name">{g.name}</div>
              {g.hasBot ? (
                <Link className="button" href={`/servers/${g.id}`}>
                  Einstellen
                </Link>
              ) : (
                <a className="button secondary" href={inviteUrl(g.id)}>
                  Libremod einladen
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
