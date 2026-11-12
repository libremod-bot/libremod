import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { and, dashboardAudit, dashboardTeamAccess, eq, inArray, lt } from "@libremod/db";
import { isTeamArea, type AreaKey } from "./areas";
import { database } from "./db";
import { botIsInGuild, canManage, getMemberRoles, getUserGuilds, type PartialGuild } from "./discord";
import { getUser } from "./session";
import { t } from "@/lib/i18n";

export interface GuildAccess {
  /** true: „Server verwalten“, alles erlaubt. false: Team-Zugang mit einzelnen Bereichen. */
  full: boolean;
  areas: AreaKey[];
}

/** Bereiche, die eine Person ohne „Server verwalten“ über ihre Rollen bekommt. */
export async function teamAreas(guildId: string, userId: string): Promise<AreaKey[]> {
  const { db } = database();
  const rules = await db.select().from(dashboardTeamAccess).where(eq(dashboardTeamAccess.guildId, guildId));
  if (!rules.length) return [];
  const roles = new Set(await getMemberRoles(guildId, userId).catch(() => []));
  const areas = new Set<AreaKey>();
  for (const r of rules) if (roles.has(r.roleId)) for (const a of r.areas) if (isTeamArea(a)) areas.add(a);
  return [...areas];
}

/** Server, auf denen die Person über einen Team-Zugang etwas bearbeiten darf (Bot muss dort sein). */
export async function teamGuilds(userId: string, guilds: PartialGuild[]) {
  const others = guilds.filter((g) => !canManage(g));
  if (!others.length) return [];
  const { db } = database();
  const withRules = new Set(
    (await db.selectDistinct({ guildId: dashboardTeamAccess.guildId }).from(dashboardTeamAccess).where(inArray(dashboardTeamAccess.guildId, others.map((g) => g.id)))).map(
      (r) => r.guildId,
    ),
  );
  const result: PartialGuild[] = [];
  for (const g of others) {
    if (!withRules.has(g.id) || !(await botIsInGuild(g.id))) continue;
    if ((await teamAreas(g.id, userId)).length) result.push(g);
  }
  return result;
}

// --- Änderungsprotokoll ---

interface AuditContext {
  guildId: string;
  area?: AreaKey;
  action?: string;
  user?: { id: string; name: string };
}

const auditStore = new AsyncLocalStorage<AuditContext>();

/**
 * Wird von `back()` nach einer erfolgreichen Änderung aufgerufen. Schreibt nach der Antwort einen Eintrag ins
 * Änderungsprotokoll, sofern die Aktion eine Beschreibung hat.
 */
export function recordChange(detail?: string) {
  const ctx = auditStore.getStore();
  if (!ctx?.user || !ctx.area || !ctx.action) return;
  const entry = {
    guildId: ctx.guildId,
    userId: ctx.user.id,
    userName: ctx.user.name.slice(0, 100),
    area: ctx.area,
    action: (detail ? `${ctx.action}: ${detail}` : ctx.action).slice(0, 200),
  };
  ctx.action = undefined; // nur einmal pro Aufruf
  after(async () => {
    const { db } = database();
    await db.insert(dashboardAudit).values(entry);
    // Ältere Einträge als 1 Jahr gelegentlich aufräumen
    if (Math.random() < 0.02) {
      await db
        .delete(dashboardAudit)
        .where(and(eq(dashboardAudit.guildId, entry.guildId), lt(dashboardAudit.createdAt, new Date(Date.now() - 366 * 24 * 60 * 60_000))));
    }
  });
}

/**
 * Stellt sicher, dass der eingeloggte Nutzer diesen Server bzw. Bereich bearbeiten darf und der Bot dort ist.
 * Muss in jeder Seite und jeder Server-Aktion eines Servers aufgerufen werden.
 * `area`: Bereich der Seite oder Aktion. Ohne Angabe genügt irgendein Zugang (Übersicht).
 * `action`: Beschreibung für das Änderungsprotokoll (nur bei Server-Aktionen).
 */
export async function requireGuildAccess(guildId: string, area?: AreaKey, action?: string) {
  // Synchron vor dem ersten await setzen, damit der Aufrufer (die Server-Aktion) den Kontext erbt.
  const ctx: AuditContext = { guildId, area, action };
  auditStore.enterWith(ctx);

  if (!/^\d{17,20}$/.test(guildId)) notFound();
  const session = await getUser();
  if (!session) redirect("/");

  const guilds = await getUserGuilds(session.user.id, session.accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();
  if (!(await botIsInGuild(guildId))) redirect("/servers");

  let access: GuildAccess;
  if (canManage(guild)) access = { full: true, areas: [] };
  else {
    const areas = await teamAreas(guildId, session.user.id);
    if (!areas.length) notFound();
    access = { full: false, areas };
    if (area && !areas.includes(area)) redirect(`/servers/${guildId}?fehler=${encodeURIComponent(t("Für diesen Bereich hast du keinen Zugang."))}`);
  }
  ctx.user = { id: session.user.id, name: session.user.username };
  return { user: session.user, guild, access };
}

export const canSee = (access: GuildAccess, area: AreaKey) => access.full || access.areas.includes(area);
