import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyVote, buildSuggestionMessage, countReaction, extendExpiry, judgeCount, parseCount, parseSuggestionCustomId, suggestionCustomId, voteBar,
} from "./community2.js";

test("Abstimmen", () => {
  assert.deepEqual(applyVote(null, 1), { next: 1, up: 1, down: 0 });
  assert.deepEqual(applyVote(1, 1), { next: null, up: -1, down: 0 });
  assert.deepEqual(applyVote(1, -1), { next: -1, up: -1, down: 1 });
  assert.deepEqual(applyVote(-1, -1), { next: null, up: 0, down: -1 });
  assert.equal(voteBar(0, 0), "Noch keine Stimmen");
  assert.equal(voteBar(3, 1), "████████░░ 75 % dafür");
  assert.deepEqual(parseSuggestionCustomId(suggestionCustomId("down", 9)), { action: "down", id: 9 });
  assert.equal(parseSuggestionCustomId("lmsg:x:1"), null);
});

test("Vorschlag-Nachricht", () => {
  const base = { id: 1, number: 7, authorId: "42", authorName: "Anna", text: "Mehr Emojis", status: "open" as const, statusReason: null, statusBy: null, up: 2, down: 1, createdAt: new Date(0) };
  const m = buildSuggestionMessage(base, false);
  assert.equal(m.embeds[0]!.title, "Vorschlag #7");
  assert.equal(m.embeds[0]!.author.name, "Anna");
  assert.equal(m.embeds[0]!.fields.length, 1);
  assert.equal(m.components[0]!.components[0]!.label, "2");
  const a = buildSuggestionMessage({ ...base, status: "accepted", statusReason: "Gute Idee", statusBy: "9" }, true);
  assert.equal(a.embeds[0]!.author.name, "Anonymer Vorschlag");
  assert.doesNotMatch(a.embeds[0]!.footer.text, /42/);
  assert.match(a.embeds[0]!.fields[1]!.value, /Gute Idee von <@9>/);
  assert.equal(a.components[0]!.components[0]!.disabled, true);
});

test("Ablaufdatum verlängern", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(extendExpiry(null, 86400, now).toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(extendExpiry(new Date("2026-01-05T00:00:00Z"), 86400, now).toISOString(), "2026-01-06T00:00:00.000Z");
  assert.equal(extendExpiry(new Date("2025-12-01T00:00:00Z"), 86400, now).toISOString(), "2026-01-02T00:00:00.000Z");
});

test("Zählen", () => {
  assert.equal(parseCount("42"), 42);
  assert.equal(parseCount("  43 juhu"), 43);
  assert.equal(parseCount("1.000"), 1000);
  assert.equal(parseCount("hallo 5"), null);
  assert.equal(parseCount("12345678901"), null);
  const s = { current: 5, lastUserId: "a", allowSameUser: false };
  assert.equal(judgeCount(s, "b", 6), "ok");
  assert.equal(judgeCount(s, "a", 6), "twice");
  assert.equal(judgeCount({ ...s, allowSameUser: true }, "a", 6), "ok");
  assert.equal(judgeCount(s, "b", 8), "wrong");
  assert.equal(judgeCount(s, "b", 5), "late");
  assert.equal(judgeCount(s, "a", 5), "late");
  assert.equal(judgeCount({ current: 0, lastUserId: null, allowSameUser: false }, "a", 0), "wrong");
  assert.equal(countReaction(100), "💯");
  assert.equal(countReaction(2000), "🏆");
  assert.equal(countReaction(7), "✅");
});
