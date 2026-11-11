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
  /** Hinweis, den die Person nach dem Löschen kurz im Kanal sieht. Platzhalter wie {user}. */
  notice?: string;
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

export type AutomodExemption = typeof automodExemptions.$inferSelect;

/**
 * Log-Arten. Jede Art kann in einen eigenen Kanal gehen.
 * messages: gelöschte/bearbeitete Nachrichten, members: Beitritte/Austritte,
 * member_updates: Namen, Spitznamen, Rollen, server: Kanäle und Rollen, voice: Sprachkanäle.
 */
export const logCategory = pgEnum("log_category", ["messages", "members", "member_updates", "server", "voice"]);
export type LogCategory = (typeof logCategory.enumValues)[number];

/** Eine Zeile pro aktiver Log-Art. Keine Zeile = diese Art wird nicht geloggt. */
export const logChannels = pgTable(
  "log_channels",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    category: logCategory("category").notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.category] })],
);

export type LogChannel = typeof logChannels.$inferSelect;

/** Kanäle oder Kategorien, deren Nachrichten nicht im Nachrichten-Log landen. */
export const logIgnoredChannels = pgTable(
  "log_ignored_channels",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.channelId] })],
);

/** Begrüßung, Direktnachricht beim Beitritt und Abschied. Texte mit Platzhaltern wie {user}. */
export const welcomeSettings = pgTable("welcome_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  welcomeEnabled: boolean("welcome_enabled").notNull().default(false),
  welcomeChannelId: varchar("welcome_channel_id", { length: 32 }),
  welcomeMessage: text("welcome_message").notNull().default("Willkommen auf **{server}**, {user}! Du bist Mitglied Nummer {membercount}."),
  welcomeEmbed: boolean("welcome_embed").notNull().default(true),
  dmEnabled: boolean("dm_enabled").notNull().default(false),
  dmMessage: text("dm_message").notNull().default("Hallo {username}, schön, dass du auf **{server}** bist!"),
  goodbyeEnabled: boolean("goodbye_enabled").notNull().default(false),
  goodbyeChannelId: varchar("goodbye_channel_id", { length: 32 }),
  goodbyeMessage: text("goodbye_message").notNull().default("**{username}** hat den Server verlassen."),
  goodbyeEmbed: boolean("goodbye_embed").notNull().default(false),
});

export type WelcomeSettings = typeof welcomeSettings.$inferSelect;

export const autoRoleTarget = pgEnum("auto_role_target", ["humans", "bots"]);
export type AutoRoleTarget = (typeof autoRoleTarget.enumValues)[number];

/** Rollen, die neue Mitglieder (bzw. neue Bots) automatisch bekommen. */
export const autoRoles = pgTable(
  "auto_roles",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    roleId: varchar("role_id", { length: 32 }).notNull(),
    target: autoRoleTarget("target").notNull().default("humans"),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.roleId, t.target] })],
);

export const rolePanelStyle = pgEnum("role_panel_style", ["buttons", "select"]);
export type RolePanelStyle = (typeof rolePanelStyle.enumValues)[number];

