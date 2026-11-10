import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration } from "./duration.js";

test("parseDuration versteht einfache und kombinierte Angaben", () => {
  assert.equal(parseDuration("30s"), 30);
  assert.equal(parseDuration("10m"), 600);
  assert.equal(parseDuration("2h"), 7200);
  assert.equal(parseDuration("1d12h"), 129600);
  assert.equal(parseDuration("1w"), 604800);
  assert.equal(parseDuration(" 1D 2H "), 93600);
});

test("parseDuration lehnt Unsinn ab", () => {
  for (const bad of ["", "abc", "10", "10x", "m10", "0m", "1h-2m"]) {
    assert.equal(parseDuration(bad), null, bad);
  }
});

test("formatDuration gibt die zwei größten Einheiten aus", () => {
  assert.equal(formatDuration(60), "1 Minute");
  assert.equal(formatDuration(93600), "1 Tag 2 Stunden");
  assert.equal(formatDuration(694861), "1 Woche 1 Tag");
});
