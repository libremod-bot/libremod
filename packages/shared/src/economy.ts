/** Server-Währung: Regeln für Bonus, Arbeit und Anzeige, gemeinsam für Bot und Dashboard. */

export const MAX_BALANCE = 1_000_000_000;
export const MAX_SHOP_ITEMS = 25;
/** Zwischen zwei täglichen Boni müssen so viele Stunden liegen. */
export const DAILY_COOLDOWN_H = 20;
/** Wer länger wartet, verliert die Serie. */
export const DAILY_STREAK_RESET_H = 48;
export const MAX_STREAK_BONUS_DAYS = 7;

const nf = new Intl.NumberFormat("de-DE");

export function formatMoney(amount: number, symbol: string) {
  const s = /^\d{17,20}$/.test(symbol) ? `<:c:${symbol}>` : symbol;
  return `${s} ${nf.format(amount)}`.trim();
}

export type DailyResult =
  | { ok: true; amount: number; streak: number }
  | { ok: false; nextAt: Date };

export function dailyReward(
  cfg: { dailyAmount: number; dailyStreakBonus: number },
  last: { lastDailyAt: Date | null; dailyStreak: number },
  now = new Date(),
): DailyResult {
  if (last.lastDailyAt) {
    const hours = (now.getTime() - last.lastDailyAt.getTime()) / 3_600_000;
    if (hours < DAILY_COOLDOWN_H) return { ok: false, nextAt: new Date(last.lastDailyAt.getTime() + DAILY_COOLDOWN_H * 3_600_000) };
    const streak = hours <= DAILY_STREAK_RESET_H ? last.dailyStreak + 1 : 1;
    return { ok: true, streak, amount: cfg.dailyAmount + Math.min(streak - 1, MAX_STREAK_BONUS_DAYS) * cfg.dailyStreakBonus };
  }
  return { ok: true, streak: 1, amount: cfg.dailyAmount };
}

export function workReady(lastWorkAt: Date | null, cooldownMinutes: number, now = new Date()): { ok: true } | { ok: false; nextAt: Date } {
  if (!lastWorkAt) return { ok: true };
  const next = lastWorkAt.getTime() + cooldownMinutes * 60_000;
  return now.getTime() >= next ? { ok: true } : { ok: false, nextAt: new Date(next) };
}

export function randomBetween(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** Kleine Geschichten für /work. {amount} wird ersetzt. */
export const WORK_TEXTS = [
  "Du hast im Café Kaffee ausgeschenkt und {amount} verdient.",
  "Du hast einem Nachbarn beim Umzug geholfen. Er drückt dir {amount} in die Hand.",
  "Du hast Bugs in einem Open-Source-Projekt gefixt und bekommst {amount}.",
  "Du hast Pakete ausgeliefert und {amount} verdient.",
  "Du hast den Server-Garten gepflegt. Lohn: {amount}.",
  "Du hast Pizza ausgefahren und ordentlich Trinkgeld bekommen: {amount}.",
  "Du hast einen Stream moderiert und {amount} verdient.",
  "Du hast alte Spiele auf dem Flohmarkt verkauft und {amount} eingenommen.",
  "Du hast Nachhilfe gegeben und {amount} verdient.",
  "Du hast Pixel-Art für ein Spiel gezeichnet und {amount} bekommen.",
  "Du hast im Rechenzentrum Kabel sortiert. Dafür gibt es {amount}.",
  "Du hast Hunde ausgeführt und {amount} verdient.",
];

export function workText(amount: string, rnd = Math.random) {
  return WORK_TEXTS[Math.floor(rnd() * WORK_TEXTS.length)]!.replace("{amount}", amount);
}
