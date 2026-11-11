/**
 * Anti-Phishing, Namensschutz, Massenaktionen und Einsprüche: reine Logik ohne Discord und Datenbank.
 */

// --- Gemeinsame Hilfen ---

/** Zeichen, die sich zum Verwechseln ähnlich sehen, auf ein Grundzeichen bringen. */
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
  const t = mapped.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d");
  let out = "";
  for (const ch of t) out += LOOKALIKE[ch] ?? ch;
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

const URL_RE = /\bhttps?:\/\/([^\s/<>"')\]]+)([^\s<>"')\]]*)/gi;

const endsWithDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function extractLinks(content: string): { host: string; path: string }[] {
  const out: { host: string; path: string }[] = [];
  for (const m of content.matchAll(URL_RE)) {
    const host = m[1]!.toLowerCase().split("@").pop()!.split(":")[0]!.replace(/\.$/, "");
    if (host) out.push({ host, path: (m[2] ?? "").toLowerCase() });
  }
  return out;
}

/** Bewertet einen Link. Gibt den Grund zurück oder null, wenn er unauffällig ist. */
export function phishingReason(host: string, path = "", blocked: string[] = []): string | null {
  const cleanBlocked = blocked.map((d) => d.toLowerCase().replace(/^\*?\./, ""));
  if (cleanBlocked.some((d) => endsWithDomain(host, d))) return `gesperrte Domain ${host}`;
  if (BRANDS.some((b) => b.official.some((d) => endsWithDomain(host, d)))) return null;

  const labels = host.split(".");
  const body = labels.slice(0, -1); // ohne Endung wie .com
  const hasBait = BAIT.some((w) => host.includes(w) || path.includes(w));
  for (const brand of BRANDS) {
    // Echte Domain nur vorne im Namen versteckt: discord.com.free-gift.ru
    if (brand.official.some((d) => host.includes(`${d}.`) || host.includes(`${d}-`))) return `getarnter Link ${host}`;
    const brandSkel = skeleton(brand.name);
    for (const raw of [...body, body.join("")]) {
      const plain = raw.replace(/[^a-z]/g, "");
      const skel = skeleton(raw);
      if (!skel) continue;
      if (skel === brandSkel && plain !== brand.name) return `Nachahmung von ${brand.name}: ${host}`;
      if (skel.includes(brandSkel) && skel !== brandSkel && hasBait) return `verdächtiger ${brand.name}-Link ${host}`;
      if (skel === brandSkel && hasBait && plain === brand.name && raw !== brand.name) return `verdächtiger ${brand.name}-Link ${host}`;
      // Tippfehler-Domains: gleich lang oder ein Zeichen kürzer, höchstens ein (bei langen Namen zwei) Fehler
      const max = brandSkel.length >= 10 ? 2 : 1;
      if (skel.length <= brandSkel.length && skel.length >= brandSkel.length - 1 && skel !== brandSkel) {
        const dist = editDistance(skel, brandSkel);
        if (dist <= max) return `Nachahmung von ${brand.name}: ${host}`;
      }
    }
  }
  if (host.includes("nitro") && /free|gift|claim|drop/.test(host + path)) return `verdächtiger Nitro-Link ${host}`;
  return null;
}

/** Prüft alle Links einer Nachricht. */
export function checkPhishing(content: string, blocked: string[] = []): string | null {
  for (const { host, path } of extractLinks(content)) {
    const reason = phishingReason(host, path, blocked);
    if (reason) return `Betrugsverdacht: ${reason}`;
  }
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
  if (previous.some((p) => p.status === "open")) return "Dein Einspruch liegt dem Team schon vor.";
  const lastDenied = previous
    .filter((p) => p.status === "denied")
    .map((p) => (p.reviewedAt ?? p.createdAt).getTime())
    .sort((a, b) => b - a)[0];
  if (lastDenied && now.getTime() - lastDenied < cooldownDays * 86_400_000) {
    const until = new Date(lastDenied + cooldownDays * 86_400_000);
    return `Dein letzter Einspruch wurde abgelehnt. Einen neuen kannst du ab ${until.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} stellen.`;
  }
  return null;
}
