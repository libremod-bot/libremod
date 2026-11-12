import Link from "next/link";
import { redirect } from "next/navigation";
import { GuildIcon } from "@/components/GuildIcon";
import { PageHeader } from "@/components/PageHeader";
import { teamGuilds } from "@/lib/access";
import { botOnline, getInstanceStatus, isInstanceOwner } from "@/lib/instance";
import {
  botIsInGuild,
  canManage,
  getUserGuilds,
  inviteUrl,
} from "@/lib/discord";
import { getUser } from "@/lib/session";

export const metadata = { title: "Deine Server · Libremod" };

export default async function ServersPage() {
  const session = await getUser();
  if (!session) redirect("/");

  const all = await getUserGuilds(session.user.id, session.accessToken);
  const guilds = all.filter(canManage);
  const team = await teamGuilds(session.user.id, all);
  const withBot = [
    ...(await Promise.all(
      guilds.map(async (g) => ({
        ...g,
        hasBot: await botIsInGuild(g.id),
        team: false,
      })),
    )),
    ...team.map((g) => ({ ...g, hasBot: true, team: true })),
  ];
  const status = await getInstanceStatus().catch(() => null);
  const owner = isInstanceOwner(status, session.user.id);
  withBot.sort(
    (a, b) =>
      Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader
        icon="home"
        title={`Hallo ${session.user.username}!`}
        description="Wähle einen Server aus. Hier erscheinen alle Server, auf denen du „Server verwalten“ darfst oder einen Team-Zugang hast."
      />
      {owner && !botOnline(status) && (
        <div
          className="toast error"
          role="alert"
          style={{ display: "block", fontWeight: 500, marginBottom: "1rem" }}
        >
          Der Bot ist gerade offline. <Link href="/status">Status ansehen</Link>
        </div>
      )}
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
                  <span className="badge on">
                    {g.team ? "Team-Zugang" : "Libremod aktiv"}
                  </span>
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
      {owner && (
        <p className="small muted" style={{ marginTop: "1.5rem" }}>
          Du bist Besitzer dieser Libremod-Installation.{" "}
          <Link href="/status">Status, Version und Datensicherung ansehen</Link>
        </p>
      )}
    </>
  );
}
