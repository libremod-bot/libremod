/** Gestaltung von Embeds (Karten) für Nachrichten, die im Dashboard bearbeitet werden. */

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedDesign {
  title?: string;
  /** Farbe als Zahl, z. B. 0x4cb4ff */
  color?: number;
  authorName?: string;
  footer?: string;
  /** Großes Bild unten (https-Adresse) */
  imageUrl?: string;
  /** Kleines Bild oben rechts: Profilbild der Person, keins oder eine eigene Adresse */
  thumbnail?: "avatar" | "none" | "url";
  thumbnailUrl?: string;
  fields?: EmbedField[];
  /** Uhrzeit unten anzeigen */
  timestamp?: boolean;
}

export const EMBED_LIMITS = {
  title: 256,
  author: 256,
  footer: 2048,
  description: 4096,
  fields: 10,
  fieldName: 256,
  fieldValue: 1024,
  url: 500,
} as const;

export const DEFAULT_EMBED_COLOR = 0x4cb4ff;

const isHttpsUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !!url.hostname && u.length <= EMBED_LIMITS.url;
  } catch {
    return false;
  }
};

const str = (v: unknown, max: number, what: string): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error(`${what} ist ungültig.`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${what} darf höchstens ${max} Zeichen lang sein.`);
  return s || undefined;
};

/**
 * Prüft eine Gestaltung aus dem Dashboard (JSON). Gibt die bereinigte Gestaltung oder eine Fehlermeldung zurück.
 * Leere Felder fallen weg.
 */
export function cleanEmbedDesign(raw: unknown): EmbedDesign | string {
  if (raw === undefined || raw === null || raw === "") return {};
  let data: Record<string, unknown>;
  try {
    data = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    return "Die Karten-Gestaltung konnte nicht gelesen werden.";
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Die Karten-Gestaltung ist ungültig.";
  try {
    const out: EmbedDesign = {};
    const title = str(data.title, EMBED_LIMITS.title, "Die Überschrift");
    if (title) out.title = title;
    const author = str(data.authorName, EMBED_LIMITS.author, "Die Zeile über der Überschrift");
    if (author) out.authorName = author;
    const footer = str(data.footer, EMBED_LIMITS.footer, "Die Fußzeile");
    if (footer) out.footer = footer;
    if (data.color !== undefined && data.color !== null) {
      const c = Number(data.color);
      if (!Number.isInteger(c) || c < 0 || c > 0xffffff) return "Die Farbe ist ungültig.";
      out.color = c;
    }
    const image = str(data.imageUrl, EMBED_LIMITS.url, "Die Bild-Adresse");
    if (image) {
      if (!isHttpsUrl(image)) return "Die Bild-Adresse muss mit https:// beginnen.";
      out.imageUrl = image;
    }
    if (data.thumbnail === "none" || data.thumbnail === "avatar" || data.thumbnail === "url") out.thumbnail = data.thumbnail;
    if (out.thumbnail === "url") {
      const t = str(data.thumbnailUrl, EMBED_LIMITS.url, "Die Adresse des kleinen Bildes");
      if (!t || !isHttpsUrl(t)) return "Das kleine Bild braucht eine Adresse, die mit https:// beginnt.";
      out.thumbnailUrl = t;
    }
    if (data.timestamp === true) out.timestamp = true;
    if (data.fields !== undefined) {
      if (!Array.isArray(data.fields)) return "Die Felder sind ungültig.";
      if (data.fields.length > EMBED_LIMITS.fields) return `Höchstens ${EMBED_LIMITS.fields} Felder.`;
      const fields: EmbedField[] = [];
      for (const f of data.fields as Record<string, unknown>[]) {
        const name = str(f?.name, EMBED_LIMITS.fieldName, "Ein Feldname");
        const value = str(f?.value, EMBED_LIMITS.fieldValue, "Ein Feldinhalt");
        if (!name && !value) continue;
        if (!name || !value) return "Jedes Feld braucht einen Namen und einen Inhalt.";
        fields.push({ name, value, ...(f.inline === true ? { inline: true } : {}) });
      }
      if (fields.length) out.fields = fields;
    }
    return out;
  } catch (err) {
    return (err as Error).message;
  }
}

/** Embed im Format der Discord-API (funktioniert auch mit discord.js). */
export interface EmbedJson {
  title?: string;
  description?: string;
  color?: number;
  author?: { name: string };
  footer?: { text: string };
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: EmbedField[];
  timestamp?: string;
}

/**
 * Baut das Embed. `render` ersetzt Platzhalter in allen Texten, `avatarUrl` wird für thumbnail „avatar“ genutzt.
 * `defaults` gilt für ältere Einstellungen ohne Gestaltung (z. B. Profilbild bei Begrüßungen).
 */
export function buildEmbedJson(
  design: EmbedDesign | null | undefined,
  description: string,
  opts: { render?: (s: string) => string; avatarUrl?: string; defaults?: EmbedDesign; now?: Date } = {},
): EmbedJson {
  const d: EmbedDesign = { ...opts.defaults, ...(design ?? {}) };
  const r = opts.render ?? ((s: string) => s);
  const e: EmbedJson = { color: d.color ?? DEFAULT_EMBED_COLOR };
  const text = r(description).slice(0, EMBED_LIMITS.description);
  if (text.trim()) e.description = text;
  if (d.title) e.title = r(d.title).slice(0, EMBED_LIMITS.title);
  if (d.authorName) e.author = { name: r(d.authorName).slice(0, EMBED_LIMITS.author) };
  if (d.footer) e.footer = { text: r(d.footer).slice(0, EMBED_LIMITS.footer) };
  if (d.imageUrl) e.image = { url: d.imageUrl };
  if (d.thumbnail === "avatar" && opts.avatarUrl) e.thumbnail = { url: opts.avatarUrl };
  if (d.thumbnail === "url" && d.thumbnailUrl) e.thumbnail = { url: d.thumbnailUrl };
  if (d.fields?.length)
    e.fields = d.fields.slice(0, EMBED_LIMITS.fields).map((f) => ({
      name: r(f.name).slice(0, EMBED_LIMITS.fieldName),
      value: r(f.value).slice(0, EMBED_LIMITS.fieldValue),
      ...(f.inline ? { inline: true } : {}),
    }));
  if (d.timestamp) e.timestamp = (opts.now ?? new Date()).toISOString();
  // Ein Embed ganz ohne Inhalt lehnt Discord ab.
  if (!e.description && !e.title && !e.fields?.length && !e.image && !e.author) e.description = "​";
  return e;
}

export const colorToHex = (c: number | null | undefined, fallback = DEFAULT_EMBED_COLOR) => `#${(c ?? fallback).toString(16).padStart(6, "0")}`;
export const hexToColor = (h: string): number | undefined => (/^#[0-9a-f]{6}$/i.test(h) ? parseInt(h.slice(1), 16) : undefined);
