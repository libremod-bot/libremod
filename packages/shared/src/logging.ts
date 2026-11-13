/** Hilfsfunktionen für das Logging-Modul, unabhängig von discord.js. */

/** Kürzt Text auf max Zeichen und hängt bei Bedarf „…“ an. Leerer Text wird zu fallback. */
import { intlLocale, t } from "./i18n.js";
export function truncate(text: string | null | undefined, max: number, fallback = "(leer)"): string {
  const value = (text ?? "").trim();
  if (!value) return fallback;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Vergleicht zwei Listen von IDs und liefert, was hinzugekommen und was weggefallen ist. */
export function diffIds(before: Iterable<string>, after: Iterable<string>): { added: string[]; removed: string[] } {
  const a = new Set(before);
  const b = new Set(after);
  return {
    added: [...b].filter((id) => !a.has(id)),
    removed: [...a].filter((id) => !b.has(id)),
  };
}

export interface TranscriptMessage {
  createdAt: Date;
  authorTag: string;
  authorId: string;
  content: string;
  attachments?: string[];
}

const transcriptTime = {
  format: (d: Date) => new Intl.DateTimeFormat(intlLocale(), { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(d),
};

/** Baut eine Textdatei aus gelöschten Nachrichten, älteste zuerst. */
export function formatTranscript(messages: TranscriptMessage[]): string {
  return [...messages]
    .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
    .map((m) => {
      const files = m.attachments?.length ? t("\n    Anhänge: {n0}", { n0: m.attachments.join(", ") }) : "";
      return `[${transcriptTime.format(m.createdAt)}] ${m.authorTag} (${m.authorId}): ${m.content || t("(kein Text)")}${files}`;
    })
    .join("\n");
}

/** Konten, die jünger sind als das, werden beim Beitritt markiert. */
export const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewAccount(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() < NEW_ACCOUNT_MS;
}
