import "server-only";
import { eq, getTableColumns, guildSettings, type Db } from "@libremod/db";
import type { AreaKey } from "./areas";
import { TABLES, type Spec } from "./backup";
import { type Snapshot } from "@libremod/shared/snapshot";

export { diffSnapshots, stillAsAfter, type Snapshot } from "@libremod/shared/snapshot";

/**
 * „Rückgängig“ im Änderungsprotokoll: Vor und nach jeder Änderung im Dashboard merkt sich Libremod die
 * Einstellungen des Bereichs. Rückgängig machen geht nur, solange dort seitdem nichts anderes geändert wurde,
 * sonst würden neuere Änderungen still mit verschwinden.
 */

/** Welche Tabellen zu welchem Bereich gehören. Bereiche ohne Eintrag (Fälle, Zitate, …) lassen sich nicht rückgängig machen. */
const AREA_TABLES: Partial<Record<AreaKey, string[]>> = {
  moderation: ["guildSettings", "warnEscalations"],
  automod: ["guildSettings", "automodRules", "automodExemptions", "nameGuardSettings"],
  verification: ["verificationSettings"],
  logging: ["logChannels", "logIgnoredChannels"],
  tickets: ["ticketSettings", "ticketCategories", "ticketPanels"],
  appeals: ["appealSettings"],
  welcome: ["welcomeSettings"],
  roles: ["autoRoles", "rolePanels", "voiceRoles"],
  suggestions: ["suggestionSettings"],
  commands: ["customCommands"],
  schedule: ["scheduledMessages"],
  channels: ["tempVoiceHubs", "counterChannels"],
  tools: ["highlightSettings", "autoPurgeChannels", "autoSlowmodeChannels"],
  notifications: ["notificationFeeds"],
  levels: ["levelSettings", "levelRewards", "levelNoXp", "levelMultipliers"],
  economy: ["economySettings", "shopItems"],
  birthdays: ["birthdaySettings"],
  counting: ["countingChannels"],
  wordchain: ["wordChainChannels"],
  team: ["dashboardTeamAccess"],
};

/** Vor die Beschreibung eines Eintrags, der eine frühere Änderung zurückgenommen hat. */
export const UNDO_PREFIX = "Rückgängig gemacht: ";
/** Vor die Beschreibung, wenn ein Rückgängigmachen selbst zurückgenommen wurde. */
export const REDO_PREFIX = "Wiederhergestellt: ";

/** Beschreibung für den neuen Eintrag beim Rückgängigmachen: aus „X“ wird „Rückgängig gemacht: X“ und umgekehrt. */
export function undoActionText(action: string): string {
  if (action.startsWith(UNDO_PREFIX)) return REDO_PREFIX + action.slice(UNDO_PREFIX.length);
  if (action.startsWith(REDO_PREFIX)) return UNDO_PREFIX + action.slice(REDO_PREFIX.length);
  return UNDO_PREFIX + action;
}

/** guildSettings teilen sich Moderation und Auto-Mod: Jeder Bereich sieht nur seine eigenen Spalten. */
const GUILD_COLUMNS: Partial<Record<AreaKey, string[]>> = {
  moderation: ["locale", "modLogChannelId", "dmOnAction"],
  automod: ["automodEnabled", "raidEnabled", "raidJoinThreshold", "raidWindowSeconds", "raidAction"],
};

export const canUndoArea = (area: string) => area in AREA_TABLES;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const specOf = (name: string) => TABLES.find((s) => s.name === name) as Spec;
const columnsOf = (spec: Spec) => getTableColumns(spec.table as typeof guildSettings) as Record<string, { columnType: string }>;
const keyOf = (spec: Spec, row: Row) => String("id" in row ? row.id : row[spec.stateKey ?? "guildId"] ?? "");

/** Zeile ohne Server-ID und ohne Laufzeit-Zustand, als JSON-taugliche Werte. */
function clean(spec: Spec, row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "guildId" || spec.state?.includes(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Einstellungen eines Bereichs lesen. */
export async function snapshotArea(db: Db, guildId: string, area: string): Promise<Snapshot | null> {
  const names = AREA_TABLES[area as AreaKey];
  if (!names) return null;
  const snap: Snapshot = {};
  for (const name of names) {
    const spec = specOf(name);
    const rows = (await db.select().from(spec.table as any).where(eq((spec.table as any).guildId, guildId))) as Row[];
    const own = name === "guildSettings" ? GUILD_COLUMNS[area as AreaKey] : undefined;
    snap[name] = rows
      .map((r) => clean(spec, r))
      .map((r) => (own ? Object.fromEntries(Object.entries(r).filter(([k]) => own.includes(k))) : r)).sort((a, b) => keyOf(spec, a).localeCompare(keyOf(spec, b), undefined, { numeric: true }));
  }
  return snap;
}

function revive(spec: Spec, row: Row): Row {
  const columns = columnsOf(spec);
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    const col = columns[k];
    if (!col) continue; // Spalte gibt es nicht mehr
    out[k] = v !== null && col.columnType === "PgTimestamp" ? new Date(v) : v;
  }
  return out;
}

/** Stellt den Stand `target` wieder her. Läuft in einer Transaktion. Laufzeit-Zustand (Zählerstände usw.) bleibt. */
export async function restoreSnapshot(db: Db, guildId: string, target: Snapshot): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [name, rows] of Object.entries(target)) {
      const spec = specOf(name);
      if (!spec) continue;
      const table = spec.table as any;
      if (name === "guildSettings") {
        await tx.insert(guildSettings).values({ guildId }).onConflictDoNothing();
        const values = revive(spec, rows[0] ?? {});
        if (Object.keys(values).length) await tx.update(guildSettings).set(values).where(eq(guildSettings.guildId, guildId));
        continue;
      }
      const existing = (await tx.select().from(table).where(eq(table.guildId, guildId))) as Row[];
      const stateOf = new Map(existing.map((r) => [keyOf(spec, r), r]));
      await tx.delete(table).where(eq(table.guildId, guildId));
      for (const raw of rows) {
        const row = revive(spec, raw);
        row.guildId = guildId;
        const prev = stateOf.get(keyOf(spec, raw));
        if (prev) for (const k of spec.state ?? []) if (prev[k] !== undefined) row[k] = prev[k];
        // Gleiche IDs wie vorher, damit z. B. offene Tickets ihre Ticket-Art behalten.
        await tx.insert(table).values(row);
      }
    }
  });
}
