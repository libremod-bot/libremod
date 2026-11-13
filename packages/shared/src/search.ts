/** Schnellsuche im Dashboard (Strg+K): Text vereinfachen und Treffer bewerten. */

/** Kleinschreibung, Umlaute vereinfacht, Akzente weg: „Übersicht“ findet man auch mit „ubersicht“. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type SearchEntry = { title: string; hint: string; href: string; haystack: string };

/** Punkte für einen Treffer: Titel zählt mehr als Stichwörter, ganze Wörter mehr als Wortteile. */
export function score(entry: SearchEntry, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = normalize(entry.title);
  let total = 0;
  for (const w of words) {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = new RegExp(`(^|[^a-z0-9])${esc}`);
    const whole = new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`);
    if (title.startsWith(w)) total += 10;
    else if (start.test(title)) total += 8;
    else if (whole.test(entry.haystack)) total += 6;
    else if (start.test(entry.haystack)) total += 4;
    else if (title.includes(w)) total += 3;
    else if (entry.haystack.includes(w)) total += 1;
    else return 0;
  }
  return total;
}
