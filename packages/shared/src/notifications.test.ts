import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchKick,
  fetchTwitch,
  mergeSeen,
  newItems,
  parseFeed,
  parseSourceInput,
  renderNotification,
  resolveSource,
  type Fetch,
} from "./notifications.js";
import { isPrivateAddress, isPublicUrl } from "./netguard.js";

const YT = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCaaaaaaaaaaaaaaaaaaaaaa"/>
 <id>yt:channel:aaaaaaaaaaaaaaaaaaaaaa</id>
 <yt:channelId>aaaaaaaaaaaaaaaaaaaaaa</yt:channelId>
 <title>Test &amp; Kanal</title>
 <entry>
  <id>yt:video:vid2</id>
  <yt:videoId>vid2</yt:videoId>
  <title>Zweites Video</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=vid2"/>
  <author><name>Test &amp; Kanal</name></author>
  <published>2026-11-11T10:00:00+00:00</published>
 </entry>
 <entry>
  <id>yt:video:vid1</id>
  <yt:videoId>vid1</yt:videoId>
  <title>Erstes Video</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=vid1"/>
  <author><name>Test &amp; Kanal</name></author>
  <published>2026-11-10T10:00:00+00:00</published>
 </entry>
</feed>`;

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
<item><title>Alt</title><link>https://blog.example/alt</link><guid>a1</guid><pubDate>Mon, 09 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title><![CDATA[Neu & frisch]]></title><link>https://blog.example/neu</link><guid isPermaLink="false">a2</guid><pubDate>Wed, 11 Nov 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>RDF</title></channel>
<item><title>Eins</title><link>https://rdf.example/1</link><dc:date>2026-11-11T08:00:00Z</dc:date></item>
</rdf:RDF>`;

test("Eingaben erkennen", () => {
  const id = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
  assert.deepEqual(parseSourceInput("youtube", id), { kind: "id", value: id });
  assert.deepEqual(parseSourceInput("youtube", `https://www.youtube.com/channel/${id}/videos`), { kind: "id", value: id });
  assert.deepEqual(parseSourceInput("youtube", "@Kanal.Name"), { kind: "handle", value: "Kanal.Name" });
  assert.deepEqual(parseSourceInput("youtube", "youtube.com/@kanal"), { kind: "handle", value: "kanal" });
  assert.deepEqual(parseSourceInput("youtube", "m.youtube.com/@kanal"), { kind: "handle", value: "kanal" });
  assert.equal(parseSourceInput("youtube", "https://evil.example/@kanal"), null);
  assert.deepEqual(parseSourceInput("twitch", "https://www.twitch.tv/Some_Streamer"), { kind: "id", value: "some_streamer" });
  assert.deepEqual(parseSourceInput("twitch", "streamer"), { kind: "id", value: "streamer" });
  assert.equal(parseSourceInput("twitch", "https://kick.com/x"), null);
  assert.deepEqual(parseSourceInput("kick", "kick.com/some-one"), { kind: "id", value: "some-one" });
  assert.deepEqual(parseSourceInput("reddit", "r/de"), { kind: "id", value: "de" });
  assert.deepEqual(parseSourceInput("reddit", "https://old.reddit.com/r/Finanzen/new/"), { kind: "id", value: "Finanzen" });
  assert.equal(parseSourceInput("reddit", "https://reddit.com/user/x"), null);
  assert.deepEqual(parseSourceInput("rss", "blog.example/feed"), { kind: "id", value: "https://blog.example/feed" });
  assert.equal(parseSourceInput("rss", "ftp://blog.example/feed"), null);
  assert.equal(parseSourceInput("rss", "  "), null);
});

test("Feeds lesen: Atom, RSS 2.0, RDF", () => {
  const yt = parseFeed(YT);
  assert.equal(yt.name, "Test & Kanal");
  assert.deepEqual(
    yt.items.map((i) => [i.id, i.title, i.url]),
    [
      ["vid2", "Zweites Video", "https://www.youtube.com/watch?v=vid2"],
      ["vid1", "Erstes Video", "https://www.youtube.com/watch?v=vid1"],
    ],
  );
  const rss = parseFeed(RSS);
  assert.equal(rss.name, "Blog");
  assert.deepEqual(
    rss.items.map((i) => [i.id, i.title]),
    [
      ["a2", "Neu & frisch"],
      ["a1", "Alt"],
    ],
  );
  const rdf = parseFeed(RDF);
  assert.equal(rdf.items[0]!.id, "https://rdf.example/1");
  assert.throws(() => parseFeed("<html><body>kein Feed</body></html>"));
});

