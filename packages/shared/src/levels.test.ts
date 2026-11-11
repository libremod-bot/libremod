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
