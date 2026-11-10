import Link from "next/link";
import { redirect } from "next/navigation";
import { GuildIcon } from "@/components/GuildIcon";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        icon="home"
        title={`Hallo ${session.user.username}!`}
        description="Wähle einen Server aus. Hier erscheinen alle Server, auf denen du „Server verwalten“ darfst."
      />
      {withBot.length === 0 ? (
        <div className="card empty">Du verwaltest noch keinen Server.</div>
      ) : (
        <div className="guild-grid">
          {withBot.map((g) => (
            <div className="guild" key={g.id}>
              <GuildIcon guild={g} />
              <div className="guild-name">{g.name}</div>
              {g.hasBot ? (
                <>
                  <span className="badge on">Libremod aktiv</span>
                  <Link className="button" href={`/servers/${g.id}`}>
                    Einstellen
                  </Link>
                </>
              ) : (
                <>
                  <span className="badge">Noch nicht eingeladen</span>
                  <a className="button secondary" href={inviteUrl(g.id)}>
                    Libremod einladen
                  </a>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
