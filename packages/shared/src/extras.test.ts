import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeWord, lastLetter, parseWord, voiceRolesFor, firstLetter } from "./extras.js";

test("Wortkette", () => {
  assert.equal(parseWord(" Apfel "), "apfel");
  assert.equal(parseWord("zwei Wörter"), null);
  assert.equal(parseWord("a"), null);
  assert.equal(parseWord("123"), null);
  assert.equal(parseWord("Baden-Württemberg"), "baden-württemberg");
  assert.equal(lastLetter("fuß"), "s");
  assert.equal(firstLetter("ärger"), "a");
  assert.equal(lastLetter("café"), "e");
  const s = { lastWord: "apfel", lastUserId: "a", allowSameUser: false };
  assert.equal(judgeWord(s, "b", "lampe", false), "ok");
  assert.equal(judgeWord(s, "b", "birne", false), "letter");
  assert.equal(judgeWord(s, "a", "lampe", false), "twice");
  assert.equal(judgeWord(s, "b", "lampe", true), "used");
  assert.equal(judgeWord({ lastWord: null, lastUserId: null, allowSameUser: false }, "a", "xylophon", false), "ok");
});

test("Sprachkanal-Rollen", () => {
  const rows = [{ channelId: "*", roleId: "r1" }, { channelId: "c1", roleId: "r2" }];
  assert.deepEqual([...voiceRolesFor(rows, "c1")].sort(), ["r1", "r2"]);
  assert.deepEqual([...voiceRolesFor(rows, "c2")], ["r1"]);
  assert.equal(voiceRolesFor(rows, null).size, 0);
});
