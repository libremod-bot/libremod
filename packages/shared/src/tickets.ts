/**
 * Ticket-System: gemeinsame Logik für Bot und Dashboard.
 * Nachrichten-JSON, Komponenten-IDs, Kanalnamen und das HTML-Transkript.
 */

export const MAX_TICKET_CATEGORIES = 25;
export const MAX_TICKET_QUESTIONS = 5;
export const MAX_TICKET_PANELS = 10;
export const AUTO_CLOSE_OPTIONS = [0, 12, 24, 48, 72, 168] as const;

export interface TicketQuestionInput {
  label: string;
  placeholder: string;
  long: boolean;
  required: boolean;
}

// --- Komponenten-IDs ---

const PREFIX = "lmtk";
export type TicketAction = "open" | "pick" | "form" | "close" | "closeyes" | "closereason" | "closemodal" | "claim" | "rate";

export function ticketCustomId(action: TicketAction, ...args: (string | number)[]) {
  return [PREFIX, action, ...args].join(":");
}

export function parseTicketCustomId(customId: string): { action: TicketAction; args: number[] } | null {
  const m = /^lmtk:(open|pick|form|close|closeyes|closereason|closemodal|claim|rate)((?::\d{1,10}){0,2})$/.exec(customId);
  if (!m) return null;
  return { action: m[1] as TicketAction, args: m[2] ? m[2].slice(1).split(":").map(Number) : [] };
}

/** Emoji für eine Komponente: Unicode-Zeichen oder ID eines Server-Emojis. */
export function componentEmoji(emoji: string | null | undefined) {
  if (!emoji) return undefined;
  return /^\d{17,20}$/.test(emoji) ? { id: emoji } : { name: emoji };
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export interface PanelCategory {
  id: number;
  name: string;
  emoji: string | null;
  description: string;
}

/** Nachricht für POST/PATCH /channels/{id}/messages. */
export function buildTicketPanelMessage(
  panel: { id: number; title: string; description: string; color: number; style: "buttons" | "select" },
  categories: PanelCategory[],
) {
  const cats = categories.slice(0, MAX_TICKET_CATEGORIES);
  const embed = {
    title: clip(panel.title, 256),
    description: clip(panel.description.trim() || "Wähle unten aus, worum es geht. Es öffnet sich ein privater Bereich nur für dich und das Team.", 4000),
    color: panel.color,
  };
  let components: unknown[];
  if (panel.style === "buttons") {
    components = [];
    for (let i = 0; i < cats.length; i += 5) {
      components.push({
        type: 1,
        components: cats.slice(i, i + 5).map((c) => ({
          type: 2,
          style: cats.length === 1 ? 1 : 2,
          label: clip(c.name, 80),
          emoji: componentEmoji(c.emoji),
          custom_id: ticketCustomId("open", c.id),
        })),
      });
    }
  } else {
    components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: ticketCustomId("pick", panel.id),
            placeholder: "Worum geht es?",
            min_values: 1,
            max_values: 1,
            options: cats.map((c) => ({
              label: clip(c.name, 100),
              value: String(c.id),
              description: c.description ? clip(c.description, 100) : undefined,
              emoji: componentEmoji(c.emoji),
            })),
          },
        ],
      },
    ];
  }
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

// --- Texte ---

/** Kanalname aus der Vorlage, so wie Discord ihn akzeptiert (klein, ohne Leerzeichen, höchstens 100 Zeichen). */
export function ticketChannelName(template: string, v: { number: number; username: string; category: string }) {
  const raw = template
    .replace(/\{number\}/g, String(v.number).padStart(4, "0"))
    .replace(/\{username\}/g, v.username)
    .replace(/\{category\}/g, v.category);
  const name = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return name || `ticket-${String(v.number).padStart(4, "0")}`;
}

export const TICKET_PLACEHOLDERS = ["{user}", "{username}", "{server}", "{number}", "{category}"] as const;

export function renderTicketText(template: string, v: { userId: string; username: string; server: string; number: number; category: string }) {
  const map: Record<string, string> = {
    "{user}": `<@${v.userId}>`,
    "{username}": v.username,
    "{server}": v.server,
    "{number}": String(v.number),
    "{category}": v.category,
  };
  return template.replace(/\{(user|username|server|number|category)\}/g, (m) => map[m] ?? m);
}

export function ticketDuration(ms: number) {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} Std. ${min % 60} Min.` : `${h} Std.`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} Tage ${h % 24} Std.` : `${d} Tage`;
}

export function ratingStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

/** Fragen aus dem Dashboard-Formular prüfen und bereinigen. */
export function cleanQuestions(input: TicketQuestionInput[]): TicketQuestionInput[] {
  return input
    .map((q) => ({ label: q.label.trim().slice(0, 45), placeholder: q.placeholder.trim().slice(0, 100), long: q.long, required: q.required }))
    .filter((q) => q.label)
    .slice(0, MAX_TICKET_QUESTIONS);
}

// --- Transkript ---

export interface TranscriptEntry {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  bot: boolean;
  staff?: boolean;
  content: string;
  createdAt: Date;
  editedAt?: Date | null;
  attachments: { name: string; url: string; image: boolean }[];
  embeds: { title?: string; description?: string }[];
}

