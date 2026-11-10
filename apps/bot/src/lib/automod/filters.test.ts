import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCaps,
  checkInvites,
  checkLinks,
  checkMentions,
  checkWords,
  compileWordList,
  JoinTracker,
  normalizeText,
  SpamTracker,
} from "./filters.js";

test("Einladungslinks werden erkannt", () => {
  assert.ok(checkInvites("komm auf discord.gg/abc123"));
  assert.ok(checkInvites("https://discord.com/invite/xyz"));
  assert.ok(checkInvites("https://discordapp.com/invite/xyz"));
  assert.equal(checkInvites("discord.com ist toll"), null);
});

test("Links: erlaubte Domains inklusive Subdomains", () => {
  const allowed = ["youtube.com", "libremod.dev"];
  assert.equal(checkLinks("schau https://www.youtube.com/watch?v=1", allowed), null);
  assert.equal(checkLinks("https://libremod.dev", allowed), null);
  assert.match(checkLinks("https://evil.com/x", allowed)!, /evil\.com/);
  assert.match(checkLinks("https://youtube.com.evil.com", allowed)!, /evil\.com/);
  assert.equal(checkLinks("kein link hier", allowed), null);
  assert.ok(checkLinks("http://example.org"));
});

test("Großbuchstaben erst ab Mindestlänge und Schwelle", () => {
  assert.equal(checkCaps("HALLO"), null);
  assert.ok(checkCaps("HALLO ALLE ZUSAMMEN"));
  assert.equal(checkCaps("Hallo alle zusammen, wie geht's?"), null);
  assert.equal(checkCaps("ÄÖÜ ÄÖÜ ÄÖÜ äöü", 80), null);
  assert.ok(checkCaps("ÄÖÜ ÄÖÜ ÄÖÜ ÄÖÜ", 80));
});

test("Erwähnungen", () => {
  assert.equal(checkMentions(2, false), null);
  assert.ok(checkMentions(5, false));
  assert.ok(checkMentions(0, true));
  assert.equal(checkMentions(5, false, 10), null);
});

test("Wortliste mit Ersatzzeichen, Wortgrenzen und Platzhalter", () => {
  const list = compileWordList(["idiot*", "doof"]);
  assert.ok(checkWords("du IDIOT", list));
  assert.ok(checkWords("ihr 1d10ten", list));
  assert.ok(checkWords("so dooooof", list));
  assert.ok(checkWords("Das ist dööf", compileWordList(["doof"])));
  assert.equal(checkWords("Idiotie ist ein Wort", compileWordList(["idiot"])), null);
  assert.equal(checkWords("schadoof", list), null);
  assert.equal(checkWords("alles gut", list), null);
  assert.equal(compileWordList([" ", ""]), null);
});

test("normalizeText", () => {
  assert.equal(normalizeText("H3LL0 Wöööörld"), "hello woorld");
});

test("Spam: zu viele Nachrichten und Wiederholungen", () => {
  const t = new SpamTracker();
  const start = 1_000_000;
  for (let i = 0; i < 4; i++) assert.equal(t.check("u", `msg ${i}`, 5, start + i * 100), null);
  assert.ok(t.check("u", "msg 5", 5, start + 500));

  const d = new SpamTracker();
  assert.equal(d.check("u", "kauf das", 5, start), null);
  assert.equal(d.check("u", "kauf das", 5, start + 10_000), null);
  assert.ok(d.check("u", "KAUF DAS", 5, start + 20_000));

  d.sweep(start + 100_000);
  assert.equal(d.size, 0);
});

test("Raid: viele Beitritte im Zeitfenster", () => {
  const j = new JoinTracker();
  const start = 0;
  for (let i = 0; i < 4; i++) assert.equal(j.record("g", 5, 10, start + i * 1000), false);
  assert.equal(j.record("g", 5, 10, start + 4000), true);
  assert.equal(j.record("g", 5, 10, start + 60_000), false);
});