test("nur neue, frische Einträge, älteste zuerst, höchstens drei", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const mk = (id: string, hoursAgo: number) => ({ id, title: id, url: id, published: new Date(now.getTime() - hoursAgo * 3600_000) });
  const items = [mk("e", 1), mk("d", 2), mk("c", 3), mk("b", 4), mk("a", 100)];
  assert.deepEqual(
    newItems(items, ["c"], now).map((i) => i.id),
    ["b", "d", "e"].slice(-3),
  );
  assert.deepEqual(
    newItems(items, ["e", "d", "c", "b"], now).map((i) => i.id),
    [],
  ); // a ist zu alt
  const seen = mergeSeen(["x"], items);
  assert.deepEqual(seen.slice(0, 2), ["e", "d"]);
  assert.ok(seen.includes("x"));
  assert.equal(mergeSeen(Array.from({ length: 300 }, (_, i) => `s${i}`), items).length, 200);
});

test("Nachricht mit Platzhaltern", () => {
  assert.equal(
    renderNotification("**{name}**: {title} {url} {author} {unbekannt}", { name: "N", title: "T", url: "U" }),
    "**N**: T U  {unbekannt}",
  );
});

test("private Adressen werden blockiert", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["1.1.1.1", "142.250.0.1", "2a00:1450::1"]) assert.equal(isPrivateAddress(ip), false, ip);
  assert.equal(await isPublicUrl(new URL("http://127.0.0.1:5432/")), false);
  assert.equal(await isPublicUrl(new URL("http://localhost/")), false);
  assert.equal(await isPublicUrl(new URL("http://[::1]/")), false);
  assert.equal(await isPublicUrl(new URL("http://user:pw@1.1.1.1/")), false);
  assert.equal(await isPublicUrl(new URL("file:///etc/passwd")), false);
});

function fakeFetch(routes: Record<string, () => Response>): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    return hit ? hit[1]() : new Response("nope", { status: 404 });
  }) as Fetch & { calls: string[] };
  f.calls = calls;
  return f;
}

test("YouTube-Handle auflösen und prüfen", async () => {
  const id = "UCaaaaaaaaaaaaaaaaaaaaaa";
  const f = fakeFetch({
    "https://www.youtube.com/@kanal": () => new Response(`<html><link rel="canonical" href="https://www.youtube.com/channel/${id}"></html>`),
    "https://www.youtube.com/feeds/videos.xml": () => new Response(YT),
  });
  assert.deepEqual(await resolveSource("youtube", "@kanal", {}, f), { sourceId: id, name: "Test & Kanal" });
  await assert.rejects(resolveSource("youtube", "@gibtsnicht", {}, f), /Nicht gefunden/);
  await assert.rejects(resolveSource("youtube", "quatsch mit leerzeichen", {}, f), /Bitte/);
});

test("Weiterleitungen werden verfolgt", async () => {
  const f = fakeFetch({
    "https://a.example/feed": () => new Response(null, { status: 301, headers: { location: "https://b.example/feed.xml" } }),
    "https://b.example/feed.xml": () => new Response(RSS),
  });
  assert.equal((await resolveSource("rss", "https://a.example/feed", {}, f)).name, "Blog");
  const loop = fakeFetch({ "https://c.example/": () => new Response(null, { status: 302, headers: { location: "https://c.example/" } }) });
  await assert.rejects(resolveSource("rss", "https://c.example/", {}, loop), /Weiterleitungen/);
});

test("Twitch und Kick: Live-Status", async () => {
  const creds = { twitch: { clientId: "id", clientSecret: "s" }, kick: { clientId: "id2", clientSecret: "s2" } };
  const f = fakeFetch({
    "https://id.twitch.tv/oauth2/token": () => Response.json({ access_token: "t", expires_in: 3600 }),
    "https://api.twitch.tv/helix/users": () => Response.json({ data: [{ login: "a", display_name: "A" }, { login: "b", display_name: "B" }] }),
    "https://api.twitch.tv/helix/streams": () => Response.json({ data: [{ id: "s1", user_login: "a", title: "Hallo", type: "live" }] }),
    "https://id.kick.com/oauth/token": () => Response.json({ access_token: "k", expires_in: 3600 }),
    "https://api.kick.com/public/v1/channels": () =>
      Response.json({ data: [{ slug: "k1", stream_title: "Kick!", stream: { is_live: true, start_time: "2026-11-11T10:00:00Z" } }] }),
  });
  const tw = await fetchTwitch(["a", "b", "c"], creds, f);
  assert.deepEqual(tw.get("a"), { name: "A", live: true, streamId: "s1", title: "Hallo", url: "https://www.twitch.tv/a" });
  assert.equal(tw.get("b")!.live, false);
  assert.equal(tw.has("c"), false);
  const kk = await fetchKick(["k1"], creds, f);
  assert.equal(kk.get("k1")!.streamId, "2026-11-11T10:00:00Z");
  await assert.rejects(fetchTwitch(["a"], {}, f), /nicht eingerichtet/);
});
