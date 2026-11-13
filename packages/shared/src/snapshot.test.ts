import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots, stillAsAfter } from "./snapshot";

test("ohne Änderung gibt es nichts rückgängig zu machen", () => {
  const s = { economySettings: [{ enabled: true }] };
  assert.equal(diffSnapshots(s, structuredClone(s)), null);
  assert.equal(diffSnapshots(null, s), null);
});

test("Reihenfolge der Felder spielt keine Rolle", () => {
  assert.equal(diffSnapshots({ x: [{ a: 1, b: 2 }] }, { x: [{ b: 2, a: 1 }] }), null);
});

test("guildSettings: nur die geänderten Spalten", () => {
  const before = { guildSettings: [{ automodEnabled: false, dmOnAction: true, locale: "de" }], automodRules: [] };
  const after = { guildSettings: [{ automodEnabled: true, dmOnAction: true, locale: "de" }], automodRules: [] };
  assert.deepEqual(diffSnapshots(before, after), {
    before: { guildSettings: [{ automodEnabled: false }] },
    after: { guildSettings: [{ automodEnabled: true }] },
  });
});

test("andere Tabellen: ganze Tabelle", () => {
  const before = { shopItems: [{ id: 1, name: "A" }] };
  const after = { shopItems: [{ id: 1, name: "A" }, { id: 2, name: "B" }] };
  assert.deepEqual(diffSnapshots(before, after), { before, after });
});

test("stillAsAfter erkennt spätere Änderungen", () => {
  const after = { guildSettings: [{ automodEnabled: true }], shopItems: [{ id: 1 }] };
  // andere guildSettings-Spalten dürfen sich geändert haben
  assert.ok(stillAsAfter({ guildSettings: [{ automodEnabled: true, locale: "en" }], shopItems: [{ id: 1 }] }, after));
  assert.ok(!stillAsAfter({ guildSettings: [{ automodEnabled: false }], shopItems: [{ id: 1 }] }, after));
  assert.ok(!stillAsAfter({ guildSettings: [{ automodEnabled: true }], shopItems: [{ id: 1 }, { id: 2 }] }, after));
});
