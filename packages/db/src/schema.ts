import {
  pgTable,
  pgEnum,
  varchar,
  boolean,
  timestamp,
  integer,
  serial,
  text,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Einstellungen pro Discord-Server. Alles, was im Dashboard einstellbar ist,
 * landet hier oder in eigenen Tabellen, die über guildId verknüpft sind.
 */
export const guildSettings = pgTable("guild_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  locale: varchar("locale", { length: 8 }).notNull().default("de"),
  modLogChannelId: varchar("mod_log_channel_id", { length: 32 }),
  automodEnabled: boolean("automod_enabled").notNull().default(false),
  /** Zähler für fortlaufende Fallnummern pro Server. */
  caseCounter: integer("case_counter").notNull().default(0),
  /** Betroffene vor Kick/Ban/Timeout/Verwarnung per Direktnachricht informieren. */
  dmOnAction: boolean("dm_on_action").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GuildSettings = typeof guildSettings.$inferSelect;

export const caseType = pgEnum("case_type", ["warn", "timeout", "untimeout", "kick", "ban", "unban"]);
export type CaseType = (typeof caseType.enumValues)[number];

/** Fallakte: jede Moderationsaktion wird als Fall mit fortlaufender Nummer gespeichert. */
export const modCases = pgTable(
  "mod_cases",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    caseNumber: integer("case_number").notNull(),
    type: caseType("type").notNull(),
    targetId: varchar("target_id", { length: 32 }).notNull(),
    moderatorId: varchar("moderator_id", { length: 32 }).notNull(),
    reason: text("reason"),
    /** Bei Timeout und befristetem Ban: wann die Strafe endet. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** false, sobald ein befristeter Ban aufgehoben wurde oder eine Verwarnung gelöscht ist. */
    active: boolean("active").notNull().default(true),
    /** Automatisch durch Verwarnungsstufen ausgelöst. */
    automatic: boolean("automatic").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mod_cases_guild_number").on(t.guildId, t.caseNumber),
    index("mod_cases_guild_target").on(t.guildId, t.targetId),
    index("mod_cases_expiring").on(t.type, t.active, t.expiresAt),
  ],
);

export type ModCase = typeof modCases.$inferSelect;

export const escalationAction = pgEnum("escalation_action", ["timeout", "kick", "ban"]);
export type EscalationAction = (typeof escalationAction.enumValues)[number];

/** Verwarnungsstufen: Bei genau warnCount aktiven Verwarnungen wird action ausgeführt. */
export const warnEscalations = pgTable(
  "warn_escalations",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    warnCount: integer("warn_count").notNull(),
    action: escalationAction("action").notNull(),
    /** Dauer in Sekunden für Timeout oder befristeten Ban. Leer = dauerhafter Ban. */
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.warnCount] })],
);

export type WarnEscalation = typeof warnEscalations.$inferSelect;
