import Link from "next/link";
import { redirect } from "next/navigation";
import { GuildIcon } from "@/components/GuildIcon";
import { PageHeader } from "@/components/PageHeader";
import { teamGuilds } from "@/lib/access";
import { botIsInGuild, canManage, getUserGuilds, inviteUrl } from "@/lib/discord";
import { getUser } from "@/lib/session";

export const metadata = { title: "Deine Server · Libremod" };

export default async function ServersPage() {
  const session = await getUser();
  if (!session) redirect("/");

  const all = await getUserGuilds(session.user.id, session.accessToken);
  const guilds = all.filter(canManage);
  const team = await teamGuilds(session.user.id, all);
  const withBot = [
    ...(await Promise.all(guilds.map(async (g) => ({ ...g, hasBot: await botIsInGuild(g.id), team: false })))),
    ...team.map((g) => ({ ...g, hasBot: true, team: true })),
  ];
  withBot.sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        icon="home"
        title={`Hallo ${session.user.username}!`}
        description="Wähle einen Server aus. Hier erscheinen alle Server, auf denen du „Server verwalten“ darfst oder einen Team-Zugang hast."
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
                  <span className="badge on">{g.team ? "Team-Zugang" : "Libremod aktiv"}</span>
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
