import { test } from "node:test";
import assert from "node:assert/strict";
import { appealBlocker, checkPhishing, DomainList, parseDomainList, editDistance, impersonates, parseUserIds, phishingReason, skeleton } from "./safety.js";

test("Phishing erkennt Nachahmungen", () => {
  const bad = [
    "https://dlscord.com/gift", "https://discorcl.gift/x", "https://disc0rd-nitro.ru", "https://discord-gift.com/claim",
    "https://steamcommunlty.com/tradeoffer", "https://steamcommunity.com.trade-offer.ru/x", "https://free-nitro.xyz",
    "https://discordapp.co/airdrop", "https://xn--dscord-nitro.ru/gift", "https://rob1ox.com/login", "https://discrod.com",
    "https://diskord.gg/abc",
  ];
  for (const u of bad) assert.ok(checkPhishing(`schau mal ${u}`), u);
});

test("Phishing lässt echte Seiten in Ruhe", () => {
  const good = [
    "https://discord.com/channels/1/2", "https://discord.gg/abc", "https://cdn.discordapp.com/x.png", "https://discord.js.org/docs",
    "https://discordbotlist.com", "https://discords.com/servers", "https://steamcommunity.com/id/x", "https://store.steampowered.com",
    "https://steamdb.info", "https://github.com/discord/discord-api-docs", "https://www.youtube.com/watch?v=1", "https://libremod.xyz",
    "https://discordia.org", "https://record.de", "https://twitch.tv/x", "https://www.twitchtracker.com", "https://www.roblox.com/games",
    "https://discount.de/gift", "https://minecraft.wiki",
  ];
  for (const u of good) assert.equal(checkPhishing(u), null, u);
});

test("Gesperrte Domains", () => {
  assert.match(phishingReason("a.bad.example", "", ["bad.example"])!, /gesperrte/);
  assert.equal(phishingReason("goodbad.example", "", ["bad.example"]), null);
});

test("Namensschutz", () => {
  assert.equal(skeleton("Μichel"), "michei"); // griechisches M wird zu m, l zu i
  assert.equal(editDistance("michel", "mihcel"), 1);
  const team = ["Michel", "Libremod", "Anna"];
  assert.equal(impersonates("Mlchel", team), "Michel");
  assert.equal(impersonates("michel", team), "Michel");
  assert.equal(impersonates("Michael", team), "Michel", "ein Buchstabe mehr");
  assert.equal(impersonates("Libremod Support", team), "Libremod");
  assert.equal(impersonates("L1bremod", team), "Libremod");
  assert.equal(impersonates("Anna", team), "Anna");
  assert.equal(impersonates("Annabell", team), null);
  assert.equal(impersonates("Hannah", team), null);
  assert.equal(impersonates("Michelangelo", team), null);
  assert.equal(impersonates("Jo", ["Jo"]), null, "zu kurz");
});

test("IDs aus Text", () => {
  assert.deepEqual(parseUserIds("<@123456789012345678>, 234567890123456789\n<@!123456789012345678> abc 12"), ["123456789012345678", "234567890123456789"]);
});

test("Einspruch erneut erlaubt?", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  assert.match(appealBlocker([{ status: "open", reviewedAt: null, createdAt: now }], 30, now)!, /schon vor/);
  assert.match(appealBlocker([{ status: "denied", reviewedAt: new Date("2026-11-01T12:00:00Z"), createdAt: now }], 30, now)!, /ab 1\.12\.2026/);
  assert.equal(appealBlocker([{ status: "denied", reviewedAt: new Date("2026-09-01T12:00:00Z"), createdAt: now }], 30, now), null);
  assert.equal(appealBlocker([], 30, now), null);
});

test("Punycode", async () => {
  const { domainToASCII } = await import("node:url");
  const { punycodeDecode, unicodeHost } = await import("./safety.js");
  assert.equal(punycodeDecode("bcher-kva"), "bücher");
  const fake = domainToASCII("dіscord.com"); // kyrillisches і
  assert.match(fake, /^xn--/);
  assert.equal(unicodeHost(fake), "dіscord.com");
  assert.match(checkPhishing(`https://${fake}/gift`)!, /Nachahmung von discord/);
  assert.equal(punycodeDecode("!!!"), null);
});

