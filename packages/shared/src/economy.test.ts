import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyReward, formatMoney, randomBetween, workReady } from "./economy.js";

test("täglicher Bonus mit Serie", () => {
  const cfg = { dailyAmount: 100, dailyStreakBonus: 10 };
  const now = new Date("2026-11-11T12:00:00Z");
  assert.deepEqual(dailyReward(cfg, { lastDailyAt: null, dailyStreak: 0 }, now), { ok: true, amount: 100, streak: 1 });
  const h = (n: number) => new Date(now.getTime() - n * 3600_000);
  const r = dailyReward(cfg, { lastDailyAt: h(5), dailyStreak: 1 }, now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.nextAt.toISOString(), "2026-11-12T03:00:00.000Z");
  assert.deepEqual(dailyReward(cfg, { lastDailyAt: h(24), dailyStreak: 3 }, now), { ok: true, amount: 130, streak: 4 });
  assert.deepEqual(dailyReward(cfg, { lastDailyAt: h(24), dailyStreak: 30 }, now), { ok: true, amount: 170, streak: 31 }, "Bonus höchstens 7 Tage");
  assert.deepEqual(dailyReward(cfg, { lastDailyAt: h(49), dailyStreak: 30 }, now), { ok: true, amount: 100, streak: 1 }, "Serie gerissen");
});

test("Arbeiten, Zufall und Anzeige", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  assert.equal(workReady(null, 60, now).ok, true);
  assert.equal(workReady(new Date(now.getTime() - 30 * 60_000), 60, now).ok, false);
  assert.equal(workReady(new Date(now.getTime() - 60 * 60_000), 60, now).ok, true);
  assert.equal(randomBetween(20, 60, () => 0), 20);
  assert.equal(randomBetween(20, 60, () => 0.9999), 60);
  assert.equal(randomBetween(60, 20, () => 0), 20);
  assert.equal(formatMoney(12345, "🪙"), "🪙 12.345");
  assert.equal(formatMoney(5, "123456789012345678"), "<:c:123456789012345678> 5");
});
