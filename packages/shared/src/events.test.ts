import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventMessage, mentionList, parseEventCustomId, parseEventStart, rsvpStatus, validateEventTime } from "./events.js";

const now = new Date("2026-11-12T20:00:00Z"); // 21:00 in Berlin

test("Event-Start: deutsche Schreibweisen", () => {
  assert.equal(parseEventStart("24.12.2026 18:00", now)?.toISOString(), "2026-12-24T17:00:00.000Z");
  assert.equal(parseEventStart("24.12. 18:00", now)?.toISOString(), "2026-12-24T17:00:00.000Z");
  assert.equal(parseEventStart("2026-07-01 20:30", now)?.toISOString(), "2026-07-01T18:30:00.000Z", "Sommerzeit");
  assert.equal(parseEventStart("morgen 19:30", now)?.toISOString(), "2026-11-13T18:30:00.000Z");
  assert.equal(parseEventStart("heute 22 Uhr", now)?.toISOString(), "2026-11-12T21:00:00.000Z");
  assert.equal(parseEventStart("in 2h", now)?.toISOString(), "2026-11-12T22:00:00.000Z");
  assert.equal(parseEventStart("in 3 Tagen", now)?.toISOString(), "2026-11-15T20:00:00.000Z");
  assert.equal(parseEventStart("1.3. 10:00", now)?.toISOString(), "2027-03-01T09:00:00.000Z", "ohne Jahr: nächstes Vorkommen");
  for (const bad of ["", "irgendwann", "31.02.2027 10:00", "24.12.2026", "morgen", "25:00", "in bald"]) assert.equal(parseEventStart(bad, now), null, bad);
});

test("Event-Zeit prüfen", () => {
  assert.equal(validateEventTime(new Date(now.getTime() + 3_600_000), 120, now), null);
  assert.match(validateEventTime(new Date(now.getTime() - 1), 120, now)!, /Zukunft/);
  assert.match(validateEventTime(new Date(now.getTime() + 400 * 86_400_000), 120, now)!, /Jahr/);
  assert.match(validateEventTime(new Date(now.getTime() + 3_600_000), 2, now)!, /Dauer/);
});

test("Zusagen: Warteliste bei vollen Events", () => {
  assert.equal(rsvpStatus("yes", 2, 3), "yes");
  assert.equal(rsvpStatus("yes", 3, 3), "waitlist");
  assert.equal(rsvpStatus("yes", 500, 0), "yes", "0 = unbegrenzt");
  assert.equal(rsvpStatus("maybe", 3, 3), "maybe");
  assert.deepEqual(parseEventCustomId("lmev:12:maybe"), { id: 12, choice: "maybe" });
  assert.equal(parseEventCustomId("lmev:12:waitlist"), null);
});

test("Event-Nachricht", () => {
  const ids = Array.from({ length: 80 }, (_, i) => String(100000000000000000n + BigInt(i)));
  const list = mentionList(ids);
  assert.ok(list.length <= 1024);
  assert.match(list, /und \d+ weitere$/);
  const msg = buildEventMessage(
    { id: 3, title: "Spieleabend", description: "Wir zocken", location: "Voice 1", startsAt: new Date("2026-11-20T18:00:00Z"), endsAt: new Date("2026-11-20T20:00:00Z"), slots: 2, hostId: "1", roleId: null, remindMinutes: 30, state: "open" },
    { yes: ["5", "6"], maybe: [], no: ["7"], waitlist: ["8"] },
  );
  assert.equal(msg.embeds[0]!.fields[0]!.name, "✅ Zusagen (2/2)");
  assert.equal(msg.embeds[0]!.fields.length, 4);
  assert.match(msg.embeds[0]!.description, /<t:1795197600:F>/);
  assert.equal(msg.components[0]!.components[0]!.custom_id, "lmev:3:yes");
  const done = buildEventMessage({ ...{ id: 3, title: "x", description: "", location: "", startsAt: new Date(), endsAt: new Date(), slots: 0, hostId: "1", roleId: null, remindMinutes: 0 }, state: "cancelled" }, { yes: [], maybe: [], no: [], waitlist: [] });
  assert.ok(done.components[0]!.components.every((b) => b.disabled));
  assert.match(done.embeds[0]!.description, /Abgesagt/);
});
