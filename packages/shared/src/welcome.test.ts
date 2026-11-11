import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "./templates.js";
import { buildPanelMessage, panelCustomId, panelRoleChanges, parsePanelCustomId } from "./rolepanel.js";

test("renderTemplate ersetzt Platzhalter, auch in Großschreibung", () => {
  const out = renderTemplate("Hi {user} ({USERNAME}) auf {server}, Nr. {membercount}. {unbekannt}", {
    user: "<@1>",
    username: "anna",
    server: "Testserver",
    membercount: 42,
  });
  assert.equal(out, "Hi <@1> (anna) auf Testserver, Nr. 42. {unbekannt}");
});

const R1 = "100000000000000001", R2 = "100000000000000002", R3 = "100000000000000003";

test("custom_id hin und zurück", () => {
  assert.deepEqual(parsePanelCustomId(panelCustomId(7, R1)), { panelId: 7, roleId: R1 });
  assert.deepEqual(parsePanelCustomId(panelCustomId(7)), { panelId: 7, roleId: undefined });
  assert.equal(parsePanelCustomId("lmrole:x"), null);
  assert.equal(parsePanelCustomId("anders:1"), null);
});

test("Buttons werden in Reihen zu fünft aufgeteilt", () => {
  const roles = Array.from({ length: 7 }, (_, i) => ({ id: `10000000000000000${i}`, name: `Rolle ${i}` }));
  const msg = buildPanelMessage({ id: 3, title: "Farben", description: "", style: "buttons", single: false, roles });
  assert.equal(msg.components.length, 2);
  assert.equal((msg.components[0] as any).components.length, 5);
  assert.equal((msg.components[1] as any).components[1].custom_id, "lmrole:3:100000000000000006");
});

test("Menü erlaubt bei single nur eine Auswahl", () => {
  const msg = buildPanelMessage({ id: 1, title: "x", description: "y", style: "select", single: true, roles: [{ id: R1, name: "A" }, { id: R2, name: "B" }] });
  const menu = (msg.components[0] as any).components[0];
  assert.equal(menu.max_values, 1);
  assert.equal(menu.min_values, 0);
  assert.equal(menu.options.length, 2);
});

test("panelRoleChanges: Klick schaltet um, single ersetzt", () => {
  const panel = [R1, R2, R3];
  assert.deepEqual(panelRoleChanges(panel, [R1], { clicked: R2 }, false), { add: [R2], remove: [] });
  assert.deepEqual(panelRoleChanges(panel, [R1], { clicked: R1 }, false), { add: [], remove: [R1] });
  assert.deepEqual(panelRoleChanges(panel, [R1], { clicked: R2 }, true), { add: [R2], remove: [R1] });
  assert.deepEqual(panelRoleChanges(panel, [], { clicked: "999999999999999999" }, false), { add: [], remove: [] });
});

test("panelRoleChanges: Menü setzt genau die Auswahl, fremde Rollen bleiben", () => {
  const panel = [R1, R2, R3];
  assert.deepEqual(panelRoleChanges(panel, [R1, "500000000000000000"], { selected: [R2, R3] }, false), { add: [R2, R3], remove: [R1] });
  assert.deepEqual(panelRoleChanges(panel, [R1], { selected: [] }, false), { add: [], remove: [R1] });
  assert.deepEqual(panelRoleChanges(panel, [], { selected: [R2, R3] }, true), { add: [R2], remove: [] });
});
