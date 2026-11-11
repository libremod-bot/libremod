import { test } from "node:test";
import assert from "node:assert/strict";
import { levelForXp, levelProgress, progressBar, randomXp, rewardRoles, totalXpForLevel, xpToNext } from "./levels.js";

test("Level-Kurve passt zu den Schritten", () => {
  assert.equal(totalXpForLevel(0), 0);
  assert.equal(totalXpForLevel(1), 100);
  assert.equal(totalXpForLevel(2), 240);
  for (let l = 0; l < 200; l++) assert.equal(totalXpForLevel(l + 1) - totalXpForLevel(l), xpToNext(l));
  assert.equal(totalXpForLevel(10), 2800);
});

test("levelForXp ist an jeder Grenze exakt", () => {
  for (let l = 0; l < 300; l++) {
    const t = totalXpForLevel(l);
    assert.equal(levelForXp(t), l);
    if (t > 0) assert.equal(levelForXp(t - 1), l - 1);
  }
  assert.equal(levelForXp(-5), 0);
});

test("levelProgress und progressBar", () => {
  assert.deepEqual(levelProgress(170), { level: 1, current: 70, needed: 140 });
  assert.equal(progressBar(70, 140, 10), "▰▰▰▰▰▱▱▱▱▱");
  assert.equal(progressBar(500, 140, 4), "▰▰▰▰");
});

test("randomXp bleibt im Bereich", () => {
  assert.equal(randomXp(15, 25, () => 0), 15);
  assert.equal(randomXp(15, 25, () => 0.9999), 25);
  assert.equal(randomXp(25, 15, () => 0), 15);
});

test("rewardRoles: stapeln oder nur die höchste", () => {
  const rewards = [{ level: 5, roleId: "a" }, { level: 10, roleId: "b" }, { level: 20, roleId: "c" }];
  assert.deepEqual(rewardRoles(rewards, 12, true), { keep: ["a", "b"], drop: ["c"] });
  assert.deepEqual(rewardRoles(rewards, 12, false), { keep: ["b"], drop: ["a", "c"] });
  assert.deepEqual(rewardRoles(rewards, 1, true), { keep: [], drop: ["a", "b", "c"] });
});

test("XP-Bonus", async () => {
  const { xpPercent, applyPercent, berlinWeekday, seasonDue, compactNumber } = await import("./levels.js");
  const sat = new Date("2026-11-14T12:00:00Z");
  const mon = new Date("2026-11-16T12:00:00Z");
  assert.equal(berlinWeekday(sat), 6);
  assert.equal(berlinWeekday(new Date("2026-11-15T23:30:00Z")), 1, "Sonntag 23:30 UTC ist in Berlin schon Montag");
  assert.equal(xpPercent({ weekendPercent: 200, rolePercents: [] }, sat), 200);
  assert.equal(xpPercent({ weekendPercent: 200, rolePercents: [] }, mon), 100);
  assert.equal(xpPercent({ weekendPercent: 200, rolePercents: [150, 120] }, sat), 300);
  assert.equal(xpPercent({ weekendPercent: 100, rolePercents: [0] }, mon), 0);
  assert.equal(applyPercent(20, 150), 30);
  assert.equal(seasonDue("off", new Date("2026-01-01"), new Date("2027-01-01")), false);
  assert.equal(seasonDue("monthly", new Date("2026-11-03T10:00:00Z"), new Date("2026-11-30T22:00:00Z")), false);
  assert.equal(seasonDue("monthly", new Date("2026-11-03T10:00:00Z"), new Date("2026-11-30T23:30:00Z")), true, "Berlin ist schon im Dezember");
  assert.equal(seasonDue("quarterly", new Date("2026-10-05T10:00:00Z"), new Date("2026-12-20T10:00:00Z")), false);
  assert.equal(seasonDue("quarterly", new Date("2026-10-05T10:00:00Z"), new Date("2027-01-02T10:00:00Z")), true);
  assert.equal(compactNumber(950), "950");
  assert.equal(compactNumber(1234), "1,2k");
  assert.equal(compactNumber(2000), "2k");
  assert.equal(compactNumber(45_600), "46k");
  assert.equal(compactNumber(3_400_000), "3,4 Mio.");
});
