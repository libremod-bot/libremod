import { XMLParser } from "fast-xml-parser";
import { isPublicUrl } from "./netguard.js";
import { t } from "./i18n.js";

/** Benachrichtigungen über neue Videos, Livestreams, Beiträge und Feed-Einträge. */
export const NOTIFY_PLATFORMS = ["youtube", "twitch", "kick", "reddit", "rss"] as const;
export type NotifyPlatform = (typeof NOTIFY_PLATFORMS)[number];

export const MAX_FEEDS = 30;
/** Höchstens so viele neue Einträge pro Abfrage posten, damit ein Feed den Kanal nicht flutet. */
export const MAX_POSTS_PER_POLL = 3;
/** Ältere Einträge werden nie gepostet, auch wenn sie neu im Feed auftauchen. */
export const MAX_ITEM_AGE_MS = 2 * 24 * 60 * 60 * 1000;
/** Wie viele gesehene Einträge pro Feed gespeichert werden. */
export const SEEN_LIMIT = 200;

export const POLL_MINUTES: Record<NotifyPlatform, number> = { youtube: 5, twitch: 2, kick: 2, reddit: 5, rss: 10 };

export const PLATFORM_INFO: Record<
  NotifyPlatform,
  { label: string; source: string; placeholder: string; defaultMessage: string; live: boolean }
> = {
  youtube: {
    label: "YouTube",
    source: "Kanal-Link, @Handle oder Kanal-ID",
    placeholder: "@kanalname",
    defaultMessage: "**{name}** hat ein neues Video hochgeladen: {url}",
    live: false,
  },
  twitch: {
    label: "Twitch",
    source: "Kanalname oder Link",
    placeholder: "kanalname",
    defaultMessage: "**{name}** ist jetzt live: {title}\n{url}",
    live: true,
  },
  kick: {
    label: "Kick",
    source: "Kanalname oder Link",
    placeholder: "kanalname",
    defaultMessage: "**{name}** ist jetzt live: {title}\n{url}",
    live: true,
  },
  reddit: {
    label: "Reddit",
    source: "Subreddit",
    placeholder: "r/de",
    defaultMessage: "Neuer Beitrag in **r/{name}**: {title}\n{url}",
    live: false,
  },
  rss: {
    label: "RSS / Atom",
    source: "Feed-Adresse",
    placeholder: "https://example.org/feed.xml",
    defaultMessage: "**{title}**\n{url}",
    live: false,
  },
};

export const NOTIFY_PLACEHOLDERS = ["{name}", "{title}", "{url}", "{author}"] as const;

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  author?: string;
  published?: Date;
}

export interface FeedResult {
  /** Anzeigename der Quelle, z. B. Kanalname. */
  name: string;
  /** Neueste zuerst. */
  items: FeedItem[];
}

export interface LiveResult {
  name: string;
  live: boolean;
  /** Eindeutig pro Stream, damit ein Neustart nicht doppelt verkündet wird. */
  streamId?: string;
  title?: string;
  url: string;
}

export interface Credentials {
  twitch?: { clientId: string; clientSecret: string };
  kick?: { clientId: string; clientSecret: string };
}

export function credentialsFromEnv(env: Record<string, string | undefined> = process.env): Credentials {
  const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : undefined);
  return { twitch: pair(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET), kick: pair(env.KICK_CLIENT_ID, env.KICK_CLIENT_SECRET) };
}

export function platformAvailable(platform: NotifyPlatform, creds: Credentials) {
  if (platform === "twitch") return !!creds.twitch;
  if (platform === "kick") return !!creds.kick;
  return true;
}

export class SourceError extends Error {
  /** true = die Quelle gibt es nicht (mehr), false = vorübergehender Fehler. */
  constructor(
    message: string,
    readonly permanent = false,
  ) {
    super(message);
  }
}

// --- Eingaben erkennen ---

const YT_CHANNEL_ID = /^UC[\w-]{22}$/;
const LOGIN = /^[a-zA-Z0-9_]{3,25}$/;
const KICK_SLUG = /^[a-zA-Z0-9_-]{3,25}$/;
const SUBREDDIT = /^[a-zA-Z0-9_]{2,21}$/;

