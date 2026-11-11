import { test } from "node:test";
import assert from "node:assert/strict";
import { berlinParts, describeSchedule, nextRun, parseTimeOfDay } from "./schedule.js";
import { pickResponse, renderCounter, splitResponses } from "./community.js";

test("tägliche Termine in Berliner Zeit, Sommer und Winter", () => {
  // Winterzeit: 18:00 Berlin = 17:00 UTC
  assert.equal(nextRun({ kind: "daily", timeOfDay: "18:00" }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-11T17:00:00.000Z");
  // schon vorbei -> morgen
  assert.equal(nextRun({ kind: "daily", timeOfDay: "08:30" }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-12T07:30:00.000Z");
  // Sommerzeit: 18:00 Berlin = 16:00 UTC
  assert.equal(nextRun({ kind: "daily", timeOfDay: "18:00" }, new Date("2026-07-01T10:00:00Z")).toISOString(), "2026-07-01T16:00:00.000Z");
  // Zeitumstellung 29.03.2026: 03:00 lokal gibt es, 02:30 nicht -> Ergebnis bleibt plausibel (nach after)
  const t = nextRun({ kind: "daily", timeOfDay: "03:00" }, new Date("2026-03-28T23:00:00Z"));
  assert.equal(t.toISOString(), "2026-03-29T01:00:00.000Z");
  // genau zur Zeit -> nächster Tag
  assert.equal(nextRun({ kind: "daily", timeOfDay: "18:00" }, new Date("2026-11-11T17:00:00Z")).toISOString(), "2026-11-12T17:00:00.000Z");
});

test("wöchentliche Termine", () => {
  // 11.11.2026 ist ein Mittwoch
  assert.equal(berlinParts(new Date("2026-11-11T10:00:00Z")).weekday, 3);
  assert.equal(nextRun({ kind: "weekly", timeOfDay: "20:00", weekday: 5 }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-13T19:00:00.000Z");
  assert.equal(nextRun({ kind: "weekly", timeOfDay: "09:00", weekday: 3 }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-18T08:00:00.000Z");
});

test("Intervall und Beschreibung", () => {
  assert.equal(nextRun({ kind: "interval", intervalMinutes: 90 }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-11T11:30:00.000Z");
  assert.equal(nextRun({ kind: "interval", intervalMinutes: 1 }, new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-11T10:10:00.000Z");
  assert.equal(describeSchedule({ kind: "interval", intervalMinutes: 120 }), "alle 2 Stunden");
  assert.equal(describeSchedule({ kind: "weekly", timeOfDay: "20:00", weekday: 5 }), "jeden Freitag um 20:00 Uhr");
  assert.deepEqual(parseTimeOfDay("7:05"), { hour: 7, minute: 5 });
  assert.equal(parseTimeOfDay("24:00"), null);
});

test("Antworten trennen und auswählen", () => {
  assert.deepEqual(splitResponses("Hallo!\n---\nServus!\n  ---  \n\n---\nMoin"), ["Hallo!", "Servus!", "Moin"]);
  assert.deepEqual(splitResponses("a---b"), ["a---b"]);
  assert.deepEqual(splitResponses("eins\r\nzwei\r\n---\r\ndrei"), ["eins\nzwei", "drei"]);
  assert.equal(pickResponse(["a", "b", "c"], () => 0.99), "c");
});

test("Zähler-Namen", () => {
  assert.equal(renderCounter("👥 Mitglieder: {members}", { members: 1234, boosts: 2, channels: 10, roles: 5 }), "👥 Mitglieder: 1.234");
  assert.equal(renderCounter("{BOOSTS} Boosts", { members: 0, boosts: 7, channels: 0, roles: 0 }), "7 Boosts");
});
