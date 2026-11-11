import { test } from "node:test";
import assert from "node:assert/strict";
import { diffIds, formatTranscript, isNewAccount, truncate } from "./logging.js";

test("truncate kürzt und ersetzt leeren Text", () => {
  assert.equal(truncate("hallo", 10), "hallo");
  assert.equal(truncate("hallo welt", 6), "hallo…");
  assert.equal(truncate("hallo welt", 6).length, 6);
  assert.equal(truncate("   ", 10), "(leer)");
  assert.equal(truncate(null, 10, "unbekannt"), "unbekannt");
});

test("diffIds findet hinzugefügte und entfernte Rollen", () => {
  assert.deepEqual(diffIds(["a", "b"], ["b", "c"]), { added: ["c"], removed: ["a"] });
  assert.deepEqual(diffIds([], []), { added: [], removed: [] });
});

test("formatTranscript sortiert nach Zeit und nennt Anhänge", () => {
  const text = formatTranscript([
    { createdAt: new Date("2026-11-11T10:00:05Z"), authorTag: "zwei", authorId: "2", content: "später" },
    { createdAt: new Date("2026-11-11T10:00:00Z"), authorTag: "eins", authorId: "1", content: "", attachments: ["bild.png"] },
  ]);
  const lines = text.split("\n");
  assert.match(lines[0]!, /eins \(1\): \(kein Text\)/);
  assert.match(lines[1]!, /Anhänge: bild\.png/);
  assert.match(lines[2]!, /zwei \(2\): später/);
  assert.match(lines[0]!, /11\.11\.26, 11:00:00/);
});

test("isNewAccount erkennt Konten jünger als 7 Tage", () => {
  const now = Date.parse("2026-11-11T00:00:00Z");
  assert.equal(isNewAccount(new Date("2026-11-08T00:00:00Z"), now), true);
  assert.equal(isNewAccount(new Date("2026-10-01T00:00:00Z"), now), false);
});
