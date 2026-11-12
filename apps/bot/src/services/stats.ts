import type {
  Client,
  GuildMember,
  Message,
  PartialGuildMember,
} from "discord.js";
import {
  lt,
  sql,
  statsChannels,
  statsDaily,
  statsHours,
  type Db,
} from "@libremod/db";
import { berlinParts } from "@libremod/shared";
import { logger } from "../logger.js";

/**
 * Server-Statistik: Der Bot zählt nur Nachrichten, Beitritte und Abgänge pro Tag, Kanal und Stunde.
 * Es werden keine Nutzer-IDs und keine Inhalte gespeichert.
 */

const KEEP_DAYS = 400;

interface Counts {
  joins: number;
  leaves: number;
  messages: number;
  channels: Map<string, number>;
  hours: Map<number, number>;
}

/** guildId → Tag → Zähler, bis zum nächsten Speichern. */
const pending = new Map<string, Map<string, Counts>>();

export function berlinDay(now = new Date()) {
  const p = berlinParts(now);
  return {
    day: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    hour: p.hour,
  };
}

function counts(guildId: string, day: string): Counts {
  let g = pending.get(guildId);
  if (!g) pending.set(guildId, (g = new Map()));
  let c = g.get(day);
  if (!c)
    g.set(
      day,
      (c = {
        joins: 0,
        leaves: 0,
        messages: 0,
        channels: new Map(),
        hours: new Map(),
      }),
    );
  return c;
}

export function countMessage(m: Message, now = new Date()) {
  if (!m.inGuild() || m.author.bot || m.webhookId || m.system) return;
  const { day, hour } = berlinDay(now);
  const c = counts(m.guildId, day);
  c.messages++;
  // Threads zählen zum Elternkanal, damit die Liste übersichtlich bleibt.
  const channelId = m.channel.isThread()
    ? (m.channel.parentId ?? m.channelId)
    : m.channelId;
  c.channels.set(channelId, (c.channels.get(channelId) ?? 0) + 1);
  c.hours.set(hour, (c.hours.get(hour) ?? 0) + 1);
}

export function countJoin(member: GuildMember, now = new Date()) {
  counts(member.guild.id, berlinDay(now).day).joins++;
}

export function countLeave(
  member: GuildMember | PartialGuildMember,
  now = new Date(),
) {
  counts(member.guild.id, berlinDay(now).day).leaves++;
}

/** Schreibt die gesammelten Zahlen in die Datenbank (addiert auf bestehende Werte). */
export async function flushStats(client: Client, db: Db, now = new Date()) {
  const today = berlinDay(now).day;
  // Auch Server ohne Aktivität bekommen täglich ihre Mitgliederzahl.
  for (const guild of client.guilds.cache.values()) counts(guild.id, today);
  const batch = [...pending.entries()];
  pending.clear();
  for (const [guildId, days] of batch) {
    const members = client.guilds.cache.get(guildId)?.memberCount ?? 0;
    for (const [day, c] of days) {
      try {
        await db
          .insert(statsDaily)
          .values({
            guildId,
            day,
            joins: c.joins,
            leaves: c.leaves,
            messages: c.messages,
            members,
          })
          .onConflictDoUpdate({
            target: [statsDaily.guildId, statsDaily.day],
            set: {
              joins: sql`${statsDaily.joins} + ${c.joins}`,
              leaves: sql`${statsDaily.leaves} + ${c.leaves}`,
              messages: sql`${statsDaily.messages} + ${c.messages}`,
              members: members || sql`${statsDaily.members}`,
            },
          });
        if (c.channels.size) {
          await db
            .insert(statsChannels)
            .values(
              [...c.channels].map(([channelId, n]) => ({
                guildId,
                day,
                channelId,
                messages: n,
              })),
            )
            .onConflictDoUpdate({
              target: [
                statsChannels.guildId,
                statsChannels.day,
                statsChannels.channelId,
              ],
              set: {
                messages: sql`${statsChannels.messages} + excluded.messages`,
              },
            });
        }
        if (c.hours.size) {
          await db
            .insert(statsHours)
            .values(
              [...c.hours].map(([hour, n]) => ({
                guildId,
                day,
                hour,
                messages: n,
              })),
            )
            .onConflictDoUpdate({
              target: [statsHours.guildId, statsHours.day, statsHours.hour],
              set: {
                messages: sql`${statsHours.messages} + excluded.messages`,
              },
            });
        }
      } catch (err) {
        logger.warn({ err, guildId }, "Statistik nicht gespeichert");
      }
    }
  }
}

export async function pruneStats(db: Db, now = new Date()) {
  const cutoff = berlinDay(
    new Date(now.getTime() - KEEP_DAYS * 86_400_000),
  ).day;
  await db.delete(statsDaily).where(lt(statsDaily.day, cutoff));
  await db.delete(statsChannels).where(lt(statsChannels.day, cutoff));
  await db.delete(statsHours).where(lt(statsHours.day, cutoff));
}

export function startStats(client: Client, db: Db): NodeJS.Timeout[] {
  return [
    setInterval(
      () =>
        void flushStats(client, db).catch((err) =>
          logger.error({ err }, "Statistik fehlgeschlagen"),
        ),
      60_000,
    ),
    setInterval(
      () =>
        void pruneStats(db).catch((err) =>
          logger.error({ err }, "Statistik aufräumen fehlgeschlagen"),
        ),
      24 * 60 * 60_000,
    ),
  ];
}
