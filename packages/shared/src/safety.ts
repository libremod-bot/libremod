/**
 * Anti-Phishing, Namensschutz, Massenaktionen und Einsprüche: reine Logik ohne Discord und Datenbank.
 */

// --- Gemeinsame Hilfen ---

/** Zeichen, die sich zum Verwechseln ähnlich sehen, auf ein Grundzeichen bringen. */
import { intlLocale, t } from "./i18n.js";
const LOOKALIKE: Record<string, string> = {
  "0": "o", "1": "i", l: "i", "|": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s", "7": "t", "8": "b", "9": "g",
  // Kyrillische und griechische Doppelgänger
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ο": "o", "α": "a", "ν": "v", "κ": "k",
};

/** Großbuchstaben aus Griechisch und Kyrillisch, die wie lateinische aussehen (klein sähen sie anders aus). */
const LOOKALIKE_UPPER: Record<string, string> = {
  "Α": "a", "Β": "b", "Ε": "e", "Ζ": "z", "Η": "h", "Ι": "i", "Κ": "k", "Μ": "m", "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t", "Υ": "y", "Χ": "x",
  "А": "a", "В": "b", "Е": "e", "К": "k", "М": "m", "Н": "h", "О": "o", "Р": "p", "С": "c", "Т": "t", "Х": "x",
};

/** Grundform zum Vergleichen: klein, ohne Akzente, Doppelgänger ersetzt, nur Buchstaben. */
export function skeleton(text: string): string {
  let mapped = "";
  for (const ch of text) mapped += LOOKALIKE_UPPER[ch] ?? ch;
  // Buchstabenpaare, die wie ein Buchstabe aussehen: rn = m, vv = w, cl = d
  const tItem = mapped.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d");
  let out = "";
  for (const ch of tItem) out += LOOKALIKE[ch] ?? ch;
  return out.replace(/[^\p{L}]/gu, "");
}

/** Editierdistanz mit Vertauschungen (Damerau-Levenshtein, eingeschränkt). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

// --- Anti-Phishing ---

interface Brand {
  name: string;
  official: string[];
}

/** Häufig nachgeahmte Seiten. Echte Domains und ihre Subdomains sind immer erlaubt. */
const BRANDS: Brand[] = [
  { name: "discord", official: ["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media", "discord.gift", "discord.new", "discordstatus.com", "discord.dev", "discord.co", "discord.design", "discordmerch.com"] },
  { name: "steamcommunity", official: ["steamcommunity.com"] },
  { name: "steampowered", official: ["steampowered.com"] },
  { name: "epicgames", official: ["epicgames.com"] },
  { name: "roblox", official: ["roblox.com"] },
  { name: "twitch", official: ["twitch.tv"] },
  { name: "paypal", official: ["paypal.com", "paypal.me"] },
  { name: "playstation", official: ["playstation.com"] },
  { name: "minecraft", official: ["minecraft.net"] },
];

/** Lockwörter typischer Betrugsseiten. */
const BAIT = ["nitro", "gift", "free", "airdrop", "claim", "promo", "drop", "giveaway", "verify", "login", "auth", "bonus", "reward", "trade", "skins"];

/** Bekannte Kurzlink-Dienste: Das echte Ziel steht erst hinter der Weiterleitung. */
export const SHORTENERS = [
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "is.gd", "v.gd", "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy", "t.ly",
  "ow.ly", "buff.ly", "tiny.cc", "s.id", "shorte.st", "adf.ly", "u.to", "clck.ru", "qr.ae", "lnkd.in", "tiny.one", "shrtco.de", "short.gy",
];

export const isShortener = (host: string) => SHORTENERS.some((d) => endsWithDomain(host, d));