/** Nachricht mit Buttons oder Auswahlmenü, über die sich Mitglieder Rollen selbst geben. */
export const rolePanels = pgTable(
  "role_panels",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    /** Gesetzt, sobald die Nachricht in Discord gepostet wurde. */
    messageId: varchar("message_id", { length: 32 }),
    title: varchar("title", { length: 256 }).notNull(),
    description: text("description").notNull().default(""),
    style: rolePanelStyle("style").notNull().default("buttons"),
    /** Nur eine Rolle aus diesem Panel gleichzeitig (z. B. Farben oder Regionen). */
    single: boolean("single").notNull().default(false),
    /** Rollen in der Reihenfolge, in der sie angezeigt werden. */
    roleIds: jsonb("role_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("role_panels_guild").on(t.guildId)],
);

export type RolePanel = typeof rolePanels.$inferSelect;

export const levelAnnounce = pgEnum("level_announce", ["off", "same", "channel", "dm"]);
export type LevelAnnounce = (typeof levelAnnounce.enumValues)[number];

/** Einstellungen des Level-Systems pro Server. */
export const levelSettings = pgTable("level_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** XP pro Nachricht, zufällig zwischen min und max. */
  textXpMin: integer("text_xp_min").notNull().default(15),
  textXpMax: integer("text_xp_max").notNull().default(25),
  /** Nur eine Nachricht pro Zeitraum bringt XP (gegen Spam). */
  cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
  /** XP pro Minute im Sprachkanal, 0 = aus. Zählt nur mit mindestens einer weiteren Person und ohne Taubschaltung. */
  voiceXpPerMinute: integer("voice_xp_per_minute").notNull().default(10),
  /** Wo Level-Aufstiege verkündet werden. */
  announce: levelAnnounce("announce").notNull().default("same"),
  announceChannelId: varchar("announce_channel_id", { length: 32 }),
  announceMessage: text("announce_message").notNull().default("Glückwunsch {user}, du bist jetzt **Level {level}**!"),
  /** true: alle erreichten Belohnungsrollen behalten. false: nur die höchste. */
  stackRewards: boolean("stack_rewards").notNull().default(true),
});

export type LevelSettings = typeof levelSettings.$inferSelect;

/** Rolle, die ab einem bestimmten Level vergeben wird. */
export const levelRewards = pgTable(
  "level_rewards",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    level: integer("level").notNull(),
    roleId: varchar("role_id", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.level] })],
);

export type LevelReward = typeof levelRewards.$inferSelect;

/** Rollen und Kanäle, in denen es keine XP gibt. */
export const levelNoXp = pgTable(
  "level_no_xp",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    kind: exemptionKind("kind").notNull(),
    targetId: varchar("target_id", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.kind, t.targetId] })],
);

/** XP und Level jedes Mitglieds pro Server. */
export const memberXp = pgTable(
  "member_xp",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    voiceMinutes: integer("voice_minutes").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] }), index("member_xp_ranking").on(t.guildId, t.xp)],
);

export type MemberXp = typeof memberXp.$inferSelect;


/** Eigene Slash-Befehle eines Servers, z. B. /regeln. */
export const customCommands = pgTable(
  "custom_commands",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 32 }).notNull(),
    description: varchar("description", { length: 100 }).notNull(),
    responses: jsonb("responses").$type<string[]>().notNull().default([]),
    /** Antwort als Embed statt als normaler Text. */
    embed: boolean("embed").notNull().default(false),
    embedTitle: varchar("embed_title", { length: 256 }),
    embedColor: integer("embed_color"),
    /** Antwort nur für die aufrufende Person sichtbar. */
    ephemeral: boolean("ephemeral").notNull().default(false),
    uses: integer("uses").notNull().default(0),
  },
  (t) => [uniqueIndex("custom_commands_guild_name").on(t.guildId, t.name)],
);

export type CustomCommand = typeof customCommands.$inferSelect;

export const scheduleKind = pgEnum("schedule_kind", ["interval", "daily", "weekly"]);
export type ScheduleKind = (typeof scheduleKind.enumValues)[number];

/** Nachrichten, die Libremod regelmäßig in einen Kanal postet. */
export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    content: text("content").notNull(),
    embed: boolean("embed").notNull().default(false),
    embedTitle: varchar("embed_title", { length: 256 }),
    kind: scheduleKind("kind").notNull(),
    /** interval: Minuten zwischen zwei Nachrichten. */
    intervalMinutes: integer("interval_minutes"),
    /** daily/weekly: Uhrzeit als "HH:MM" (Europe/Berlin). */
    timeOfDay: varchar("time_of_day", { length: 5 }),
    /** weekly: 1 = Montag … 7 = Sonntag. */
    weekday: integer("weekday"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  },
  (t) => [index("scheduled_due").on(t.enabled, t.nextRunAt), index("scheduled_guild").on(t.guildId)],
);

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

/** Sprachkanäle, deren Name einen Zähler zeigt, z. B. „Mitglieder: 1.234“. */
export const counterChannels = pgTable("counter_channels", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  /** Name mit Platzhaltern wie {members}. */
  template: varchar("template", { length: 100 }).notNull(),
});

