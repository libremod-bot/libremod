import "server-only";
import {
  appealSettings,
  autoPurgeChannels,
  autoRoles,
  autoSlowmodeChannels,
  automodExemptions,
  automodRules,
  birthdaySettings,
  counterChannels,
  countingChannels,
  customCommands,
  dashboardTeamAccess,
  economySettings,
  eq,
  getTableColumns,
  guildSettings,
  highlightSettings,
  levelMultipliers,
  levelNoXp,
  levelRewards,
  levelSettings,
  logChannels,
  logIgnoredChannels,
  nameGuardSettings,
  notificationFeeds,
  rolePanels,
  scheduledMessages,
  shopItems,
  suggestionSettings,
  tempVoiceHubs,
  ticketCategories,
  ticketPanels,
  ticketSettings,
  verificationSettings,
  voiceRoles,
  warnEscalations,
  welcomeSettings,
  wordChainChannels,
  type Db,
} from "@libremod/db";
import { t } from "@/lib/i18n";

/**
 * Export und Import aller Einstellungen eines Servers als JSON. Nur Einstellungen, keine Mitgliederdaten
 * (keine XP, Kontostände, Fälle, Tickets, Zitate usw.).
 */

export const BACKUP_FORMAT = "libremod-einstellungen";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

type AnyTable = typeof guildSettings | typeof warnEscalations; // nur für die Typen der Hilfsfunktionen
interface Spec {
  name: string;
  table: unknown;
  /** Spalten mit Laufzeit-Zustand: werden nicht übernommen, bestehende Werte bleiben (oder Standard). */
  state?: string[];
  /** Spalte, über die bestehende Zustandswerte zugeordnet werden (Standard: guildId). */
  stateKey?: string;
}

const TABLES: Spec[] = [
  { name: "guildSettings", table: guildSettings, state: ["caseCounter", "createdAt", "updatedAt"] },
  { name: "warnEscalations", table: warnEscalations },
  { name: "automodRules", table: automodRules },
  { name: "automodExemptions", table: automodExemptions },
  { name: "logChannels", table: logChannels },
  { name: "logIgnoredChannels", table: logIgnoredChannels },
  { name: "welcomeSettings", table: welcomeSettings },
  { name: "autoRoles", table: autoRoles },
  { name: "rolePanels", table: rolePanels, state: ["createdAt"] },
  { name: "levelSettings", table: levelSettings, state: ["seasonNumber", "seasonStartedAt"] },
  { name: "levelRewards", table: levelRewards },
  { name: "levelNoXp", table: levelNoXp },
  { name: "levelMultipliers", table: levelMultipliers },
  { name: "customCommands", table: customCommands, state: ["uses"] },
  { name: "scheduledMessages", table: scheduledMessages, state: ["lastRunAt"] },
  { name: "counterChannels", table: counterChannels },
  { name: "tempVoiceHubs", table: tempVoiceHubs },
  {
    name: "notificationFeeds",
    table: notificationFeeds,
    state: ["seen", "lastStreamId", "live", "lastCheckedAt", "lastPostAt", "failures", "lastError", "createdAt"],
  },
  { name: "highlightSettings", table: highlightSettings },
  { name: "autoPurgeChannels", table: autoPurgeChannels, state: ["nextRunAt", "lastRunAt", "lastDeleted"], stateKey: "channelId" },
  { name: "autoSlowmodeChannels", table: autoSlowmodeChannels },
  { name: "ticketSettings", table: ticketSettings, state: ["nextNumber"] },
  { name: "ticketCategories", table: ticketCategories },
  { name: "ticketPanels", table: ticketPanels },
  { name: "economySettings", table: economySettings },
  { name: "shopItems", table: shopItems },
  { name: "birthdaySettings", table: birthdaySettings, state: ["lastRunDate", "roleHolders"] },
  { name: "verificationSettings", table: verificationSettings },
  { name: "suggestionSettings", table: suggestionSettings, state: ["counter"] },
  { name: "countingChannels", table: countingChannels, state: ["current", "lastUserId", "record", "fails"], stateKey: "channelId" },
  { name: "voiceRoles", table: voiceRoles },
  { name: "wordChainChannels", table: wordChainChannels, state: ["lastWord", "lastUserId", "length", "record", "createdAt"], stateKey: "channelId" },
  { name: "nameGuardSettings", table: nameGuardSettings },
  { name: "appealSettings", table: appealSettings },
  { name: "dashboardTeamAccess", table: dashboardTeamAccess, state: ["updatedAt"] },
];

export const BACKUP_TABLE_COUNT = TABLES.length;

// Drizzle-Tabellen sind stark typisiert; hier wird bewusst generisch gearbeitet.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const cols = (tItem: unknown) => getTableColumns(tItem as AnyTable) as Record<string, { notNull: boolean; columnType: string; hasDefault: boolean }>;
const guildCol = (tItem: unknown) => (tItem as any).guildId;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  guild: { id: string; name: string };
  tables: Record<string, Row[]>;
}

