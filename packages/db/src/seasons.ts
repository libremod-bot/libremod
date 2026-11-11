import { and, desc, eq, sql } from "drizzle-orm";
import { levelSeasons, levelSettings, memberXp } from "./schema.js";
import type { Db } from "./index.js";

/**
 * Beendet die laufende Level-Saison: speichert die besten 10 und setzt alle XP auf 0.
 * Läuft genau einmal, auch wenn Bot und Dashboard gleichzeitig auslösen.
 * Mit `expectedNumber` passiert nur etwas, wenn genau diese Saison noch läuft (Doppelklick, Job und Dashboard gleichzeitig).
 * Gibt die archivierte Saison zurück oder null, wenn nichts zu tun war.
 */
export async function endLevelSeason(db: Db, guildId: string, now = new Date(), expectedNumber?: number) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(levelSettings).where(eq(levelSettings.guildId, guildId)).for("update");
    if (!s || (expectedNumber !== undefined && s.seasonNumber !== expectedNumber)) return null;
    const top = await tx
      .select({ userId: memberXp.userId, xp: memberXp.xp, level: memberXp.level })
      .from(memberXp)
      .where(and(eq(memberXp.guildId, guildId), sql`${memberXp.xp} > 0`))
      .orderBy(desc(memberXp.xp))
      .limit(10);
    const [archived] = await tx
      .insert(levelSeasons)
      .values({ guildId, number: s.seasonNumber, startedAt: s.seasonStartedAt, endedAt: now, top })
      .onConflictDoNothing()
      .returning();
    if (!archived) return null;
    await tx.update(memberXp).set({ xp: 0, level: 0, updatedAt: now }).where(eq(memberXp.guildId, guildId));
    await tx.update(levelSettings).set({ seasonNumber: s.seasonNumber + 1, seasonStartedAt: now }).where(eq(levelSettings.guildId, guildId));
    return archived;
  });
}