export type CounterChannel = typeof counterChannels.$inferSelect;

/** „Beitreten zum Erstellen“: Wer diesem Kanal beitritt, bekommt einen eigenen Sprachkanal. */
export const tempVoiceHubs = pgTable("temp_voice_hubs", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  /** Name des neuen Kanals mit Platzhaltern wie {username}. */
  nameTemplate: varchar("name_template", { length: 100 }).notNull().default("Kanal von {username}"),
  /** 0 = unbegrenzt */
  userLimit: integer("user_limit").notNull().default(0),
});

export type TempVoiceHub = typeof tempVoiceHubs.$inferSelect;

/** Von Libremod erstellte temporäre Kanäle, damit sie auch nach einem Neustart aufgeräumt werden. */
export const tempVoiceChannels = pgTable("temp_voice_channels", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  ownerId: varchar("owner_id", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TempVoiceChannel = typeof tempVoiceChannels.$inferSelect;

export const notifyPlatform = pgEnum("notify_platform", ["youtube", "twitch", "kick", "reddit", "rss"]);

/** Benachrichtigungen über neue Videos, Livestreams, Beiträge und Feed-Einträge. */
export const notificationFeeds = pgTable(
  "notification_feeds",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    platform: notifyPlatform("platform").notNull(),
    /** YouTube-Kanal-ID, Twitch-/Kick-Name, Subreddit oder Feed-Adresse. */
    sourceId: varchar("source_id", { length: 500 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    message: text("message").notNull(),
    /** Rolle, die erwähnt wird; die Server-ID steht für @everyone. */
    mentionRoleId: varchar("mention_role_id", { length: 32 }),
    enabled: boolean("enabled").notNull().default(true),
    /** Bereits gesehene Einträge. null = noch nie abgefragt, dann wird nichts Altes gepostet. */
    seen: jsonb("seen").$type<string[]>(),
    /** Twitch/Kick: zuletzt verkündeter Stream. */
    lastStreamId: varchar("last_stream_id", { length: 100 }),
    live: boolean("live").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    lastError: varchar("last_error", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_guild").on(t.guildId), index("notification_source").on(t.platform, t.sourceId)],
);

export type NotificationFeed = typeof notificationFeeds.$inferSelect;

/** Highlight-Kanal: Nachrichten mit vielen gleichen Reaktionen werden dort gesammelt. */
export const highlightSettings = pgTable("highlight_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  channelId: varchar("channel_id", { length: 32 }),
  /** Unicode-Emoji oder ID eines Server-Emojis. */
  emoji: varchar("emoji", { length: 64 }).notNull().default("⭐"),
  threshold: integer("threshold").notNull().default(5),
  /** Zählt die Reaktion der Person, die die Nachricht geschrieben hat? */
  countSelf: boolean("count_self").notNull().default(false),
  /** Nachrichten aus NSFW-Kanälen mitnehmen? */
  allowNsfw: boolean("allow_nsfw").notNull().default(false),
});

export type HighlightSettings = typeof highlightSettings.$inferSelect;

/** Bereits hervorgehobene Nachrichten, damit jede nur einmal gepostet wird. */
export const highlightPosts = pgTable("highlight_posts", {
  messageId: varchar("message_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  channelId: varchar("channel_id", { length: 32 }).notNull(),
  /** null, solange der Beitrag gerade erstellt wird. */
  highlightMessageId: varchar("highlight_message_id", { length: 32 }),
  highlightChannelId: varchar("highlight_channel_id", { length: 32 }),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Kanäle, die Libremod in festen Abständen leert. */
export const autoPurgeChannels = pgTable("auto_purge_channels", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  intervalHours: integer("interval_hours").notNull(),
  keepPinned: boolean("keep_pinned").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastDeleted: integer("last_deleted"),
});

export type AutoPurgeChannel = typeof autoPurgeChannels.$inferSelect;

/** Kanäle mit automatischem Langsam-Modus je nach Aktivität. */
export const autoSlowmodeChannels = pgTable("auto_slowmode_channels", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  /** Ab so vielen Nachrichten pro Minute greift der Langsam-Modus. */
  messagesPerMinute: integer("messages_per_minute").notNull().default(20),
  minSeconds: integer("min_seconds").notNull().default(0),
  maxSeconds: integer("max_seconds").notNull().default(30),
});

export type AutoSlowmodeChannel = typeof autoSlowmodeChannels.$inferSelect;

// --- Ticket-System ---

export interface TicketQuestion {
  label: string;
  placeholder: string;
  /** true = mehrzeilig */
  long: boolean;
  required: boolean;
}

export interface TicketAnswer {
  question: string;
  answer: string;
}

/** Allgemeine Ticket-Einstellungen pro Server. */
export const ticketSettings = pgTable("ticket_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  /** Hierhin gehen Transkripte und Ereignisse (geöffnet, geschlossen, Bewertung). */
  logChannelId: varchar("log_channel_id", { length: 32 }),
  transcriptDm: boolean("transcript_dm").notNull().default(true),
  ratingEnabled: boolean("rating_enabled").notNull().default(true),
  ownerCanClose: boolean("owner_can_close").notNull().default(true),
  /** Schließt Tickets ohne neue Nachricht nach so vielen Stunden. 0 = nie. */
  autoCloseHours: integer("auto_close_hours").notNull().default(0),
  /** Mitglieder mit diesen Rollen können keine Tickets öffnen. */
  blockedRoleIds: jsonb("blocked_role_ids").$type<string[]>().notNull().default([]),
  /** Laufende Nummer für das nächste Ticket. */
  nextNumber: integer("next_number").notNull().default(1),
});

export type TicketSettings = typeof ticketSettings.$inferSelect;

export const ticketMode = pgEnum("ticket_mode", ["channel", "thread"]);
export type TicketMode = (typeof ticketMode.enumValues)[number];

/** Ticket-Arten, z. B. „Support“, „Bewerbung“, „Melden“. */
export const ticketCategories = pgTable(
  "ticket_categories",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    emoji: varchar("emoji", { length: 64 }),
    description: varchar("description", { length: 100 }).notNull().default(""),
    /** channel: eigener Kanal, thread: privater Thread. */
    mode: ticketMode("mode").notNull().default("channel"),
    /** channel: Discord-Kategorie für neue Kanäle (optional). thread: Textkanal, in dem die Threads entstehen. */
    parentId: varchar("parent_id", { length: 32 }),
    /** Team-Rollen, die die Tickets dieser Art sehen und bearbeiten. */
    staffRoleIds: jsonb("staff_role_ids").$type<string[]>().notNull().default([]),
    /** Team-Rollen beim Öffnen erwähnen. */
    pingStaff: boolean("ping_staff").notNull().default(false),
    welcomeMessage: text("welcome_message").notNull().default("Hallo {user}, danke für dein Ticket! Das Team meldet sich so schnell wie möglich."),
    /** Bis zu 5 Fragen, die vor dem Öffnen beantwortet werden. */
    questions: jsonb("questions").$type<TicketQuestion[]>().notNull().default([]),
    /** Höchstzahl offener Tickets dieser Art pro Person. */
    maxOpen: integer("max_open").notNull().default(1),
    nameTemplate: varchar("name_template", { length: 100 }).notNull().default("ticket-{number}"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("ticket_categories_guild").on(t.guildId)],
);

export type TicketCategory = typeof ticketCategories.$inferSelect;

export const ticketPanelStyle = pgEnum("ticket_panel_style", ["buttons", "select"]);

/** Nachricht mit Buttons bzw. Menü, über die Mitglieder Tickets öffnen. */
export const ticketPanels = pgTable("ticket_panels", {
  id: serial("id").primaryKey(),
  guildId: varchar("guild_id", { length: 32 }).notNull(),
  channelId: varchar("channel_id", { length: 32 }).notNull(),
  messageId: varchar("message_id", { length: 32 }),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull().default(""),
  color: integer("color").notNull().default(0x4cb4ff),
  style: ticketPanelStyle("style").notNull().default("buttons"),
  categoryIds: jsonb("category_ids").$type<number[]>().notNull().default([]),
});

export type TicketPanel = typeof ticketPanels.$inferSelect;

export const ticketStatus = pgEnum("ticket_status", ["open", "closed"]);

export const tickets = pgTable(
  "tickets",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    number: integer("number").notNull(),
    categoryId: integer("category_id"),
    categoryName: varchar("category_name", { length: 80 }).notNull(),
    /** Kanal bzw. Thread des Tickets; null, solange er erstellt wird. */
    channelId: varchar("channel_id", { length: 32 }),
    ownerId: varchar("owner_id", { length: 32 }).notNull(),
    claimedBy: varchar("claimed_by", { length: 32 }),
    status: ticketStatus("status").notNull().default("open"),
    answers: jsonb("answers").$type<TicketAnswer[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: varchar("closed_by", { length: 32 }),
    closeReason: varchar("close_reason", { length: 500 }),
    messageCount: integer("message_count").notNull().default(0),
    rating: integer("rating"),
    /** Transkript als HTML, im Dashboard ansehbar. */
    transcript: text("transcript"),
  },
  (t) => [
    uniqueIndex("tickets_guild_number").on(t.guildId, t.number),
    index("tickets_channel").on(t.channelId),
    index("tickets_open").on(t.guildId, t.status),
  ],
);

export type Ticket = typeof tickets.$inferSelect;

// --- Server-Währung ---

export const economySettings = pgTable("economy_settings", {
  guildId: varchar("guild_id", { length: 32 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  currencyName: varchar("currency_name", { length: 32 }).notNull().default("Münzen"),
  /** Emoji oder kurzes Zeichen vor Beträgen. */
  currencySymbol: varchar("currency_symbol", { length: 64 }).notNull().default("🪙"),
  startBalance: integer("start_balance").notNull().default(0),
  dailyAmount: integer("daily_amount").notNull().default(100),
  /** Zusätzlich pro Tag in Folge (höchstens 7 Tage). */
  dailyStreakBonus: integer("daily_streak_bonus").notNull().default(10),
  workMin: integer("work_min").notNull().default(20),
  workMax: integer("work_max").notNull().default(60),
  workCooldownMinutes: integer("work_cooldown_minutes").notNull().default(60),
  /** Für Nachrichten im Chat, höchstens einmal pro Minute. 0 = aus. */
  chatReward: integer("chat_reward").notNull().default(0),
  /** Überweisungen zwischen Mitgliedern erlauben. */
  allowPay: boolean("allow_pay").notNull().default(true),
});

export type EconomySettings = typeof economySettings.$inferSelect;

export const memberBalances = pgTable(
  "member_balances",
  {
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    balance: integer("balance").notNull().default(0),
    /** Insgesamt verdient (für Statistiken). */
    earned: integer("earned").notNull().default(0),
    lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
    dailyStreak: integer("daily_streak").notNull().default(0),
    lastWorkAt: timestamp("last_work_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] }), index("member_balances_ranking").on(t.guildId, t.balance)],
);

export type MemberBalance = typeof memberBalances.$inferSelect;

export const shopItems = pgTable(
  "shop_items",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    description: varchar("description", { length: 200 }).notNull().default(""),
    price: integer("price").notNull(),
    /** Rolle, die man beim Kauf bekommt (optional). */
    roleId: varchar("role_id", { length: 32 }),
    /** Verbleibende Anzahl; null = unbegrenzt. */
    stock: integer("stock"),
    /** Text, den man nach dem Kauf sieht, z. B. wie man den Gewinn einlöst. */
    replyMessage: varchar("reply_message", { length: 500 }).notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [index("shop_items_guild").on(t.guildId)],
);

export type ShopItem = typeof shopItems.$inferSelect;

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    itemId: integer("item_id"),
    itemName: varchar("item_name", { length: 60 }).notNull(),
    price: integer("price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchases_member").on(t.guildId, t.userId)],
);

/** Kontobewegungen, damit das Team im Dashboard nachvollziehen kann, was passiert ist. */
export const economyLog = pgTable(
  "economy_log",
  {
    id: serial("id").primaryKey(),
    guildId: varchar("guild_id", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 32 }).notNull(),
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("economy_log_guild").on(t.guildId, t.createdAt)],
);
