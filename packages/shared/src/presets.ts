/**
 * Vorlagen für den Einrichtungs-Assistenten: Aus wenigen Antworten (Art des Servers, wie streng, welche
 * Module) entsteht ein Plan mit allen Einstellungen. Der Plan wird erst im Dashboard angewendet.
 */

export const PRESETS = ["community", "gaming", "learning", "creator", "friends"] as const;
export type PresetKey = (typeof PRESETS)[number];

export const PROTECTION_LEVELS = ["relaxed", "normal", "strict"] as const;
export type ProtectionLevel = (typeof PROTECTION_LEVELS)[number];

export const SETUP_MODULES = ["welcome", "levels", "economy", "suggestions", "birthdays"] as const;
export type SetupModule = (typeof SETUP_MODULES)[number];

type Filter = "spam" | "invites" | "links" | "words" | "caps" | "mentions" | "phishing";
type RuleAction = "delete" | "warn" | "timeout" | "kick" | "ban";

export interface PresetInfo {
  /** Empfohlene Strenge */
  protection: ProtectionLevel;
  /** Module, die standardmäßig angehakt sind */
  modules: SetupModule[];
}

export const PRESET_INFO: Record<PresetKey, PresetInfo> = {
  community: { protection: "normal", modules: ["welcome", "levels", "suggestions", "birthdays"] },
  gaming: { protection: "normal", modules: ["welcome", "levels", "economy"] },
  learning: { protection: "strict", modules: ["welcome", "suggestions"] },
  creator: { protection: "normal", modules: ["welcome", "levels", "suggestions"] },
  friends: { protection: "relaxed", modules: ["welcome", "levels", "economy", "birthdays"] },
};

export interface SetupAnswers {
  preset: PresetKey;
  protection: ProtectionLevel;
  modules: SetupModule[];
  modLogChannelId: string | null;
  logChannelId: string | null;
  welcomeChannelId: string | null;
  suggestionChannelId: string | null;
}

export interface PlannedRule {
  filter: Filter;
  enabled: boolean;
  action: RuleAction;
  durationSeconds: number | null;
  threshold?: number;
  allowedDomains?: string[];
}

export interface SetupPlan {
  guild: {
    automodEnabled: true;
    dmOnAction: boolean;
    raidEnabled: boolean;
    raidAction: "alert" | "timeout" | "kick";
    modLogChannelId: string | null;
  };
  rules: PlannedRule[];
  escalations: { warnCount: number; action: "timeout" | "kick" | "ban"; durationSeconds: number | null }[];
  logCategories: ("messages" | "members" | "member_updates" | "server" | "voice")[];
  logChannelId: string | null;
  welcome: { channelId: string } | null;
  levels: boolean;
  economy: boolean;
  /** Vorschläge brauchen einen eigenen Kanal. */
  suggestions: { channelId: string } | null;
  /** Glückwünsche landen im Begrüßungskanal. */
  birthdays: { channelId: string } | null;
}

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Links, die auf fast jedem Server harmlos sind (nur bei „streng“ relevant, dort sind andere Links aus). */
export const SAFE_LINK_DOMAINS = ["youtube.com", "youtu.be", "twitch.tv", "github.com", "wikipedia.org", "tenor.com", "giphy.com"];

const rule = (filter: Filter, action: RuleAction, durationSeconds: number | null = null, extra: Partial<PlannedRule> = {}): PlannedRule => ({
  filter,
  enabled: true,
  action,
  durationSeconds,
  ...extra,
});
const off = (filter: Filter): PlannedRule => ({ filter, enabled: false, action: "delete", durationSeconds: null });

