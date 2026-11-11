import { test } from "node:test";
import assert from "node:assert/strict";
import { emojiMatches, nextSlowmode, parseEmojiInput } from "./channeltools.js";

test("Emoji-Eingabe", () => {
  assert.equal(parseEmojiInput("⭐"), "⭐");
  assert.equal(parseEmojiInput(" 🔥 "), "🔥");
  assert.equal(parseEmojiInput("❤️"), "❤️");
  assert.equal(parseEmojiInput("👍🏽"), "👍🏽");
  assert.equal(parseEmojiInput("👨‍👩‍👧"), "👨‍👩‍👧");
  assert.equal(parseEmojiInput("🇩🇪"), "🇩🇪");
  assert.equal(parseEmojiInput("<:pog:123456789012345678>"), "123456789012345678");
  assert.equal(parseEmojiInput("<a:tanz:123456789012345678>"), "123456789012345678");
  assert.equal(parseEmojiInput("123456789012345678"), "123456789012345678");
  for (const bad of ["", "a", "⭐⭐", "star", "⭐ x", ":star:", "12"]) assert.equal(parseEmojiInput(bad), null, bad);
  assert.ok(emojiMatches("❤️", { id: null, name: "❤" }));
  assert.ok(emojiMatches("⭐", { id: null, name: "⭐" }));
  assert.ok(emojiMatches("123456789012345678", { id: "123456789012345678", name: "pog" }));
  assert.ok(!emojiMatches("⭐", { id: null, name: "🔥" }));
});

test("Langsam-Modus folgt der Aktivität", () => {
  const cfg = { messagesPerMinute: 20, minSeconds: 0, maxSeconds: 30 };
  assert.equal(nextSlowmode(0, 5, cfg), 0);
  assert.equal(nextSlowmode(0, 20, cfg), 5);
  assert.equal(nextSlowmode(0, 45, cfg), 10);
  assert.equal(nextSlowmode(0, 90, cfg), 15);
  assert.equal(nextSlowmode(0, 1000, cfg), 30, "nie über dem Maximum");
  assert.equal(nextSlowmode(30, 0, cfg), 15, "nur eine Stufe runter");
  assert.equal(nextSlowmode(15, 0, cfg), 10);
  assert.equal(nextSlowmode(5, 0, cfg), 0);
  assert.equal(nextSlowmode(0, 0, { ...cfg, minSeconds: 5 }), 5, "Minimum gilt immer");
  assert.equal(nextSlowmode(120, 0, cfg), 30, "vom Hand gesetzten Wert auf das Erlaubte runter");
});
