/**
 * Vorschläge, Rollen mit Ablaufdatum und Zähl-Kanal: gemeinsame Logik für Bot und Dashboard.
 */

// --- Vorschläge ---

export type SuggestionStatusName = "open" | "considered" | "accepted" | "denied" | "implemented";

export const SUGGESTION_STATUS: Record<SuggestionStatusName, { label: string; color: number; emoji: string; voting: boolean }> = {
  open: { label: "Offen", color: 0x4cb4ff, emoji: "💡", voting: true },
  considered: { label: "Wird überlegt", color: 0xf5c542, emoji: "🤔", voting: true },
  accepted: { label: "Angenommen", color: 0x2ecc71, emoji: "✅", voting: false },
  denied: { label: "Abgelehnt", color: 0xe5534b, emoji: "❌", voting: false },
  implemented: { label: "Umgesetzt", color: 0x9b59b6, emoji: "🚀", voting: false },
};

export const SUGGESTION_STATUSES = Object.keys(SUGGESTION_STATUS) as SuggestionStatusName[];
export const MIN_SUGGESTION_LENGTH = 10;
export const MAX_SUGGESTION_LENGTH = 2000;

export function suggestionCustomId(action: "up" | "down", id: number) {
  return `lmsg:${action}:${id}`;
}

export function parseSuggestionCustomId(customId: string): { action: "up" | "down"; id: number } | null {
  const m = /^lmsg:(up|down):(\d{1,10})$/.exec(customId);
  return m ? { action: m[1] as "up" | "down", id: Number(m[2]) } : null;
}

/** Neue Stimme anwenden: gleicher Knopf nimmt die Stimme zurück, der andere wechselt sie. */
export function applyVote(previous: 1 | -1 | null, clicked: 1 | -1): { next: 1 | -1 | null; up: number; down: number } {
  const next = previous === clicked ? null : clicked;
  const delta = (v: 1 | -1 | null, which: 1 | -1) => (v === which ? 1 : 0);
  return { next, up: delta(next, 1) - delta(previous, 1), down: delta(next, -1) - delta(previous, -1) };
}

/** Balken wie ██████░░░░ 60 % für die Zustimmung. */
export function voteBar(up: number, down: number, width = 10): string {
  const total = up + down;
  if (!total) return "Noch keine Stimmen";
  const share = up / total;
  const filled = Math.round(share * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.round(share * 100)} % dafür`;
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export interface SuggestionView {
  id: number;
  number: number;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  text: string;
  status: SuggestionStatusName;
  statusReason: string | null;
  statusBy: string | null;
  up: number;
  down: number;
  createdAt: Date;
}

/** Nachricht für POST/PATCH /channels/{id}/messages und für discord.js. */
export function buildSuggestionMessage(s: SuggestionView, anonymous: boolean) {
  const st = SUGGESTION_STATUS[s.status];
  const fields = [{ name: "Abstimmung", value: voteBar(s.up, s.down), inline: false }];
  if (s.status !== "open") {
    const by = s.statusBy ? ` von <@${s.statusBy}>` : "";
    fields.push({ name: `${st.emoji} ${st.label}`, value: clip(`${s.statusReason?.trim() || "Ohne Begründung"}${by}`, 1024), inline: false });
  }
  const author = anonymous
    ? { name: "Anonymer Vorschlag" }
    : { name: clip(s.authorName ?? "Vorschlag", 256), ...(s.authorAvatar ? { icon_url: s.authorAvatar } : {}) };
  return {
    embeds: [
      {
        author,
        title: `Vorschlag #${s.number}`,
        description: clip(s.text, 4000),
        color: st.color,
        fields,
        footer: { text: `${st.label}${anonymous ? "" : ` · von ${s.authorId}`}` },
        timestamp: s.createdAt.toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, custom_id: suggestionCustomId("up", s.id), label: String(s.up), emoji: { name: "👍" }, disabled: !st.voting },
          { type: 2, style: 4, custom_id: suggestionCustomId("down", s.id), label: String(s.down), emoji: { name: "👎" }, disabled: !st.voting },
        ],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

// --- Rollen mit Ablaufdatum ---

export const MAX_TEMP_ROLE_SECONDS = 366 * 24 * 60 * 60;

/** Neues Ablaufdatum: Läuft schon eine Zeit, wird verlängert, sonst ab jetzt gerechnet. */
export function extendExpiry(current: Date | null, seconds: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + seconds * 1000);
}

// --- Zähl-Kanal ---

/** Liest die Zahl am Anfang einer Nachricht („42“, „42 yay“, „1.000“). Null, wenn keine da ist. */
export function parseCount(content: string): number | null {
  const m = /^\s*(\d{1,3}(?:[.\s']\d{3})+|\d{1,9})(?!\d)/.exec(content);
  if (!m) return null;
  const n = Number(m[1]!.replace(/[.\s']/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}

export type CountResult = "ok" | "wrong" | "twice" | "late";

/**
 * Bewertet eine Zahl. `late` heißt: dieselbe Zahl kam schon, kein echter Fehler.
 */
export function judgeCount(
  state: { current: number; lastUserId: string | null; allowSameUser: boolean },
  userId: string,
  n: number,
): CountResult {
  // Dieselbe Zahl wie gerade eben: jemand war schneller oder es wurde doppelt abgeschickt.
  if (n === state.current && state.current > 0) return "late";
  if (n !== state.current + 1) return "wrong";
  if (!state.allowSameUser && state.lastUserId === userId) return "twice";
  return "ok";
}

/** Meilensteine bekommen ein besonderes Emoji. */
export function countReaction(n: number): string {
  if (n % 1000 === 0) return "🏆";
  if (n % 100 === 0) return "💯";
  return "✅";
}