function protectionRules(level: ProtectionLevel): Pick<SetupPlan, "rules" | "escalations"> & { raid: SetupPlan["guild"]["raidAction"] | null } {
  switch (level) {
    case "relaxed":
      return {
        rules: [rule("phishing", "kick"), rule("spam", "delete", null, { threshold: 7 }), rule("mentions", "delete", null, { threshold: 8 }), off("invites"), off("links"), off("caps")],
        escalations: [{ warnCount: 5, action: "timeout", durationSeconds: HOUR }],
        raid: null,
      };
    case "normal":
      return {
        rules: [
          rule("phishing", "ban"),
          rule("spam", "timeout", 10 * MIN, { threshold: 5 }),
          rule("mentions", "timeout", 10 * MIN, { threshold: 5 }),
          rule("invites", "delete"),
          rule("caps", "delete", null, { threshold: 70 }),
          off("links"),
        ],
        escalations: [
          { warnCount: 3, action: "timeout", durationSeconds: HOUR },
          { warnCount: 5, action: "timeout", durationSeconds: DAY },
          { warnCount: 7, action: "ban", durationSeconds: null },
        ],
        raid: "alert",
      };
    case "strict":
      return {
        rules: [
          rule("phishing", "ban"),
          rule("spam", "timeout", HOUR, { threshold: 4 }),
          rule("mentions", "timeout", HOUR, { threshold: 4 }),
          rule("invites", "warn"),
          rule("caps", "warn", null, { threshold: 60 }),
          rule("links", "delete", null, { allowedDomains: SAFE_LINK_DOMAINS }),
        ],
        escalations: [
          { warnCount: 2, action: "timeout", durationSeconds: HOUR },
          { warnCount: 3, action: "timeout", durationSeconds: DAY },
          { warnCount: 5, action: "ban", durationSeconds: null },
        ],
        raid: "timeout",
      };
  }
}

/** Aus den Antworten des Assistenten den Plan berechnen. */
export function planSetup(a: SetupAnswers): SetupPlan {
  const p = protectionRules(a.protection);
  const has = (m: SetupModule) => a.modules.includes(m);
  return {
    guild: {
      automodEnabled: true,
      dmOnAction: true,
      raidEnabled: p.raid !== null,
      raidAction: p.raid ?? "alert",
      modLogChannelId: a.modLogChannelId,
    },
    rules: p.rules,
    escalations: p.escalations,
    // Ohne Log-Kanal gibt es nichts zu loggen. Sprachkanäle nur, wo viel im Voice passiert.
    logCategories: a.logChannelId ? ["messages", "members", "member_updates", "server", ...(a.preset === "gaming" || a.preset === "friends" ? (["voice"] as const) : [])] : [],
    logChannelId: a.logChannelId,
    welcome: has("welcome") && a.welcomeChannelId ? { channelId: a.welcomeChannelId } : null,
    levels: has("levels"),
    economy: has("economy"),
    suggestions: has("suggestions") && a.suggestionChannelId ? { channelId: a.suggestionChannelId } : null,
    birthdays: has("birthdays") && a.welcomeChannelId ? { channelId: a.welcomeChannelId } : null,
  };
}

const isPreset = (v: unknown): v is PresetKey => PRESETS.includes(v as PresetKey);
const isLevel = (v: unknown): v is ProtectionLevel => PROTECTION_LEVELS.includes(v as ProtectionLevel);

/** Formulardaten prüfen. Unbekannte Werte werden ignoriert, Kanäle nur als Discord-ID übernommen. */
export function parseSetupAnswers(get: (key: string) => string, getAll: (key: string) => string[]): SetupAnswers | null {
  const preset = get("preset");
  const protection = get("protection");
  if (!isPreset(preset) || !isLevel(protection)) return null;
  const id = (k: string) => (/^\d{17,20}$/.test(get(k)) ? get(k) : null);
  return {
    preset,
    protection,
    modules: SETUP_MODULES.filter((m) => getAll("modules").includes(m)),
    modLogChannelId: id("modLogChannelId"),
    logChannelId: id("logChannelId"),
    welcomeChannelId: id("welcomeChannelId"),
    suggestionChannelId: id("suggestionChannelId"),
  };
}
