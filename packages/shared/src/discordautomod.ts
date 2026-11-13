/**
 * Discords eigene AutoMod: Regeln, die Discord selbst prüft, bevor eine Nachricht überhaupt erscheint.
 * Libremod legt sie nur an und schaltet sie um. Hier stehen die Vorlagen als reine Daten.
 */

/** Discord: trigger_type */
export const DISCORD_TRIGGER = { keyword: 1, spam: 3, preset: 4, mentions: 5, profile: 6 } as const;
/** Discord: action.type */
const BLOCK = 1;
const ALERT = 2;

export const DISCORD_RULE_KINDS = ["preset", "mentions", "spam", "keyword"] as const;
export type DiscordRuleKind = (typeof DISCORD_RULE_KINDS)[number];

export interface DiscordRuleOptions {
  /** Hierhin schickt Discord eine Meldung, wenn eine Nachricht blockiert wird. */
  alertChannelId?: string | null;
  /** keyword: Wörter, * als Platzhalter wie bei Discord. */
  keywords?: string[];
  /** mentions: ab so vielen Erwähnungen blockieren. */
  mentionLimit?: number;
}

export interface DiscordRuleBody {
  name: string;
  event_type: 1;
  trigger_type: number;
  trigger_metadata?: Record<string, unknown>;
  actions: { type: number; metadata?: Record<string, unknown> }[];
  enabled: true;
}

/** Name der Regel, wie er bei Discord erscheint (deutsch, wird im Dashboard übersetzt angezeigt). */
export const DISCORD_RULE_NAMES: Record<DiscordRuleKind, string> = {
  preset: "Libremod: Schimpfwörter und anstößige Inhalte",
  mentions: "Libremod: Erwähnungs-Spam",
  spam: "Libremod: Verdächtige Spam-Inhalte",
  keyword: "Libremod: Eigene Wortliste",
};

/** Discord erlaubt höchstens 1000 Wörter mit je 60 Zeichen. */
export function cleanKeywords(list: string[]): string[] {
  return [...new Set(list.map((w) => w.trim().toLowerCase()).filter((w) => w.length > 0 && w.length <= 60))].slice(0, 1000);
}

export function buildDiscordRule(kind: DiscordRuleKind, opts: DiscordRuleOptions = {}): DiscordRuleBody {
  const actions: DiscordRuleBody["actions"] = [{ type: BLOCK, metadata: { custom_message: "" } }];
  if (opts.alertChannelId) actions.push({ type: ALERT, metadata: { channel_id: opts.alertChannelId } });
  const base = { name: DISCORD_RULE_NAMES[kind], event_type: 1 as const, actions, enabled: true as const };
  switch (kind) {
    case "preset":
      // 1 = Schimpfwörter, 2 = sexuelle Inhalte, 3 = Beleidigungen
      return { ...base, trigger_type: DISCORD_TRIGGER.preset, trigger_metadata: { presets: [1, 2, 3] } };
    case "mentions":
      return {
        ...base,
        trigger_type: DISCORD_TRIGGER.mentions,
        trigger_metadata: { mention_total_limit: Math.min(50, Math.max(3, opts.mentionLimit ?? 6)), mention_raid_protection_enabled: true },
      };
    case "spam":
      return { ...base, trigger_type: DISCORD_TRIGGER.spam };
    case "keyword":
      return { ...base, trigger_type: DISCORD_TRIGGER.keyword, trigger_metadata: { keyword_filter: cleanKeywords(opts.keywords ?? []) } };
  }
}

/** Welche Art eine bestehende Regel bei Discord hat (für die Anzeige). */
export function discordRuleKind(triggerType: number): DiscordRuleKind | "profile" | "other" {
  switch (triggerType) {
    case DISCORD_TRIGGER.keyword:
      return "keyword";
    case DISCORD_TRIGGER.spam:
      return "spam";
    case DISCORD_TRIGGER.preset:
      return "preset";
    case DISCORD_TRIGGER.mentions:
      return "mentions";
    case DISCORD_TRIGGER.profile:
      return "profile";
    default:
      return "other";
  }
}
