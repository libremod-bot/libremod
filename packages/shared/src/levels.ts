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
