import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageOn, birthdayKeysOn, buildGiveawayMessage, celebrationDay, giveawayCustomId, giveawayResultText, localDate, nextBirthday,
  parseGiveawayCustomId, parsePollOptions, pickWinners, renderBirthdayMessage, validateBirthday,
} from "./fun.js";

test("Gewinner ziehen", () => {
  const seq = [0.99, 0, 0.5];
  let i = 0;
  const rnd = () => seq[i++ % seq.length]!;
  const w = pickWinners(["a", "b", "c", "d", "a"], 2, rnd);
  assert.equal(w.length, 2);
  assert.equal(new Set(w).size, 2);
  assert.deepEqual(pickWinners(["a"], 3), ["a"]);
  assert.deepEqual(pickWinners([], 1), []);
  assert.deepEqual(pickWinners(["a", "b"], 2, Math.random, ["a"]), ["b"]);
  // Alle Kombinationen kommen vor
  const seen = new Set<string>();
  for (let k = 0; k < 500; k++) seen.add(pickWinners(["a", "b", "c"], 1)[0]!);
  assert.equal(seen.size, 3);
});

test("Gewinnspiel-IDs und Nachricht", () => {
  assert.deepEqual(parseGiveawayCustomId(giveawayCustomId(42)), { action: "join", id: 42 });
  assert.deepEqual(parseGiveawayCustomId(giveawayCustomId(3, "leave")), { action: "leave", id: 3 });
  assert.equal(parseGiveawayCustomId("lmgw:join:abc"), null);
  assert.equal(parseGiveawayCustomId("lmtk:open:1"), null);
  const g = { id: 7, prize: "Nitro", description: "", winners: 2, hostId: "1", requiredRoleId: "5", minLevel: 3, endsAt: new Date("2026-12-01T00:00:00Z"), ended: false, winnerIds: [] };
  const m = buildGiveawayMessage(g, 1);
  assert.match(m.embeds[0]!.description, /2 Gewinner/);
  assert.match(m.embeds[0]!.description, /<@&5> und mindestens Level 3/);
  assert.equal(m.embeds[0]!.footer.text, "1 Teilnahme · Gewinnspiel #7");
  assert.equal(m.components[0]!.components[0]!.disabled, false);
  const e = buildGiveawayMessage({ ...g, ended: true, winnerIds: ["8"] }, 4);
  assert.match(e.embeds[0]!.description, /Gewinner: <@8>/);
  assert.equal(e.components[0]!.components[0]!.disabled, true);
  assert.match(giveawayResultText("X", ["1"]), /Du hast/);
  assert.match(giveawayResultText("X", ["1", "2"]), /Ihr habt/);
  assert.match(giveawayResultText("X", []), /keine gültigen/);
});

test("Umfrage-Antworten", () => {
  assert.deepEqual(parsePollOptions("Pizza; Pasta ;pizza;\nSalat"), { ok: true, options: ["Pizza", "Pasta", "Salat"] });
  assert.equal(parsePollOptions("nur eine").ok, false);
  assert.equal(parsePollOptions(Array.from({ length: 11 }, (_, i) => `a${i}`).join(";")).ok, false);
  assert.equal(parsePollOptions(`kurz;${"x".repeat(56)}`).ok, false);
});

test("Geburtstage", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  assert.equal(validateBirthday(29, 2, null, now), null);
  assert.match(validateBirthday(29, 2, 2023, now)!, /gibt es 2023 nicht/);
  assert.equal(validateBirthday(29, 2, 2024, now), null);
  assert.match(validateBirthday(31, 4, null, now)!, /gibt es/);
  assert.match(validateBirthday(1, 13, null, now)!, /Monat/);
  assert.match(validateBirthday(12, 11, 2026, now)!, /Zukunft/);
  assert.match(validateBirthday(1, 1, 1800, now)!, /Geburtsjahr/);
  assert.deepEqual(celebrationDay(2, 29, 2027), { month: 2, day: 28 });
  assert.deepEqual(celebrationDay(2, 29, 2028), { month: 2, day: 29 });
  assert.deepEqual(birthdayKeysOn({ year: 2027, month: 2, day: 28 }), [{ month: 2, day: 28 }, { month: 2, day: 29 }]);
  assert.deepEqual(birthdayKeysOn({ year: 2028, month: 2, day: 28 }), [{ month: 2, day: 28 }]);
  assert.deepEqual(nextBirthday({ month: 11, day: 11 }, { year: 2026, month: 11, day: 11 }), { year: 2026, month: 11, day: 11, inDays: 0 });
  assert.deepEqual(nextBirthday({ month: 1, day: 2 }, { year: 2026, month: 11, day: 11 }), { year: 2027, month: 1, day: 2, inDays: 52 });
  assert.deepEqual(nextBirthday({ month: 2, day: 29 }, { year: 2026, month: 11, day: 11 }).day, 28);
  assert.equal(ageOn(2000, 2026), 26);
  assert.equal(ageOn(null, 2026), null);
  // Berlin ist abends schon einen Tag weiter
  assert.equal(localDate(new Date("2026-11-11T23:30:00Z")).iso, "2026-11-12");
  assert.equal(localDate(new Date("2026-07-01T05:00:00Z")).hour, 7);
  assert.equal(renderBirthdayMessage("{user} wird {age} auf {server}", { userId: "1", name: "Ann", age: 30, server: "S" }), "<@1> wird 30 auf S");
});