export interface TranscriptMeta {
  server: string;
  number: number;
  category: string;
  ownerName: string;
  openedAt: Date;
  closedAt: Date;
  closedByName: string;
  reason?: string | null;
  answers: { question: string; answer: string }[];
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

const safeUrl = (u: string) => (/^https:\/\//i.test(u) ? escapeHtml(u) : "#");

/** Escaped Text mit klickbaren Links und Zeilenumbrüchen. */
function richText(s: string) {
  return escapeHtml(s)
    .replace(/https:\/\/[^\s<]+[^\s<.,;:!?)'"&]/g, (u) => `<a href="${u}" rel="noreferrer noopener" target="_blank">${u}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

/** Eigenständige HTML-Seite ohne Skripte, auch ohne Internetverbindung lesbar (bis auf Bilder). */
export function formatTranscriptHtml(meta: TranscriptMeta, messages: TranscriptEntry[]) {
  const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const rows = sorted
    .map((m) => {
      const files = m.attachments
        .map((a) =>
          a.image
            ? `<a href="${safeUrl(a.url)}" target="_blank" rel="noreferrer noopener"><img src="${safeUrl(a.url)}" alt="${escapeHtml(a.name)}" loading="lazy"></a>`
            : `<a class="file" href="${safeUrl(a.url)}" target="_blank" rel="noreferrer noopener">📎 ${escapeHtml(a.name)}</a>`,
        )
        .join("");
      const embeds = m.embeds
        .filter((e) => e.title || e.description)
        .map((e) => `<div class="embed">${e.title ? `<strong>${escapeHtml(e.title)}</strong><br>` : ""}${e.description ? richText(e.description) : ""}</div>`)
        .join("");
      const avatar = m.authorAvatar ? `<img class="avatar" src="${safeUrl(m.authorAvatar)}" alt="">` : `<div class="avatar"></div>`;
      const tag = m.bot ? `<span class="tag">BOT</span>` : m.staff ? `<span class="tag staff">TEAM</span>` : "";
      return `<div class="msg">${avatar}<div class="body"><div class="head"><span class="name">${escapeHtml(m.authorName)}</span>${tag}<time>${dt.format(m.createdAt)}${m.editedAt ? " (bearbeitet)" : ""}</time></div>${m.content ? `<div class="text">${richText(m.content)}</div>` : ""}${embeds}${files ? `<div class="files">${files}</div>` : ""}</div></div>`;
    })
    .join("\n");
  const answers = meta.answers.length
    ? `<dl>${meta.answers.map((a) => `<dt>${escapeHtml(a.question)}</dt><dd>${richText(a.answer || "–")}</dd>`).join("")}</dl>`
    : "";
  const title = `Ticket #${meta.number} · ${meta.server}`;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark;--bg:#0f1218;--card:#171b23;--line:#262c38;--text:#e6e9ef;--muted:#8b93a3;--accent:#4cb4ff}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f6f7f9;--card:#fff;--line:#e2e5ea;--text:#1b1f27;--muted:#636b7a;--accent:#1677c9}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}
header{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:20px}
h1{font-size:20px;margin:0 0 8px}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px 18px;color:var(--muted);font-size:13px}
.meta b{color:var(--text);font-weight:600}dl{margin:14px 0 0;border-top:1px solid var(--line);padding-top:12px}dt{font-weight:600;font-size:13px;color:var(--muted)}dd{margin:2px 0 10px}
.msg{display:flex;gap:12px;padding:10px 4px;border-bottom:1px solid var(--line)}.avatar{width:36px;height:36px;border-radius:50%;flex:none;background:var(--line);object-fit:cover}
.body{min-width:0;flex:1}.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}.name{font-weight:600}time{color:var(--muted);font-size:12px}
.tag{font-size:10px;font-weight:700;background:var(--accent);color:#fff;border-radius:4px;padding:1px 5px}.tag.staff{background:#2f9e6a}
.text{overflow-wrap:anywhere}a{color:var(--accent)}code{background:var(--line);border-radius:4px;padding:0 4px}
.embed{border-left:3px solid var(--accent);background:var(--card);padding:8px 12px;border-radius:6px;margin-top:6px}
.files{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.files img{max-width:min(100%,360px);max-height:280px;border-radius:8px;display:block}
.file{display:inline-block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;text-decoration:none}
footer{color:var(--muted);font-size:12px;margin-top:20px;text-align:center}
</style></head><body><main>
<header><h1>${escapeHtml(title)}</h1><div class="meta">
<div>Art: <b>${escapeHtml(meta.category)}</b></div><div>Geöffnet von: <b>${escapeHtml(meta.ownerName)}</b></div>
<div>Geöffnet: <b>${dt.format(meta.openedAt)}</b></div><div>Geschlossen: <b>${dt.format(meta.closedAt)}</b></div>
<div>Geschlossen von: <b>${escapeHtml(meta.closedByName)}</b></div><div>Dauer: <b>${ticketDuration(meta.closedAt.getTime() - meta.openedAt.getTime())}</b></div>
${meta.reason ? `<div style="grid-column:1/-1">Grund: <b>${escapeHtml(meta.reason)}</b></div>` : ""}
</div>${answers}</header>
${rows || `<p style="color:var(--muted)">Keine Nachrichten.</p>`}
<footer>${sorted.length} Nachrichten · Transkript erstellt von Libremod</footer>
</main></body></html>`;
}
