import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, score, type SearchEntry } from "./search";

const entry = (title: string, keywords: string): SearchEntry => ({ title, hint: "", href: "/", haystack: normalize(`${title} ${keywords}`) });
const level = entry("Level", "xp rang rank leaderboard");
const backup = entry("Export & Import", "sicherung backup json");
const welcome = entry("Begrüßung", "willkommen welcome");

test("normalize vereinfacht Umlaute und Groß-/Kleinschreibung", () => {
  assert.equal(normalize("Begrüßung ÄÖÜ"), "begrussung aou");
});

test("Umlaute lassen sich ohne Punkte tippen", () => {
  assert.ok(score(welcome, "begru") > 0);
  assert.ok(score(welcome, "Begrü") > 0);
});

test("ganzes Stichwort schlägt Wortteil im Titel", () => {
  assert.ok(score(level, "xp") > score(backup, "xp"));
});

test("Titelanfang zählt am meisten", () => {
  assert.ok(score(level, "lev") > score(entry("Statistik", "level aktivitat"), "lev"));
});

test("alle Wörter müssen passen", () => {
  assert.equal(score(level, "xp pizza"), 0);
  assert.ok(score(level, "xp rang") > 0);
});

test("leere Suche zeigt alles", () => {
  assert.equal(score(level, "  "), 1);
});

test("Sonderzeichen in der Suche brechen nichts", () => {
  assert.equal(score(level, "(["), 0);
});