export async function exportSettings(db: Db, guildId: string, guildName: string): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {};
  for (const spec of TABLES) {
    const rows = (await db.select().from(spec.table as any).where(eq(guildCol(spec.table), guildId))) as Row[];
    tables[spec.name] = rows.map(({ guildId: _g, ...rest }) => rest);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), guild: { id: guildId, name: guildName }, tables };
}

/** Prüft die Datei grob. Gibt eine Fehlermeldung oder die Datei zurück. */
export function parseBackup(text: string): BackupFile | string {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return t("Die Datei ist kein gültiges JSON.");
  }
  if (data?.format !== BACKUP_FORMAT) return t("Das ist keine Libremod-Einstellungsdatei.");
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) return t("Diese Datei stammt aus einer neueren Libremod-Version. Bitte erst Libremod aktualisieren.");
  if (!data.tables || typeof data.tables !== "object") return t("In der Datei fehlen die Einstellungen.");
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!TABLES.some((tItem) => tItem.name === name)) continue;
    if (!Array.isArray(rows) || rows.length > 2000 || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) return t("Fehlerhafte Daten bei „{name}“.", { name });
  }
  return data as BackupFile;
}

const SNOWFLAKE = /^\d{17,20}$/;
const ID_KEY = /(channel|role|parent)Id$|^targetId$/i;
const ID_LIST_KEY = /RoleIds$|^roleIds$/;

export interface ImportResult {
  rows: number;
  dropped: number;
  cleared: number;
}

/**
 * Ersetzt alle Einstellungen des Servers durch die aus der Datei. Kanäle und Rollen, die es auf dem Server
 * nicht gibt, werden entfernt. Läuft in einer Transaktion: Bei einem Fehler bleibt alles wie vorher.
 */
export async function importSettings(db: Db, guildId: string, file: BackupFile, known: Set<string>): Promise<ImportResult> {
  const sameGuild = file.guild?.id === guildId;
  const result: ImportResult = { rows: 0, dropped: 0, cleared: 0 };
  await db.transaction(async (tx) => {
    const categoryIds = new Map<number, number>();
    for (const spec of TABLES) {
      const columns = cols(spec.table);
      const stateKey = spec.stateKey ?? "guildId";
      const existing = (await tx.select().from(spec.table as any).where(eq(guildCol(spec.table), guildId))) as Row[];
      const stateOf = new Map(existing.map((r) => [String(r[stateKey]), r]));
      await tx.delete(spec.table as any).where(eq(guildCol(spec.table), guildId));

      const incoming = file.tables[spec.name] ?? [];
      const insertRows: { row: Row; oldId?: number }[] = [];
      for (const raw of incoming) {
        const row: Row = {};
        let drop = false;
        for (const [key, col] of Object.entries(columns)) {
          if (key === "guildId" || spec.state?.includes(key)) continue;
          if (key === "id" && col.columnType === "PgSerial") continue;
          if (!(key in raw)) continue;
          let value = raw[key];
          if (key === "messageId" && !sameGuild) value = null;
          if (value !== null && col.columnType === "PgTimestamp") {
            const d = new Date(value);
            value = Number.isNaN(d.getTime()) ? null : d;
          }
          if (ID_KEY.test(key) && typeof value === "string" && SNOWFLAKE.test(value) && value !== guildId && !known.has(value)) {
            // automodExemptions/levelNoXp: targetId kann auch eine Person sein, nur Kanäle/Rollen prüfen
            if (key === "targetId" && raw.kind === "user") {
              /* Personen bleiben */
            } else if (col.notNull) {
              drop = true;
              break;
            } else {
              value = null;
              result.cleared++;
            }
          }
          if (ID_LIST_KEY.test(key) && Array.isArray(value)) {
            const kept = value.filter((v) => typeof v === "string" && (known.has(v) || v === guildId));
            result.cleared += value.length - kept.length;
            value = kept;
          }
          if (value === null && col.notNull && !col.hasDefault) {
            drop = true;
            break;
          }
          if (value !== null || !col.notNull) row[key] = value;
        }
        if (drop) {
          result.dropped++;
          continue;
        }
        row.guildId = guildId;
        // Laufzeit-Zustand von vorher übernehmen (z. B. Fallnummern, Zählerstand im gleichen Kanal)
        const prev = stateOf.get(String(stateKey === "guildId" ? guildId : row[stateKey]));
        if (prev) for (const key of spec.state ?? []) if (prev[key] !== undefined) row[key] = prev[key];
        if (spec.name === "ticketPanels" && Array.isArray(row.categoryIds)) {
          row.categoryIds = row.categoryIds.map((id: number) => categoryIds.get(id)).filter((id: number | undefined) => id !== undefined);
        }
        insertRows.push({ row, oldId: typeof raw.id === "number" ? raw.id : undefined });
      }
      for (const { row, oldId } of insertRows) {
        const [saved] = (await tx.insert(spec.table as any).values(row).onConflictDoNothing().returning()) as Row[];
        if (!saved) {
          result.dropped++;
          continue;
        }
        result.rows++;
        if (spec.name === "ticketCategories" && oldId !== undefined) categoryIds.set(oldId, saved.id);
      }
    }
  });
  return result;
}
