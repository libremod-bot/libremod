import { test } from "node:test";
import assert from "node:assert/strict";
import { NukeTracker, summarizeNuke } from "./antinuke";

test("Anti-Nuke löst erst über der Schwelle aus, einmal pro Fenster", () => {
  const tr = new NukeTracker();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(tr.record("g", "u", "channelDelete", 3, t0 + i), null);
  const hit = tr.record("g", "u", "roleDelete", 3, t0 + 10);
  assert.equal(hit?.length, 4);
  assert.equal(tr.record("g", "u", "ban", 3, t0 + 20), null);
  // Andere Person, anderer Server: eigener Zähler
  assert.equal(tr.record("g", "x", "ban", 3, t0 + 20), null);
  assert.equal(tr.record("h", "u", "ban", 3, t0 + 20), null);
});

test("Anti-Nuke: alte Aktionen fallen aus dem Fenster", () => {
  const tr = new NukeTracker();
  for (let i = 0; i < 3; i++) tr.record("g", "u", "kick", 3, i * 30_000);
  assert.equal(tr.record("g", "u", "kick", 3, 95_000), null);
});

test("Zusammenfassung zählt nach Art", () => {
  assert.deepEqual(summarizeNuke([{ kind: "ban" }, { kind: "channelDelete" }, { kind: "ban" }]), [
    { kind: "channelDelete", n: 1 },
    { kind: "ban", n: 2 },
  ]);
});