function asUrl(input: string) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`);
    return u;
  } catch {
    return null;
  }
}

function hostIs(u: URL, ...hosts: string[]) {
  const h = u.hostname.toLowerCase().replace(/^(www|m|old|new)\./, "");
  return hosts.includes(h);
}

/** Wandelt die Eingabe in eine Kennung um, ohne Netzwerk. YouTube-Handles brauchen danach noch {@link resolveSource}. */
export function parseSourceInput(platform: NotifyPlatform, raw: string): { kind: "id" | "handle"; value: string } | null {
  const input = raw.trim();
  if (!input) return null;
  switch (platform) {
    case "youtube": {
      if (YT_CHANNEL_ID.test(input)) return { kind: "id", value: input };
      if (/^@[\w.-]{3,30}$/.test(input)) return { kind: "handle", value: input.slice(1) };
      const u = asUrl(input);
      if (!u || !hostIs(u, "youtube.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1] && YT_CHANNEL_ID.test(parts[1])) return { kind: "id", value: parts[1] };
      if (parts[0]?.startsWith("@") && /^@[\w.-]{3,30}$/.test(decodeURIComponent(parts[0])))
        return { kind: "handle", value: decodeURIComponent(parts[0]).slice(1) };
      return null;
    }
    case "twitch":
    case "kick": {
      let name = input;
      const u = input.includes("/") || input.includes(".") ? asUrl(input) : null;
      if (u) {
        if (!hostIs(u, platform === "twitch" ? "twitch.tv" : "kick.com")) return null;
        name = u.pathname.split("/").filter(Boolean)[0] ?? "";
      }
      const ok = platform === "twitch" ? LOGIN.test(name) : KICK_SLUG.test(name);
      return ok ? { kind: "id", value: name.toLowerCase() } : null;
    }
    case "reddit": {
      let name = input.replace(/^\/?r\//i, "");
      if (input.includes(".")) {
        const u = asUrl(input);
        if (!u || !hostIs(u, "reddit.com")) return null;
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts[0]?.toLowerCase() !== "r" || !parts[1]) return null;
        name = parts[1];
      }
      return SUBREDDIT.test(name) ? { kind: "id", value: name } : null;
    }
    case "rss": {
      const u = asUrl(input);
      if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
      return { kind: "id", value: u.toString() };
    }
  }
}

/** Öffentliche Adresse der Quelle (für Links im Dashboard). */
export function sourceUrl(platform: NotifyPlatform, sourceId: string) {
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/channel/${sourceId}`;
    case "twitch":
      return `https://www.twitch.tv/${sourceId}`;
    case "kick":
      return `https://kick.com/${sourceId}`;
    case "reddit":
      return `https://www.reddit.com/r/${sourceId}/`;
    case "rss":
      return sourceId;
  }
}

// --- Netzwerk ---

const USER_AGENT = "Libremod/0.6 (Discord-Bot; +https://libremod.xyz)";
export type Fetch = typeof fetch;

/** Lädt eine Adresse und folgt Weiterleitungen nur ins öffentliche Internet. */
async function get(url: string, f: Fetch, init: RequestInit = {}, checkHost = f === fetch) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (checkHost && !(await isPublicUrl(new URL(current)))) throw new SourceError(t("Diese Adresse ist nicht erlaubt"), true);
    let res: Response;
    try {
      res = await f(current, {
        ...init,
        headers: { "user-agent": USER_AGENT, ...(init.headers as Record<string, string>) },
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
      });
    } catch (err) {
      throw new SourceError(t("Nicht erreichbar ({n0})", { n0: (err as Error).name === "TimeoutError" ? t("Zeitüberschreitung") : "Netzwerkfehler" }));
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new SourceError(t("Nicht gefunden"), true);
    if (!res.ok) throw new SourceError(t("Antwort {status}", { status: res.status }));
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > MAX_BODY) throw new SourceError(t("Antwort zu groß"), true);
    return res;
  }
  throw new SourceError(t("Zu viele Weiterleitungen"), true);
}

const MAX_BODY = 5 * 1024 * 1024;