test("Links ohne https und getarnte Links", async () => {
  const { extractLinks, maskedLinkReason } = await import("./safety.js");
  assert.deepEqual(extractLinks("schau discord-gift.ru/abc und mail@test.de").map((l) => l.host), ["discord-gift.ru"]);
  assert.ok(checkPhishing("hol dir das: dlscord.gift/nitro"));
  assert.equal(checkPhishing("Datei bild.png und version 1.2.3, z.B. das"), null);
  assert.match(maskedLinkReason("[discord.com/nitro](https://evil.example/x)")!, /zeigt „discord.com“/);
  assert.equal(maskedLinkReason("[www.libremod.xyz](https://libremod.xyz/docs)"), null);
  assert.equal(maskedLinkReason("[hier klicken](https://libremod.xyz)"), null);
  assert.ok(checkPhishing("[steamcommunity.com](https://sc-trade.example/x)"));
});

test("Betrugstexte nur mit fremdem Link", () => {
  assert.match(checkPhishing("FREE NITRO for everyone https://nitro-xyz.example/abc")!, /Nitro/i);
  assert.match(checkPhishing("I accidentally reported you, talk to https://support-help.example")!, /Versehen/);
  assert.match(checkPhishing("50$ steam gift for the first 10 users https://store-gifts.example")!, /Betrugsverdacht/);
  assert.equal(checkPhishing("free nitro wäre schon cool"), null, "ohne Link");
  assert.equal(checkPhishing("Free Nitro gibt's hier: https://discord.gift/abc"), null, "echter Geschenk-Link");
  assert.equal(checkPhishing("Wer hat Lust auf das Steam-Geschenk? https://store.steampowered.com/app/1"), null);
});

test("Freigaben und Sperren", () => {
  assert.equal(checkPhishing("https://diskord.gg/abc", { allowed: ["diskord.gg"] }), null);
  assert.match(checkPhishing("https://x.bad.example", { blocked: ["bad.example"] })!, /gesperrte/);
  assert.match(checkPhishing("schau mal", {}, [{ host: "dlscord.com", path: "/" }])!, /Nachahmung/);
});

test("öffentliche Listen: Text, JSON und URLs werden zu reinen Domains", () => {
  const txt = "# Kommentar\nBetrug-Nitro.ru\nhttps://www.fake-gift.xyz/login?x=1\n\ndiscord.com\npages.dev\nbit.ly\nsteamcommunity.com.ru\nkein domain\nusdсаsе.соm\n";
  assert.deepEqual(parseDomainList(txt).sort(), ["betrug-nitro.ru", "fake-gift.xyz", "steamcommunity.com.ru"]);
  assert.deepEqual(parseDomainList(JSON.stringify({ domains: ["a-scam.com", 5, "discord.gg"] })), ["a-scam.com"]);
  assert.deepEqual(parseDomainList("[\"x-scam.net\"]"), ["x-scam.net"]);
  assert.deepEqual(parseDomainList("{kaputt"), []);
});

test("öffentliche Listen: Abgleich mit Subdomains, offizielle Seiten nie", () => {
  const list = new DomainList(["betrug.ru", "evil.pages.dev"]);
  assert.equal(list.has("betrug.ru"), true);
  assert.equal(list.has("login.betrug.ru"), true);
  assert.equal(list.has("www.betrug.ru"), true);
  assert.equal(list.has("nichtbetrug.ru"), false);
  assert.equal(list.has("ok.pages.dev"), false);
  assert.equal(list.has("ru"), false);
  assert.equal(new DomainList(["discord.com"]).has("discord.com"), false);
  const opts = { listed: list };
  assert.match(checkPhishing("schau mal https://login.betrug.ru/abc", opts) ?? "", /bekannte Betrugsdomain login\.betrug\.ru/);
  assert.equal(checkPhishing("schau mal https://login.betrug.ru/abc", { ...opts, allowed: ["betrug.ru"] }), null);
  assert.equal(checkPhishing("https://discord.com/channels/1", opts), null);
  assert.equal(checkPhishing("https://login.betrug.ru"), null);
});
