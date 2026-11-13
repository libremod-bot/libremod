/** Vergleich von Einstellungs-Ständen für „Rückgängig“ im Änderungsprotokoll. */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/** Tabellenname → Zeilen (ohne Server-ID und Laufzeit-Zustand). */
export type Snapshot = Record<string, Row[]>;

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

/**
 * Nur das, was sich wirklich geändert hat. guildSettings teilen sich mehrere Bereiche: Dort zählen nur die
 * geänderten Spalten, damit Rückgängig keine Einstellungen eines anderen Bereichs zurückdreht.
 * Ergebnis null: nichts geändert.
 */
export function diffSnapshots(before: Snapshot | null, after: Snapshot | null): { before: Snapshot; after: Snapshot } | null {
  if (!before || !after) return null;
  const b: Snapshot = {};
  const a: Snapshot = {};
  for (const name of Object.keys(after)) {
    const x = before[name] ?? [];
    const y = after[name] ?? [];
    if (stable(x) === stable(y)) continue;
    if (name === "guildSettings") {
      const ox = x[0] ?? {};
      const oy = y[0] ?? {};
      const keys = [...new Set([...Object.keys(ox), ...Object.keys(oy)])].filter((k) => stable(ox[k]) !== stable(oy[k]));
      if (!keys.length) continue;
      b[name] = [Object.fromEntries(keys.map((k) => [k, ox[k] ?? null]))];
      a[name] = [Object.fromEntries(keys.map((k) => [k, oy[k] ?? null]))];
    } else {
      b[name] = x;
      a[name] = y;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Steht der Bereich noch genau so da wie direkt nach der Änderung? */
export function stillAsAfter(current: Snapshot, after: Snapshot): boolean {
  for (const [name, rows] of Object.entries(after)) {
    const now = current[name] ?? [];
    if (name === "guildSettings") {
      const want = rows[0] ?? {};
      const have = now[0] ?? {};
      if (Object.keys(want).some((k) => stable(have[k] ?? null) !== stable(want[k]))) return false;
    } else if (stable(now) !== stable(rows)) return false;
  }
  return true;
}