const URL_RE = /\bhttps?:\/\/([^\s/<>"')\]?#]+)([^\s<>"')\]]*)/gi;
// Domains ohne https:// davor, z. B. „discord-gift.ru/abc“. Nicht nach @ (E-Mail) oder mitten in einem Link.
const BARE_RE = /(?<![\w@/.:-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,30}))(\/[^\s<>"')\]]*)?(?![\w-])/gi;
const MASKED_RE = /\[([^\]\n]{1,200})\]\(\s*<?(https?:\/\/[^\s)>]+)>?\s*\)/gi;

function endsWithDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

// --- Punycode (RFC 3492), damit „xn--…“-Domains mit echten Zeichen geprüft werden ---

function adapt(delta: number, points: number, first: boolean) {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > 455) {
    d = Math.floor(d / 35);
    k += 36;
  }
  return k + Math.floor((36 * d) / (d + 38));
}

export function punycodeDecode(input: string): string | null {
  const out: number[] = [];
  const basic = Math.max(0, input.lastIndexOf("-"));
  for (let j = 0; j < basic; j++) out.push(input.charCodeAt(j));
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = basic > 0 ? basic + 1 : 0; index < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) return null;
      const c = input.charCodeAt(index++);
      const digit = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : 36;
      if (digit >= 36) return null;
      i += digit * w;
      const tItem = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < tItem) break;
      w *= 36 - tItem;
      if (w > 1e12) return null;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff) return null;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

/** Host mit echten Zeichen statt „xn--“. */
export function unicodeHost(host: string): string {
  return host
    .split(".")
    .map((l) => (l.startsWith("xn--") ? (punycodeDecode(l.slice(4)) ?? l) : l))
    .join(".");
}

/** Grob die Haupt-Domain: libremod.xyz, bbc.co.uk */
function baseDomain(host: string) {
  const l = host.split(".");
  const second = l[l.length - 2] ?? "";
  const n = l.length >= 3 && l[l.length - 1]!.length === 2 && ["co", "com", "org", "net", "gov", "ac", "edu"].includes(second) ? 3 : 2;
  return l.slice(-n).join(".");
}

export interface FoundLink {
  host: string;
  path: string;
  /** Vollständiger Link, bei Domains ohne Schema mit https:// davor. */
  url: string;
}

export function extractLinks(content: string): FoundLink[] {
  const out: FoundLink[] = [];
  const seen = new Set<string>();
  const add = (rawHost: string, rawPath: string, url: string) => {
    const host = rawHost.toLowerCase().split("@").pop()!.split(":")[0]!.replace(/\.$/, "");
    const path = rawPath.toLowerCase();
    if (!host || seen.has(host + path)) return;
    seen.add(host + path);
    out.push({ host, path, url });
  };
  for (const m of content.matchAll(URL_RE)) add(m[1]!, m[2] ?? "", m[0]);
  for (const m of content.matchAll(BARE_RE)) add(m[1]!, m[2] ?? "", `https://${m[0]}`);
  return out;
}

export interface PhishingOptions {
  /** Zusätzlich gesperrte Domains (inkl. Subdomains). */
  blocked?: string[];
  /** Vom Team freigegebene Domains, z. B. nach einem Fehlalarm. */
  allowed?: string[];
  /** Domains aus öffentlichen Betrugslink-Listen (lokal abgeglichen). */
  listed?: Pick<DomainList, "has">;
}

const clean = (list: string[] = []) => list.map((d) => d.toLowerCase().replace(/^\*?\./, ""));

const isOfficial = (host: string) => BRANDS.some((b) => b.official.some((d) => endsWithDomain(host, d)));

/** Echte Seite einer oft nachgeahmten Marke (discord.com, steamcommunity.com …)? */
export const isOfficialDomain = isOfficial;

/** Bewertet einen Link. Gibt den Grund zurück oder null, wenn er unauffällig ist. */
export function phishingReason(host: string, path = "", opts: PhishingOptions | string[] = {}): string | null {
  const o = Array.isArray(opts) ? { blocked: opts } : opts;
  if (clean(o.blocked).some((d) => endsWithDomain(host, d))) return t("gesperrte Domain {host}", { host });
  if (clean(o.allowed).some((d) => endsWithDomain(host, d))) return null;
  if (isOfficial(host)) return null;

  const shown = unicodeHost(host);
  if (o.listed?.has(host)) return t("bekannte Betrugsdomain {shown}", { shown });
  // Beide Schreibweisen prüfen: kaputtes Punycode soll den Rohtext nicht verstecken.
  return lookalikeReason(host, path, shown) ?? (shown !== host ? lookalikeReason(shown, path, shown) : null);
}

