import "server-only";
import { notFound, redirect } from "next/navigation";
import { botIsInGuild, getManageableGuilds } from "./discord";
import { getUser } from "./session";

/**
 * Stellt sicher, dass der eingeloggte Nutzer diesen Server verwalten darf und der Bot dort ist.
 * Muss in jeder Seite und jeder Server-Aktion eines Servers aufgerufen werden.
 */
export async function requireGuildAccess(guildId: string) {
  if (!/^\d{17,20}$/.test(guildId)) notFound();
  const session = await getUser();
  if (!session) redirect("/");

  const guilds = await getManageableGuilds(session.user.id, session.accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();
  if (!(await botIsInGuild(guildId))) redirect("/servers");

  return { user: session.user, guild };
}
