import { test } from "node:test";
import assert from "node:assert/strict";
import { isAutoUpdateHours, isNewerVersion, parseRelease, parseVersion } from "./updates.js";

test("parseVersion", () => {
  assert.deepEqual(parseVersion("v0.19.0"), [0, 19, 0]);
  assert.deepEqual(parseVersion("1.2"), [1, 2, 0]);
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion("1.2.3-beta"), null);
});

test("isNewerVersion", () => {
  assert.equal(isNewerVersion("0.20.0", "0.19.0"), true);
  assert.equal(isNewerVersion("v0.19.1", "0.19.0"), true);
  assert.equal(isNewerVersion("1.0.0", "0.99.9"), true);
  assert.equal(isNewerVersion("0.19.0", "0.19.0"), false);
  assert.equal(isNewerVersion("0.9.0", "0.19.0"), false);
  assert.equal(isNewerVersion("", "0.19.0"), false);
  assert.equal(isNewerVersion("0.20.0", ""), false);
});

test("parseRelease", () => {
  assert.deepEqual(
    parseRelease({ tag_name: "v0.20.0", html_url: "https://github.com/libremod-bot/libremod/releases/tag/v0.20.0" }),
    { version: "0.20.0", url: "https://github.com/libremod-bot/libremod/releases/tag/v0.20.0" },
  );
  assert.equal(parseRelease({ tag_name: "v0.21.0", prerelease: true }), null);
  assert.equal(parseRelease({ tag_name: "nightly" }), null);
  assert.deepEqual(parseRelease({ tag_name: "0.20", html_url: "https://evil.example/x" }), { version: "0.20.0", url: "" });
  assert.equal(parseRelease(null), null);
});

test("isAutoUpdateHours", () => {
  assert.equal(isAutoUpdateHours(24), true);
  assert.equal(isAutoUpdateHours(0), true);
  assert.equal(isAutoUpdateHours(12), false);
});
