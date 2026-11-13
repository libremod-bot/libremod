import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDiscordRule, cleanKeywords, discordRuleKind } from "./discordautomod";

test("Discord-AutoMod: Vorlagen haben Blockieren und optional Meldung", () => {
  const r = buildDiscordRule("preset", { alertChannelId: "100000000000000001" });
  assert.equal(r.trigger_type, 4);
  assert.deepEqual(r.trigger_metadata, { presets: [1, 2, 3] });
  assert.deepEqual(r.actions.map((a) => a.type), [1, 2]);
  assert.deepEqual(buildDiscordRule("spam").actions.map((a) => a.type), [1]);
});

test("Discord-AutoMod: Erwähnungs-Grenze wird begrenzt", () => {
  assert.equal(buildDiscordRule("mentions", { mentionLimit: 1 }).trigger_metadata?.mention_total_limit, 3);
  assert.equal(buildDiscordRule("mentions", { mentionLimit: 500 }).trigger_metadata?.mention_total_limit, 50);
});

test("Discord-AutoMod: Wortliste wird aufgeräumt", () => {
  assert.deepEqual(cleanKeywords([" Foo ", "foo", "", "x".repeat(61), "bar*"]), ["foo", "bar*"]);
  assert.deepEqual(buildDiscordRule("keyword", { keywords: ["A"] }).trigger_metadata, { keyword_filter: ["a"] });
  assert.equal(discordRuleKind(6), "profile");
});