function lookalikeReason(form: string, path: string, shown: string): string | null {
  const host = form;
  const labels = form.split(".");
  const body = labels.slice(0, -1); // ohne Endung wie .com
  const hasBait = BAIT.some((w) => form.includes(w) || path.includes(w));
  for (const brand of BRANDS) {
    // Echte Domain nur vorne im Namen versteckt: discord.com.free-gift.ru
    if (brand.official.some((d) => host.includes(`${d}.`) || host.includes(`${d}-`))) return t("getarnter Link {host}", { host });
    const brandSkel = skeleton(brand.name);
    for (const raw of [...body, body.join("")]) {
      const plain = raw.replace(/[^a-z]/g, "");
      const skel = skeleton(raw);
      if (!skel) continue;
      if (skel === brandSkel && plain !== brand.name) return t("Nachahmung von {name}: {shown}", { name: brand.name, shown });
      if (skel.includes(brandSkel) && skel !== brandSkel && hasBait) return t("verdächtiger {name}-Link {shown}", { name: brand.name, shown });
      if (skel === brandSkel && hasBait && plain === brand.name && raw !== brand.name) return t("verdächtiger {name}-Link {shown}", { name: brand.name, shown });
      // Tippfehler-Domains: gleich lang oder ein Zeichen kürzer, höchstens ein (bei langen Namen zwei) Fehler
      const max = brandSkel.length >= 10 ? 2 : 1;
      if (skel.length <= brandSkel.length && skel.length >= brandSkel.length - 1 && skel !== brandSkel) {
        if (editDistance(skel, brandSkel) <= max) return t("Nachahmung von {name}: {shown}", { name: brand.name, shown });
      }
    }
  }
  if (form.includes("nitro") && /free|gift|claim|drop/.test(form + path)) return t("verdächtiger Nitro-Link {shown}", { shown });
  return null;
}

/** Markdown-Link, dessen sichtbarer Text eine andere Seite zeigt als das echte Ziel. */
export function maskedLinkReason(content: string): string | null {
  for (const m of content.matchAll(MASKED_RE)) {
    const label = m[1]!;
    const target = extractLinks(m[2]!)[0];
    const shown = extractLinks(label)[0];
    if (!target || !shown) continue;
    if (baseDomain(shown.host) !== baseDomain(target.host)) return t("getarnter Link: zeigt „{host}“, führt aber zu {host2}", { host: shown.host, host2: target.host });
  }
  return null;
}

/** Typische Sätze aus Betrugsnachrichten. */
const SCAM_TEXT: [RegExp, string][] = [
  [/free\s*(discord\s*)?nitro|nitro\s*(for\s*)?free|(gratis|kostenlos\w*)\s*nitro/, "kostenloses Nitro"],
  [/(steam|discord|nitro)\s*(gift|geschenk|giveaway)/, "angebliches Geschenk"],
  [/[$€]\s?\d{2,3}\s*(steam|gift|skins?|guthaben)|\d{2,3}\s?([$€]|usd|eur)\s*(steam|gift|skins?|guthaben)/, "Geld- oder Guthaben-Versprechen"],
  [/(accident\w*|aus versehen|versehentlich)\s+(reported|gemeldet)/, "„aus Versehen gemeldet“-Masche"],
  [/(leaving|quitting|aufh(ö|oe)r\w*)\b.{0,40}\b(cs2|csgo|cs:go|skins|inventory|inventar)/, "„verschenke mein Inventar“-Masche"],
  [/claim\s+(your|it|now|here)|jetzt\s+(abholen|einl(ö|oe)sen|sichern)/, "Aufforderung zum Abholen"],
  [/(first|erste[nr]?)\s+\d+\s+(users?|people|leute|personen)/, "„nur für die ersten“-Druck"],
  [/airdrop|crypto\s*giveaway|(eth|btc|usdt)\s*(giveaway|geschenkt)/, "Krypto-Lockangebot"],
];

