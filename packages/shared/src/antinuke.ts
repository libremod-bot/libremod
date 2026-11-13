/**
 * Anti-Nuke: zählt zerstörerische Aktionen pro Person (Kanäle/Rollen löschen, bannen, kicken)
 * in einem gleitenden Fenster. Rein und ohne Discord, damit es sich testen lässt.
 */

export const NUKE_KINDS = ["channelDelete", "roleDelete", "ban", "kick", "webhookCreate"] as const;
export type NukeKind = (typeof NUKE_KINDS)[number];

export const ANTINUKE_ACTIONS = ["alert", "strip", "kick", "ban"] as const;
export type AntinukeAction = (typeof ANTINUKE_ACTIONS)[number];

export const ANTINUKE_WINDOW_MS = 60_000;
export const ANTINUKE_MIN = 2;
export const ANTINUKE_MAX = 50;

export class NukeTracker {
  private hits = new Map<string, { at: number; kind: NukeKind }[]>();
  /** Wer schon ausgelöst hat, löst im selben Fenster nicht noch einmal aus. */
  private fired = new Map<string, number>();

  /**
   * Zählt eine Aktion. Gibt die Aktionen im Fenster zurück, sobald es mehr als `threshold` sind
   * (einmal pro Person und Fenster), sonst null.
   */
  record(guildId: string, userId: string, kind: NukeKind, threshold: number, now = Date.now()): { kind: NukeKind; at: number }[] | null {
    const key = `${guildId}:${userId}`;
    const list = (this.hits.get(key) ?? []).filter((h) => now - h.at < ANTINUKE_WINDOW_MS);
    list.push({ at: now, kind });
    this.hits.set(key, list);
    if (list.length <= threshold) return null;
    const last = this.fired.get(key);
    if (last !== undefined && now - last < ANTINUKE_WINDOW_MS) return null;
    this.fired.set(key, now);
    return list;
  }

  sweep(now = Date.now()) {
    for (const [k, list] of this.hits) if (list.every((h) => now - h.at >= ANTINUKE_WINDOW_MS)) this.hits.delete(k);
    for (const [k, at] of this.fired) if (now - at >= ANTINUKE_WINDOW_MS) this.fired.delete(k);
  }
}

/** Kurze Zusammenfassung wie „3× Kanal gelöscht, 2× Ban“ (Schlüssel für die Übersetzung). */
export function summarizeNuke(list: { kind: NukeKind }[]): { kind: NukeKind; n: number }[] {
  const counts = new Map<NukeKind, number>();
  for (const h of list) counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
  return NUKE_KINDS.filter((k) => counts.has(k)).map((kind) => ({ kind, n: counts.get(kind)! }));
}
