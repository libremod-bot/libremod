import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetupAnswers, planSetup, PRESET_INFO, PRESETS, PROTECTION_LEVELS, type SetupAnswers } from "./presets";

const base: SetupAnswers = {
  preset: "community",
  protection: "normal",
  modules: ["welcome", "levels"],
  modLogChannelId: "100000000000000001",
  logChannelId: "100000000000000002",
  welcomeChannelId: "100000000000000003",
  suggestionChannelId: null,
};

test("jede Vorlage hat eine gültige Empfehlung", () => {
  for (const p of PRESETS) assert.ok(PROTECTION_LEVELS.includes(PRESET_INFO[p].protection));
});

test("Anti-Phishing ist auf jeder Stufe an", () => {
  for (const protection of PROTECTION_LEVELS) {
    const plan = planSetup({ ...base, protection });
    assert.ok(plan.rules.find((r) => r.filter === "phishing")?.enabled, protection);
    assert.equal(plan.guild.automodEnabled, true);
  }
});

test("streng ist strenger als entspannt", () => {
  const relaxed = planSetup({ ...base, protection: "relaxed" });
  const strict = planSetup({ ...base, protection: "strict" });
  const enabled = (p: typeof relaxed) => p.rules.filter((r) => r.enabled).length;
  assert.ok(enabled(strict) > enabled(relaxed));
  assert.ok(strict.escalations[0]!.warnCount < relaxed.escalations[0]!.warnCount);
  assert.equal(relaxed.guild.raidEnabled, false);
  assert.equal(strict.guild.raidEnabled, true);
  assert.ok(strict.rules.find((r) => r.filter === "links")?.allowedDomains?.includes("youtube.com"));
});

test("Verwarnungsstufen sind aufsteigend und eindeutig", () => {
  for (const protection of PROTECTION_LEVELS) {
    const counts = planSetup({ ...base, protection }).escalations.map((e) => e.warnCount);
    assert.deepEqual(counts, [...new Set(counts)].sort((a, b) => a - b));
  }
});

test("ohne Log-Kanal keine Log-Arten, ohne Kanal keine Begrüßung", () => {
  const plan = planSetup({ ...base, logChannelId: null, welcomeChannelId: null });
  assert.deepEqual(plan.logCategories, []);
  assert.equal(plan.welcome, null);
});

test("Sprachkanal-Log nur bei Gaming und Freunden", () => {
  assert.ok(!planSetup(base).logCategories.includes("voice"));
  assert.ok(planSetup({ ...base, preset: "gaming" }).logCategories.includes("voice"));
});

test("Module folgen der Auswahl", () => {
  const plan = planSetup({ ...base, modules: ["economy"] });
  assert.equal(plan.economy, true);
  assert.equal(plan.levels, false);
  assert.equal(plan.welcome, null);
});

test("Vorschläge nur mit eigenem Kanal, Geburtstage im Begrüßungskanal", () => {
  const plan = planSetup({ ...base, modules: ["suggestions", "birthdays"] });
  assert.equal(plan.suggestions, null);
  assert.deepEqual(plan.birthdays, { channelId: base.welcomeChannelId });
  assert.deepEqual(planSetup({ ...base, modules: ["suggestions"], suggestionChannelId: "100000000000000004" }).suggestions, { channelId: "100000000000000004" });
});

test("Formular prüfen", () => {
  const form = new Map<string, string[]>([
    ["preset", ["gaming"]],
    ["protection", ["strict"]],
    ["modules", ["levels", "hack", "economy"]],
    ["modLogChannelId", ["100000000000000001"]],
    ["logChannelId", ["kein-kanal"]],
  ]);
  const get = (k: string) => form.get(k)?.[0] ?? "";
  const getAll = (k: string) => form.get(k) ?? [];
  assert.deepEqual(parseSetupAnswers(get, getAll), {
    preset: "gaming",
    protection: "strict",
    modules: ["levels", "economy"],
    modLogChannelId: "100000000000000001",
    logChannelId: null,
    welcomeChannelId: null,
    suggestionChannelId: null,
  });
  form.set("preset", ["unbekannt"]);
  assert.equal(parseSetupAnswers(get, getAll), null);
});
