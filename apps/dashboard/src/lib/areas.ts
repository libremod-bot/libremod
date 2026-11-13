import type { IconName } from "@/components/Icon";

/** Bereiche des Dashboards. Team-Zugänge werden pro Bereich vergeben. */
export const AREAS = [
  { key: "moderation", label: "Moderation", icon: "gavel", group: "Schutz" },
  { key: "automod", label: "Auto-Mod", icon: "shield", group: "Schutz" },
  { key: "verification", label: "Verifizierung", icon: "usercheck", group: "Schutz" },
  { key: "logging", label: "Logging", icon: "log", group: "Schutz" },
  { key: "cases", label: "Fallakte", icon: "list", group: "Schutz" },
  { key: "tickets", label: "Tickets", icon: "ticket", group: "Schutz" },
  { key: "appeals", label: "Einsprüche", icon: "mail", group: "Schutz" },
  { key: "welcome", label: "Begrüßung", icon: "wave", group: "Community" },
  { key: "roles", label: "Rollen", icon: "tag", group: "Community" },
  { key: "suggestions", label: "Vorschläge", icon: "bulb", group: "Community" },
  { key: "quotes", label: "Zitate", icon: "note", group: "Community" },
  { key: "commands", label: "Eigene Befehle", icon: "slash", group: "Community" },
  { key: "schedule", label: "Geplante Nachrichten", icon: "clock", group: "Community" },
  { key: "channels", label: "Sprachkanäle & Zähler", icon: "mic", group: "Community" },
  { key: "tools", label: "Highlights & Kanal-Pflege", icon: "sparkle", group: "Community" },
  { key: "notifications", label: "Benachrichtigungen", icon: "bell", group: "Community" },
  { key: "levels", label: "Level", icon: "steps", group: "Spaß" },
  { key: "economy", label: "Währung & Shop", icon: "coin", group: "Spaß" },
  { key: "giveaways", label: "Gewinnspiele", icon: "gift", group: "Spaß" },
  { key: "events", label: "Events", icon: "calendar", group: "Spaß" },
  { key: "birthdays", label: "Geburtstage", icon: "cake", group: "Spaß" },
  { key: "counting", label: "Zähl-Kanal", icon: "hash", group: "Spaß" },
  { key: "wordchain", label: "Wortkette", icon: "link", group: "Spaß" },
  // Nur für Personen mit „Server verwalten“, nicht als Team-Zugang vergebbar:
  { key: "stats", label: "Statistik", icon: "gauge", group: "Verwaltung", adminOnly: true },
  { key: "team", label: "Team-Zugänge", icon: "users", group: "Verwaltung", adminOnly: true },
  { key: "audit", label: "Änderungsprotokoll", icon: "file", group: "Verwaltung", adminOnly: true },
  { key: "backup", label: "Export & Import", icon: "server", group: "Verwaltung", adminOnly: true },
] as const satisfies readonly { key: string; label: string; icon: IconName; group: string; adminOnly?: boolean }[];

export type AreaKey = (typeof AREAS)[number]["key"];

export const AREA_KEYS = AREAS.map((a) => a.key) as AreaKey[];
export const TEAM_AREAS = AREAS.filter((a) => !("adminOnly" in a && a.adminOnly));
export const isTeamArea = (k: string): k is AreaKey => TEAM_AREAS.some((a) => a.key === k);
export const areaLabel = (k: string) => AREAS.find((a) => a.key === k)?.label ?? k;
