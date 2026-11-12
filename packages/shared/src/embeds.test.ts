import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmbedJson, cleanEmbedDesign } from "./embeds.js";

test("Karten-Gestaltung prüfen", () => {
  assert.deepEqual(cleanEmbedDesign(""), {});
  assert.deepEqual(cleanEmbedDesign(JSON.stringify({ title: "  Hallo ", color: 255, thumbnail: "avatar", fields: [{ name: "", value: "" }, { name: "Regeln", value: "#regeln", inline: true }] })), {
    title: "Hallo",
    color: 255,
    thumbnail: "avatar",
    fields: [{ name: "Regeln", value: "#regeln", inline: true }],
  });
  assert.match(cleanEmbedDesign({ imageUrl: "http://x.de/a.png" }) as string, /https/);
  assert.match(cleanEmbedDesign({ imageUrl: "javascript:alert(1)" }) as string, /https/);
  assert.match(cleanEmbedDesign({ thumbnail: "url" }) as string, /https/);
  assert.match(cleanEmbedDesign({ title: "x".repeat(300) }) as string, /256/);
  assert.match(cleanEmbedDesign({ fields: [{ name: "a" }] }) as string, /Namen und einen Inhalt/);
  assert.match(cleanEmbedDesign({ color: 0x1000000 }) as string, /Farbe/);
  assert.match(cleanEmbedDesign("{kaputt") as string, /gelesen/);
});

test("Embed bauen", () => {
  const render = (s: string) => s.replace("{user}", "<@1>");
  const e = buildEmbedJson({ title: "Hi {user}", footer: "Server", thumbnail: "avatar", timestamp: true }, "Willkommen {user}", { render, avatarUrl: "https://cdn/a.png", now: new Date(0) });
  assert.deepEqual(e, {
    color: 0x4cb4ff,
    description: "Willkommen <@1>",
    title: "Hi <@1>",
    footer: { text: "Server" },
    thumbnail: { url: "https://cdn/a.png" },
    timestamp: "1970-01-01T00:00:00.000Z",
  });
  assert.equal(buildEmbedJson({}, "   ").description, "​");
  assert.deepEqual(buildEmbedJson(null, "x", { defaults: { thumbnail: "avatar", color: 1 }, avatarUrl: "https://a" }).thumbnail, { url: "https://a" });
  assert.equal(buildEmbedJson({ thumbnail: "none" }, "x", { defaults: { thumbnail: "avatar" }, avatarUrl: "https://a" }).thumbnail, undefined);
});
