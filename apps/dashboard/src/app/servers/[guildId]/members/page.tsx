import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, modCases } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { DiscordError, getMembers, searchMembers, type GuildMember } from "@/lib/discord";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Mitglieder") }) };
}

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ suche?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "members");
  const { suche } = await searchParams;
  const query = (suche ?? "").trim().replace(/^@/, "").slice(0, 100);
  const base = `/servers/${guildId}/members`;

  // Eine ID führt direkt zum Profil.
  const id = /^\d{17,20}$/.test(query) ? query : /^<@!?(\d{17,20})>$/.exec(query)?.[1];
  if (id) redirect(`${base}/${id}`);
  let results: GuildMember[] = [];
  let error: string | undefined;
  if (query) {
    try {
      results = await searchMembers(guildId, query);
    } catch (err) {
      console.error("Mitgliedersuche fehlgeschlagen", err);
      error = err instanceof DiscordError && err.status === 429 ? t("Discord bremst gerade. Bitte gleich noch einmal versuchen.") : t("Die Suche hat nicht geklappt. Bitte gleich noch einmal versuchen.");
    }
  }

  // Ohne Suche: wer zuletzt in der Fallakte aufgetaucht ist.
  const { db } = database();
  const recent = query
    ? []
    : await db
        .select({ targetId: modCases.targetId, createdAt: modCases.createdAt })
        .from(modCases)
        .where(eq(modCases.guildId, guildId))
        .orderBy(desc(modCases.createdAt))
        .limit(60);
  const recentIds = [...new Set(recent.map((r) => r.targetId))].slice(0, 12);
  const recentMembers = recentIds.length ? await getMembers(guildId, recentIds) : [];

  return (
    <>
      <PageHeader
        icon="users"
        title={t("Mitglieder")}
        description={t("Eine Person suchen und alles auf einen Blick sehen: Rollen, Fallakte, Notizen des Teams, Level und Münzen.")}
      />
      <Notice error={error} />

      <form className="card" method="get" action={base} role="search">
        <label htmlFor="suche">{t("Name, Nutzername oder ID")}</label>
        <div className="inline-field">
          <input id="suche" name="suche" type="text" defaultValue={query} placeholder={t("z. B. mara oder 123456789012345678")} autoFocus={!query} autoComplete="off" />
          <button type="submit">
            <Icon name="search" size={16} /> {t("Suchen")}
          </button>
        </div>
        <div className="hint">{t("Discord sucht nach dem Anfang des Nutzernamens oder Spitznamens. Mit einer ID landest du direkt beim Profil, auch wenn die Person den Server schon verlassen hat.")}</div>
      </form>

      {query && !error && (
        <section className="card">
          <div className="card-title">
            <Icon name="users" />
            <h2>{t("Treffer")}</h2>
            <span className="badge" style={{ marginLeft: "auto" }}>
              {results.length}
            </span>
          </div>
          {results.length === 0 ? (
            <p className="empty" style={{ paddingTop: 0 }}>
              {t("Niemand gefunden, dessen Name mit „{q}“ beginnt.", { q: query })}
            </p>
          ) : (
            <ul className="member-list">
              {results.map((m) => (
                <li key={m.id}>
                  <Link href={`${base}/${m.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="avatar" src={m.avatar} alt="" />
                    <span>
                      <strong>{m.displayName}</strong>
                      <span className="small muted">
                        @{m.username}
                        {m.bot ? ` · ${t("Bot")}` : ""}
                      </span>
                    </span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!query && (
        <section className="card">
          <div className="card-title">
            <Icon name="list" />
            <h2>{t("Zuletzt in der Fallakte")}</h2>
          </div>
          {recentMembers.length === 0 ? (
            <p className="empty" style={{ paddingTop: 0 }}>
              {t("Noch niemand. Hier erscheinen Personen, gegen die zuletzt etwas unternommen wurde.")}
            </p>
          ) : (
            <ul className="member-list">
              {recentMembers.map((m) => (
                <li key={m.id}>
                  <Link href={`${base}/${m.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="avatar" src={m.avatar} alt="" />
                    <span>
                      <strong>{m.name}</strong>
                      <span className="small muted mono">{m.id}</span>
                    </span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
