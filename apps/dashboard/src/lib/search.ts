import type { AreaKey } from "./areas";
import keywords from "./search-keywords.json";

/**
 * Suchbegriffe pro Bereich für die Schnellsuche (Strg+K), in search-keywords.json. Beide Sprachen stehen dort nebeneinander,
 * damit man auch mit dem Wort findet, das man im Kopf hat, egal welche Sprache eingestellt ist.
 */
export const AREA_KEYWORDS: Record<AreaKey, string> = keywords;

export { normalize, score, type SearchEntry } from "@libremod/shared/search";
