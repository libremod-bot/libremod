import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountOldEnoughAt, answerMatches, AttemptLimiter, buildVerificationMessage, codeMatches, generateCode, lockOptions,
  parseAnswers, restoreOptions, snapshotOverwrite,
} from "./protection.js";

test("Codes", () => {
  const c = generateCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(codeMatches(" k7p 2xm ", "K7P2XM"), true);
  assert.equal(codeMatches("K7P2XN", "K7P2XM"), false);
});

test("Antworten", () => {
  const answers = parseAnswers("Pinguin\n| pinguin |Eisbär\n\n");
  assert.deepEqual(answers, ["Pinguin", "Eisbär"]);
  assert.equal(answerMatches("  PINGUIN! ", answers), true);
  assert.equal(answerMatches("„Eisbär“", answers), true);
  assert.equal(answerMatches("Pinguine", answers), false);
  assert.equal(answerMatches("   ", answers), false);
  assert.equal(parseAnswers(Array.from({ length: 20 }, (_, i) => `a${i}`).join("\n")).length, 10);
});

test("Kontoalter", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  assert.equal(accountOldEnoughAt(new Date("2026-11-10T12:00:00Z"), 0, now), null);
  assert.equal(accountOldEnoughAt(new Date("2026-11-01T12:00:00Z"), 7, now), null);
  assert.equal(accountOldEnoughAt(new Date("2026-11-10T12:00:00Z"), 7, now)!.toISOString(), "2026-11-17T12:00:00.000Z");
});

test("Fehlversuche", () => {
  const l = new AttemptLimiter(3, 1000);
  assert.equal(l.waitMs("a", 0), 0);
  l.fail("a", 0); l.fail("a", 100); assert.equal(l.waitMs("a", 200), 0);
  l.fail("a", 200);
  assert.equal(l.waitMs("a", 300), 700);
  assert.equal(l.waitMs("a", 1001), 0, "ältester Fehler ist abgelaufen");
  l.reset("a");
  assert.equal(l.waitMs("a", 1001), 0);
});

test("Nachricht", () => {
  const m = buildVerificationMessage({ title: "", description: "", mode: "code" });
  assert.match(m.embeds[0]!.description, /Code/);
  assert.equal(m.components[0]!.components[0]!.custom_id, "lmvf:start");
});

test("Sperren und wiederherstellen", () => {
  const allow = 1n << 11n; // SendMessages ausdrücklich erlaubt
  const deny = 1n << 6n; // Reaktionen schon verboten
  const prev = snapshotOverwrite(allow, deny);
  assert.equal(prev.SendMessages, "allow");
  assert.equal(prev.AddReactions, "deny");
  assert.equal(prev.CreatePublicThreads, "neutral");
  assert.equal(lockOptions().SendMessages, false);
  const r = restoreOptions(prev);
  assert.deepEqual(r, { SendMessages: true, SendMessagesInThreads: null, CreatePublicThreads: null, CreatePrivateThreads: null, AddReactions: false });
});
