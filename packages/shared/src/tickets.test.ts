import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicketPanelMessage,
  cleanQuestions,
  ticketDuration,
  formatTranscriptHtml,
  parseTicketCustomId,
  renderTicketText,
  ticketChannelName,
  ticketCustomId,
} from "./tickets.js";

test("Komponenten-IDs", () => {
  assert.equal(ticketCustomId("rate", 12, 5), "lmtk:rate:12:5");
  assert.deepEqual(parseTicketCustomId("lmtk:rate:12:5"), { action: "rate", args: [12, 5] });
  assert.deepEqual(parseTicketCustomId("lmtk:claim:7"), { action: "claim", args: [7] });
  assert.equal(parseTicketCustomId("lmtk:boom:1"), null);
  assert.equal(parseTicketCustomId("lmrole:1:123456789012345678"), null);
  assert.equal(parseTicketCustomId("lmtk:open:1:2:3"), null);
});

test("Kanalnamen", () => {
  assert.equal(ticketChannelName("ticket-{number}", { number: 7, username: "x", category: "y" }), "ticket-0007");
  assert.equal(ticketChannelName("{category} {username}", { number: 7, username: "Max_Müller!!", category: "Support" }), "support-max-müller");
  assert.equal(ticketChannelName("🔥🔥", { number: 3, username: "x", category: "y" }), "ticket-0003");
});

test("Texte und Dauer", () => {
  assert.equal(
    renderTicketText("Hi {user} ({username}) #{number} {category} auf {server}", { userId: "1", username: "anna", server: "S", number: 4, category: "Support" }),
    "Hi <@1> (anna) #4 Support auf S",
  );
  assert.equal(ticketDuration(5 * 60_000), "5 Min.");
  assert.equal(ticketDuration(125 * 60_000), "2 Std. 5 Min.");
  assert.equal(ticketDuration(50 * 3600_000), "2 Tage 2 Std.");
  assert.equal(cleanQuestions([{ label: "  ", placeholder: "", long: false, required: true }, { label: "Wer?", placeholder: "x", long: true, required: false }]).length, 1);
});

test("Panel-Nachricht", () => {
  const cats = [
    { id: 1, name: "Support", emoji: "🛟", description: "Hilfe" },
    { id: 2, name: "Bewerbung", emoji: "123456789012345678", description: "" },
  ];
  const b = buildTicketPanelMessage({ id: 9, title: "Hilfe", description: "", color: 1, style: "buttons" }, cats) as any;
  assert.equal(b.components[0].components[0].custom_id, "lmtk:open:1");
  assert.deepEqual(b.components[0].components[1].emoji, { id: "123456789012345678" });
  const s = buildTicketPanelMessage({ id: 9, title: "Hilfe", description: "x", color: 1, style: "select" }, cats) as any;
  assert.equal(s.components[0].components[0].custom_id, "lmtk:pick:9");
  assert.equal(s.components[0].components[0].options[1].value, "2");
});

test("Transkript ist sicher escaped", () => {
  const html = formatTranscriptHtml(
    { server: "S<b>", number: 1, category: "Support", ownerName: "Anna", openedAt: new Date(0), closedAt: new Date(3600_000), closedByName: "Mod", reason: "<script>", answers: [{ question: "Was?", answer: "<img src=x onerror=alert(1)>" }] },
    [
      { id: "1", authorId: "1", authorName: "<b>Böse</b>", bot: false, content: "hi https://example.org/a?b=1&c=2 <script>alert(1)</script> **fett**", createdAt: new Date(1000), attachments: [{ name: "x.png", url: "javascript:alert(1)", image: true }], embeds: [] },
    ],
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes('<a href="https://example.org/a?b=1&amp;c=2"'));
  assert.ok(html.includes("<strong>fett</strong>"));
  assert.ok(html.includes("&lt;b&gt;Böse&lt;/b&gt;"));
});