export function scamTextReason(content: string): string | null {
  const tItem = content.toLowerCase();
  for (const [re, label] of SCAM_TEXT) if (re.test(tItem)) return label;
  return null;
}

/** Prüft eine ganze Nachricht. `extraHosts` sind z. B. aufgelöste Ziele von Kurzlinks. */
export function checkPhishing(content: string, opts: PhishingOptions | string[] = {}, extra: { host: string; path: string }[] = []): string | null {
  const o = Array.isArray(opts) ? { blocked: opts } : opts;
  const links = [...extractLinks(content), ...extra];
  if (!links.length) return null;
  for (const { host, path } of links) {
    const reason = phishingReason(host, path, o);
    if (reason) return t("Betrugsverdacht: {reason}", { reason });
  }
  const masked = maskedLinkReason(content);
  if (masked) return t("Betrugsverdacht: {masked}", { masked });
  const allowed = clean(o.allowed);
  const unknown = links.filter((l) => !isOfficial(l.host) && !allowed.some((d) => endsWithDomain(l.host, d)));
  const text = unknown.length ? scamTextReason(content) : null;
  if (text) return t("Betrugsverdacht: {text} mit Link zu {host}", { text, host: unicodeHost(unknown[0]!.host) });
  return null;
}

// --- Namensschutz ---

export const NAME_GUARD_ACTIONS = [
  { value: "log", label: "Nur im Mod-Log melden" },
  { value: "rename", label: "Spitznamen zurücksetzen" },
  { value: "kick", label: "Kicken" },
  { value: "ban", label: "Bannen" },
] as const;

export type NameGuardAction = (typeof NAME_GUARD_ACTIONS)[number]["value"];

const MIN_GUARDED_LENGTH = 3;

/** Sieht `candidate` einem der geschützten Namen zum Verwechseln ähnlich? Gibt den Treffer zurück. */
export function impersonates(candidate: string, protectedNames: string[]): string | null {
  const c = skeleton(candidate);
  if (c.length < MIN_GUARDED_LENGTH) return null;
  for (const name of protectedNames) {
    const p = skeleton(name);
    if (p.length < MIN_GUARDED_LENGTH) continue;
    if (c === p) return name;
    if (p.length >= 5 && Math.abs(c.length - p.length) <= 1 && editDistance(c, p) <= 1) return name;
    // „Admin Max“ oder „Max | Support“: geschützter Name plus Team-Wort
    if (p.length >= 4 && c.includes(p) && /admin|mod|support|team|staff|owner|official|offiziell/.test(c.replace(p, ""))) return name;
  }
  return null;
}

// --- Massenaktionen ---

export const MAX_MASS_TARGETS = 50;

/** Nutzer-IDs aus Text mit Erwähnungen, IDs, Kommas oder Zeilenumbrüchen. */
export function parseUserIds(input: string): string[] {
  return [...new Set([...input.matchAll(/(?:<@!?)?(\d{17,20})>?/g)].map((m) => m[1]!))];
}

// --- Einsprüche ---

export const APPEAL_MIN_LENGTH = 30;
export const APPEAL_MAX_LENGTH = 2000;

/** Darf jemand (wieder) Einspruch einlegen? Gibt den Grund zurück, wenn nicht. */
export function appealBlocker(
  previous: { status: string; reviewedAt: Date | null; createdAt: Date }[],
  cooldownDays: number,
  now = new Date(),
): string | null {
  if (previous.some((p) => p.status === "open")) return t("Dein Einspruch liegt dem Team schon vor.");
  const lastDenied = previous
    .filter((p) => p.status === "denied")
    .map((p) => (p.reviewedAt ?? p.createdAt).getTime())
    .sort((a, b) => b - a)[0];
  if (lastDenied && now.getTime() - lastDenied < cooldownDays * 86_400_000) {
    const until = new Date(lastDenied + cooldownDays * 86_400_000);
    return t("Dein letzter Einspruch wurde abgelehnt. Einen neuen kannst du ab {n0} stellen.", { n0: until.toLocaleDateString(intlLocale(), { timeZone: "Europe/Berlin" }) });
  }
  return null;
}