async function readText(res: Response) {
  const text = await res.text();
  if (text.length > MAX_BODY) throw new SourceError(t("Antwort zu groß"), true);
  return text;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return str((v as Record<string, unknown>)["#text"]);
  return String(v).trim();
}
function date(v: unknown) {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function atomLink(links: unknown): string {
  const list = arr(links as Record<string, string> | Record<string, string>[]);
  const alt = list.find((l) => typeof l === "object" && (!l["@rel"] || l["@rel"] === "alternate"));
  return str(alt?.["@href"] ?? (typeof list[0] === "object" ? list[0]?.["@href"] : list[0]));
}

/** Liest RSS 2.0, RSS 1.0 (RDF) und Atom. Neueste Einträge zuerst. */
export function parseFeed(body: string): FeedResult {
  let doc: Record<string, any>;
  try {
    doc = xml.parse(body);
  } catch {
    throw new SourceError(t("Kein gültiger Feed"), true);
  }
  let name = "";
  let items: FeedItem[] = [];
  if (doc.feed) {
    const feed = doc.feed;
    name = str(feed.title);
    items = arr(feed.entry).map((e: any) => {
      const url = atomLink(e.link);
      return {
        id: str(e["yt:videoId"]) || str(e.id) || url,
        title: str(e.title),
        url,
        author: str(arr(e.author)[0]?.name) || undefined,
        published: date(e.published) ?? date(e.updated),
      };
    });
  } else if (doc.rss?.channel || doc["rdf:RDF"]) {
    const channel = doc.rss?.channel ?? doc["rdf:RDF"].channel;
    name = str(arr(channel)[0]?.title);
    const rawItems = doc.rss?.channel ? arr(arr(channel)[0]?.item) : arr(doc["rdf:RDF"].item);
    items = rawItems.map((i: any) => {
      const url = str(i.link) || atomLink(i["atom:link"]);
      return {
        id: str(i.guid) || url || str(i.title),
        title: str(i.title),
        url,
        author: str(i["dc:creator"]) || str(i.author) || undefined,
        published: date(i.pubDate) ?? date(i["dc:date"]),
      };
    });
  } else {
    throw new SourceError(t("Kein gültiger Feed"), true);
  }
  items = items.filter((i) => i.id);
  // Nicht jeder Feed ist sortiert.
  if (items.every((i) => i.published)) items.sort((a, b) => b.published!.getTime() - a.published!.getTime());
  return { name: name || t("Feed"), items };
}

async function fetchXmlFeed(url: string, f: Fetch) {
  const res = await get(url, f, { headers: { accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5" } });
  return parseFeed(await readText(res));
}

export function youtubeFeedUrl(channelId: string) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function redditFeedUrl(subreddit: string) {
  return `https://www.reddit.com/r/${subreddit}/new/.rss`;
}

/** Holt die neuesten Einträge einer Feed-Quelle (YouTube, Reddit, RSS). */
export async function fetchFeed(platform: "youtube" | "reddit" | "rss", sourceId: string, f: Fetch = fetch): Promise<FeedResult> {
  if (platform === "youtube") {
    const feed = await fetchXmlFeed(youtubeFeedUrl(sourceId), f);
    return { ...feed, items: feed.items.map((i) => ({ ...i, url: i.url || `https://www.youtube.com/watch?v=${i.id}` })) };
  }
  if (platform === "reddit") {
    const feed = await fetchXmlFeed(redditFeedUrl(sourceId), f);
    return { name: sourceId, items: feed.items };
  }
  return fetchXmlFeed(sourceId, f);
}

/** YouTube-Handle → Kanal-ID über die Kanalseite. */
export async function resolveYoutubeHandle(handle: string, f: Fetch = fetch): Promise<string> {
  const res = await get(`https://www.youtube.com/@${encodeURIComponent(handle)}`, f, {
    // Ohne Cookie leitet YouTube aus der EU auf die Zustimmungsseite um.
    headers: { cookie: "SOCS=CAI; CONSENT=YES+1", "accept-language": "de-DE,de;q=0.9" },
  });
  const html = await readText(res);
  const m =
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ??
    /"externalId":"(UC[\w-]{22})"/.exec(html) ??
    /"browseId":"(UC[\w-]{22})"/.exec(html);
  if (!m) throw new SourceError(t("Kanal nicht gefunden"), true);
  return m[1]!;
}

// Twitch und Kick: App-Token per Client-Credentials, zwischengespeichert.
const tokens = new Map<string, { token: string; expires: number }>();

async function appToken(kind: "twitch" | "kick", creds: { clientId: string; clientSecret: string }, f: Fetch) {
  const key = `${kind}:${creds.clientId}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const url = kind === "twitch" ? "https://id.twitch.tv/oauth2/token" : "https://id.kick.com/oauth/token";
  const body = new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "client_credentials" });
  let res: Response;
  try {
    res = await f(url, { method: "POST", body, headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new SourceError(t("Anmeldung nicht erreichbar"));
  }
  if (!res.ok) throw new SourceError(t("Anmeldung fehlgeschlagen ({status}), Schlüssel prüfen", { status: res.status }));
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(key, { token: data.access_token, expires: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

/** Live-Status mehrerer Twitch-Kanäle auf einmal (Kanalname → Ergebnis; fehlende Kanäle gibt es nicht). */
export async function fetchTwitch(logins: string[], creds: Credentials, f: Fetch = fetch): Promise<Map<string, LiveResult>> {
  if (!creds.twitch) throw new SourceError(t("Twitch ist nicht eingerichtet"));
  const out = new Map<string, LiveResult>();
  const token = await appToken("twitch", creds.twitch, f);
  const headers = { "client-id": creds.twitch.clientId, authorization: `Bearer ${token}` };
  for (let i = 0; i < logins.length; i += 100) {
    const chunk = logins.slice(i, i + 100);
    const q = chunk.map((l) => `login=${encodeURIComponent(l)}`).join("&");
    const users = (await (await get(`https://api.twitch.tv/helix/users?${q}`, f, { headers })).json()) as {
      data: { login: string; display_name: string }[];
    };
    const sq = chunk.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    const streams = (await (await get(`https://api.twitch.tv/helix/streams?first=100&${sq}`, f, { headers })).json()) as {
      data: { id: string; user_login: string; title: string; type: string }[];
    };
    for (const u of users.data) {
      const s = streams.data.find((x) => x.user_login.toLowerCase() === u.login.toLowerCase() && x.type === "live");
      out.set(u.login.toLowerCase(), {
        name: u.display_name || u.login,
        live: !!s,
        streamId: s?.id,
        title: s?.title,
        url: `https://www.twitch.tv/${u.login}`,
      });
    }
  }
  return out;
}

/** Live-Status mehrerer Kick-Kanäle über die offizielle Schnittstelle. */
export async function fetchKick(slugs: string[], creds: Credentials, f: Fetch = fetch): Promise<Map<string, LiveResult>> {
  if (!creds.kick) throw new SourceError(t("Kick ist nicht eingerichtet"));
  const out = new Map<string, LiveResult>();
  const token = await appToken("kick", creds.kick, f);
  for (let i = 0; i < slugs.length; i += 50) {
    const q = slugs
      .slice(i, i + 50)
      .map((s) => `slug=${encodeURIComponent(s)}`)
      .join("&");
    const res = (await (await get(`https://api.kick.com/public/v1/channels?${q}`, f, { headers: { authorization: `Bearer ${token}` } })).json()) as {
      data?: { slug: string; stream_title?: string; stream?: { is_live?: boolean; start_time?: string } | null }[];
    };
    for (const c of res.data ?? []) {
      const live = !!c.stream?.is_live;
      out.set(c.slug.toLowerCase(), {
        name: c.slug,
        live,
        // Kick liefert keine Stream-ID, der Startzeitpunkt ist pro Stream eindeutig.
        streamId: live ? (c.stream?.start_time ?? "live") : undefined,
        title: c.stream_title,
        url: `https://kick.com/${c.slug}`,
      });
    }
  }
  return out;
}

/**
 * Prüft eine Eingabe und liefert die gespeicherte Kennung samt Anzeigename.
 * Wirft {@link SourceError} mit einer verständlichen Meldung.
 */
export async function resolveSource(
  platform: NotifyPlatform,
  raw: string,
  creds: Credentials,
  f: Fetch = fetch,
): Promise<{ sourceId: string; name: string }> {
  const parsed = parseSourceInput(platform, raw);
  if (!parsed) throw new SourceError(t("Bitte {source} angeben.", { source: PLATFORM_INFO[platform].source }), true);
  switch (platform) {
    case "youtube": {
      const id = parsed.kind === "handle" ? await resolveYoutubeHandle(parsed.value, f) : parsed.value;
      const feed = await fetchFeed("youtube", id, f);
      return { sourceId: id, name: feed.name };
    }
    case "reddit": {
      await fetchFeed("reddit", parsed.value, f);
      return { sourceId: parsed.value.toLowerCase(), name: parsed.value };
    }
    case "rss": {
      const feed = await fetchFeed("rss", parsed.value, f);
      return { sourceId: parsed.value, name: feed.name };
    }
    case "twitch":
    case "kick": {
      const map = platform === "twitch" ? await fetchTwitch([parsed.value], creds, f) : await fetchKick([parsed.value], creds, f);
      const hit = map.get(parsed.value);
      if (!hit) throw new SourceError(t("Diesen Kanal gibt es nicht."), true);
      return { sourceId: parsed.value, name: hit.name };
    }
  }
}

/** Neue Einträge seit dem letzten Mal, älteste zuerst, höchstens {@link MAX_POSTS_PER_POLL}. */
export function newItems(items: FeedItem[], seen: string[], now = new Date()): FeedItem[] {
  const known = new Set(seen);
  return items
    .filter((i) => !known.has(i.id) && (!i.published || now.getTime() - i.published.getTime() < MAX_ITEM_AGE_MS))
    .slice(0, MAX_POSTS_PER_POLL)
    .reverse();
}

/** Gesehene Kennungen fortschreiben, neueste zuerst, begrenzt. */
export function mergeSeen(seen: string[], items: FeedItem[]): string[] {
  const out = [...new Set([...items.map((i) => i.id), ...seen])];
  return out.slice(0, SEEN_LIMIT);
}

export function renderNotification(template: string, v: { name: string; title?: string; url: string; author?: string }) {
  const map: Record<string, string> = {
    "{name}": v.name,
    "{title}": v.title ?? "",
    "{url}": v.url,
    "{author}": v.author ?? "",
  };
  return template.replace(/\{(name|title|url|author)\}/g, (m) => map[m] ?? m).slice(0, 2000);
}
