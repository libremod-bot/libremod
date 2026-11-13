import {
  and,
  count,
  desc,
  eq,
  gt,
  guildSettings,
  isNull,
  lte,
  or,
  modCases,
  sql,
  type CaseType,
  type Db,
  type GuildSettings,
  type ModCase,
} from "@libremod/db";

/** Liefert die Einstellungen eines Servers und legt sie bei Bedarf mit Standardwerten an. */
export async function getSettings(
  db: Db,
  guildId: string,
): Promise<GuildSettings> {
  await db.insert(guildSettings).values({ guildId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId));
  return row!;
}

export interface NewCase {
  guildId: string;
  type: CaseType;
  targetId: string;
  moderatorId: string;
  reason?: string | null;
  expiresAt?: Date | null;
  automatic?: boolean;
}

/** Legt einen Fall mit der nächsten freien Fallnummer des Servers an. */
export async function createCase(db: Db, input: NewCase): Promise<ModCase> {
  await db
    .insert(guildSettings)
    .values({ guildId: input.guildId })
    .onConflictDoNothing();
  return db.transaction(async (tx) => {
    const [counter] = await tx
      .update(guildSettings)
      .set({ caseCounter: sql`${guildSettings.caseCounter} + 1` })
      .where(eq(guildSettings.guildId, input.guildId))
      .returning({ next: guildSettings.caseCounter, warnExpiryDays: guildSettings.warnExpiryDays });

    // Verwarnungen verfallen auf Wunsch nach einer festen Zahl von Tagen.
    let expiresAt = input.expiresAt ?? null;
    if (input.type === "warn" && !expiresAt && counter!.warnExpiryDays > 0) {
      expiresAt = new Date(Date.now() + counter!.warnExpiryDays * 86_400_000);
    }

    const [created] = await tx
      .insert(modCases)
      .values({
        guildId: input.guildId,
        caseNumber: counter!.next,
        type: input.type,
        targetId: input.targetId,
        moderatorId: input.moderatorId,
        reason: input.reason ?? null,
        expiresAt,
        automatic: input.automatic ?? false,
      })
      .returning();
    return created!;
  });
}

export async function getCase(
  db: Db,
  guildId: string,
  caseNumber: number,
): Promise<ModCase | undefined> {
  const [row] = await db
    .select()
    .from(modCases)
    .where(
      and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)),
    );
  return row;
}

export async function listCases(
  db: Db,
  guildId: string,
  targetId: string,
  limit = 15,
): Promise<ModCase[]> {
  return db
    .select()
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, targetId)))
    .orderBy(desc(modCases.caseNumber))
    .limit(limit);
}

export async function countActiveWarnings(
  db: Db,
  guildId: string,
  targetId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(modCases)
    .where(
      and(
        eq(modCases.guildId, guildId),
        eq(modCases.targetId, targetId),
        eq(modCases.type, "warn"),
        eq(modCases.active, true),
        or(isNull(modCases.expiresAt), gt(modCases.expiresAt, new Date())),
      ),
    );
  return row?.n ?? 0;
}

/** Ändert den Grund eines Falls. Gibt den geänderten Fall zurück. */
export async function updateCaseReason(
  db: Db,
  guildId: string,
  caseNumber: number,
  reason: string,
) {
  const [row] = await db
    .update(modCases)
    .set({ reason })
    .where(
      and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)),
    )
    .returning();
  return row;
}

/** Setzt einen Fall inaktiv, z. B. um eine Verwarnung zurückzunehmen. */
export async function deactivateCase(
  db: Db,
  guildId: string,
  caseNumber: number,
) {
  const [row] = await db
    .update(modCases)
    .set({ active: false })
    .where(
      and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)),
    )
    .returning();
  return row;
}

/** Beendet alle laufenden Bans eines Nutzers, z. B. nach /unban. */
export async function deactivateBans(
  db: Db,
  guildId: string,
  targetId: string,
) {
  await db
    .update(modCases)
    .set({ active: false })
    .where(
      and(
        eq(modCases.guildId, guildId),
        eq(modCases.targetId, targetId),
        eq(modCases.type, "ban"),
        eq(modCases.active, true),
      ),
    );
}

/** Abgelaufene Verwarnungen als nicht mehr aktiv markieren. Gibt die Zahl zurück. */
export async function expireWarnings(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .update(modCases)
    .set({ active: false })
    .where(and(eq(modCases.type, "warn"), eq(modCases.active, true), lte(modCases.expiresAt, now)))
    .returning({ id: modCases.id });
  return rows.length;
}