// --- Öffentliche Betrugslink-Listen ---

/**
 * Freie Hosting-Plattformen: Ein Eintrag wie „pages.dev“ würde sonst jede Seite dort sperren.
 * Einzelne Unterseiten (betrug.pages.dev) bleiben sperrbar.
 */
const SHARED_HOSTS = [
  "pages.dev", "workers.dev", "github.io", "gitlab.io", "vercel.app", "netlify.app", "web.app", "firebaseapp.com", "glitch.me",
  "herokuapp.com", "repl.co", "replit.app", "blogspot.com", "wixsite.com", "weebly.com", "000webhostapp.com", "gitbook.io",
  "ngrok.io", "ngrok-free.app", "onrender.com", "fly.dev", "azurewebsites.net", "appspot.com", "translate.goog", "sites.google.com",
  "ddns.net", "myftp.org", "duckdns.org", "no-ip.org", "sytes.net", "servehttp.com", "work.gd", "free.nf", "rf.gd",
];

const LIST_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,30})$/;
export const MAX_LIST_ENTRIES = 200_000;

/** Eintrag einer Liste auf die reine Domain bringen, z. B. „https://Betrug.ru/login?x“ → „betrug.ru“. */
function listEntryDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (!d || d.startsWith("#") || d.startsWith("//")) return null;
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^@/]*@/, "");
  d = d.split(/[/?#:\s]/)[0]!.replace(/^\*?\./, "").replace(/\.$/, "");
  if (d.startsWith("www.")) d = d.slice(4);
  if (d.length > 253 || !LIST_DOMAIN_RE.test(d)) return null;
  if (d.split(".").length < 2) return null;
  // Nie offizielle Seiten, Kurzlink-Dienste oder ganze Hosting-Plattformen sperren.
  if (isOfficial(d) || SHORTENERS.includes(d) || SHARED_HOSTS.includes(d)) return null;
  return d;
}

/** Liest eine Liste als Text (eine Domain oder URL pro Zeile) oder als JSON ({ domains: [...] } bzw. [...]). */
export function parseDomainList(text: string): string[] {
  let entries: unknown[] | null = null;
  const tItem = text.trimStart();
  if (tItem.startsWith("{") || tItem.startsWith("[")) {
    try {
      const json = JSON.parse(tItem) as unknown;
      entries = Array.isArray(json) ? json : Array.isArray((json as { domains?: unknown })?.domains) ? (json as { domains: unknown[] }).domains : [];
    } catch {
      entries = [];
    }
  }
  const out = new Set<string>();
  for (const e of entries ?? text.split(/\r?\n/)) {
    if (typeof e !== "string") continue;
    const d = listEntryDomain(e);
    if (d) out.add(d);
    if (out.size >= MAX_LIST_ENTRIES) break;
  }
  return [...out];
}

/** Domain-Menge mit Abgleich inklusive Subdomains: „login.betrug.ru“ trifft den Eintrag „betrug.ru“. */
export class DomainList {
  private readonly set: Set<string>;
  constructor(domains: Iterable<string> = []) {
    this.set = new Set(domains);
  }
  get size() {
    return this.set.size;
  }
  has(host: string): boolean {
    let h = host.toLowerCase().replace(/\.$/, "");
    if (h.startsWith("www.")) h = h.slice(4);
    if (isOfficial(h)) return false;
    for (;;) {
      if (this.set.has(h)) return true;
      const dot = h.indexOf(".");
      if (dot < 0 || h.indexOf(".", dot + 1) < 0) return false; // nie nur gegen eine Endung wie „ru“ prüfen
      h = h.slice(dot + 1);
    }
  }
}
