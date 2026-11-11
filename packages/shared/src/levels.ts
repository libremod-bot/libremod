/**
 * Level-Kurve von Libremod: Der Schritt von Level L auf L+1 kostet 100 + 40·L XP.
 * Level 1 gibt es nach 100 XP, Level 10 nach 2.800 XP, Level 50 nach 54.000 XP.
 */
export function xpToNext(level: number): number {
  return 100 + 40 * level;
}

/** Gesamt-XP, ab denen ein Level erreicht ist. */
export function totalXpForLevel(level: number): number {
  return 100 * level + 20 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 0;
  // Näherung über die quadratische Formel, danach exakt nachjustieren.
  let level = Math.max(0, Math.floor((-80 + Math.sqrt(6400 + 80 * xp)) / 40));
  while (totalXpForLevel(level + 1) <= xp) level++;
  while (level > 0 && totalXpForLevel(level) > xp) level--;
  return level;
}

/** Stand innerhalb des aktuellen Levels, z. B. für Fortschrittsbalken. */
export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelForXp(xp);
  return { level, current: xp - totalXpForLevel(level), needed: xpToNext(level) };
}

export function progressBar(current: number, needed: number, width = 14): string {
  const filled = Math.max(0, Math.min(width, Math.round((current / Math.max(1, needed)) * width)));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

export function randomXp(min: number, max: number, random = Math.random): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(random() * (hi - lo + 1));
}

/**
 * Welche Belohnungsrollen ein Mitglied mit diesem Level haben soll und welche nicht.
 * stack: alle erreichten behalten, sonst nur die höchste erreichte.
 */
export function rewardRoles(rewards: { level: number; roleId: string }[], level: number, stack: boolean) {
  const reached = rewards.filter((r) => r.level <= level).sort((a, b) => a.level - b.level);
  const keep = new Set(stack ? reached.map((r) => r.roleId) : reached.slice(-1).map((r) => r.roleId));
  const all = new Set(rewards.map((r) => r.roleId));
  return { keep: [...keep], drop: [...all].filter((id) => !keep.has(id)) };
}

export const MAX_XP = 100_000_000;

// --- XP-Bonus und Saisons ---

export const MIN_XP_PERCENT = 0;
export const MAX_XP_PERCENT = 500;

/** Wochentag in deutscher Zeit: 0 = Sonntag, 6 = Samstag. */
export function berlinWeekday(now = new Date()): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

/**
 * Gesamtfaktor in Prozent: die höchste Bonus-Rolle, am Wochenende zusätzlich der Wochenend-Faktor.
 * Ohne Bonus-Rolle zählt 100 %.
 */
export function xpPercent(opts: { weekendPercent: number; rolePercents: number[] }, now = new Date()): number {
  const role = opts.rolePercents.length ? Math.max(...opts.rolePercents) : 100;
  const wd = berlinWeekday(now);
  const weekend = wd === 0 || wd === 6 ? opts.weekendPercent : 100;
  return Math.round((role * weekend) / 100);
}

export function applyPercent(xp: number, percent: number): number {
  return Math.max(0, Math.round((xp * percent) / 100));
}

export const SEASON_MODES = [
  { value: "off", label: "Aus" },
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Vierteljährlich" },
] as const;

function berlinYearMonth(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month) };
}

/** Ist seit Saisonbeginn ein neuer Monat bzw. ein neues Quartal angebrochen (deutsche Zeit)? */
export function seasonDue(mode: string, startedAt: Date, now = new Date()): boolean {
  if (mode !== "monthly" && mode !== "quarterly") return false;
  const a = berlinYearMonth(startedAt);
  const b = berlinYearMonth(now);
  if (mode === "monthly") return b.year * 12 + b.month > a.year * 12 + a.month;
  const q = (m: number) => Math.floor((m - 1) / 3);
  return b.year * 4 + q(b.month) > a.year * 4 + q(a.month);
}

/** Kurze Zahl für die Rang-Karte: 950, 1,2k, 3,4 Mio. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(".", ",").replace(/,0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(/,0$/, "")} Mio.`;
}

/** Ansage zum Saisonende, für Bot und Dashboard. */
export function seasonEndMessage(season: { number: number; top: { userId: string; xp: number; level: number }[] }) {
  const medal = ["🥇", "🥈", "🥉"];
  const lines = season.top.slice(0, 10).map((t, i) => `${medal[i] ?? `**${i + 1}.**`} <@${t.userId}> · Level ${t.level} · ${t.xp.toLocaleString("de-DE")} XP`);
  return {
    content: `🏁 **Saison ${season.number} ist vorbei!** Danke fürs Mitmachen. Die Besten:\n${lines.join("\n")}\n\nAb jetzt läuft Saison ${season.number + 1}, alle starten wieder bei 0 XP.`,
    allowed_mentions: { parse: [] as string[], users: season.top.slice(0, 3).map((t) => t.userId) },
  };
}
