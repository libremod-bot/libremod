import {
  pgTable,
  pgEnum,
  varchar,
  boolean,
  timestamp,
  integer,
  serial,
  text,
  jsonb,
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
  /** Raid-Schutz: ab raidJoinThreshold Beitritten in raidWindowSeconds greift raidAction. */
  raidEnabled: boolean("raid_enabled").notNull().default(false),
  raidJoinThreshold: integer("raid_join_threshold").notNull().default(10),
  raidWindowSeconds: integer("raid_window_seconds").notNull().default(10),
  raidAction: varchar("raid_action", { length: 16 }).notNull().default("alert"),
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

export const automodFilter = pgEnum("automod_filter", ["spam", "invites", "links", "words", "caps", "mentions"]);
export type AutomodFilter = (typeof automodFilter.enumValues)[number];

export const automodAction = pgEnum("automod_action", ["delete", "warn", "timeout", "kick", "ban"]);
export type AutomodAction = (typeof automodAction.enumValues)[number];

/** Filter-spezifische Einstellungen. Nicht genutzte Felder bleiben leer. */
export interface AutomodConfig {
  /** spam: Nachrichten pro 5 Sekunden, caps: Prozent, mentions: Anzahl */
  threshold?: number;
  /** words: verbotene Wörter, * am Ende = beliebige Endung */
  words?: string[];
  /** links: erlaubte Domains inkl. Subdomains */
  allowedDomains?: string[];
}

/** Eine Regel pro Filter und Server. */
export const automodRules = pgTable(
  "automod_rules",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    filter: automodFilter("filter").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    action: automodAction("action").notNull().default("delete"),
    /** Für Timeout bzw. befristeten Ban. */
    durationSeconds: integer("duration_seconds"),
    config: jsonb("config").$type<AutomodConfig>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.filter] })],
);

export type AutomodRule = typeof automodRules.$inferSelect;

export const exemptionKind = pgEnum("exemption_kind", ["role", "channel"]);

/** Rollen und Kanäle, in denen die Auto-Moderation nicht eingreift. */
export const automodExemptions = pgTable(
  "automod_exemptions",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    kind: exemptionKind("kind").notNull(),
    targetId: varchar("target_id", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.kind, t.targetId] })],
);
