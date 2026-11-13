/** Versionsnummern wie „0.19.0“ oder „v0.20“ vergleichen und Updates erkennen. */

/** Zerlegt „v1.2.3“ in [1, 2, 3]. Liefert null für alles, was keine Versionsnummer ist (z. B. „latest“). */
export function parseVersion(input: string): number[] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(input.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** Ist `latest` neuer als `current`? Bei unbekannten Versionen nein. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

/** Erlaubte Abstände für automatische Updates in Stunden (0 = aus). */
export const AUTO_UPDATE_HOURS = [0, 24, 48] as const;
export type AutoUpdateHours = (typeof AUTO_UPDATE_HOURS)[number];
export const isAutoUpdateHours = (n: unknown): n is AutoUpdateHours =>
  AUTO_UPDATE_HOURS.includes(n as AutoUpdateHours);

/** Antwort von GitHub (releases/latest) auf das Nötige reduzieren. */
export function parseRelease(body: unknown): { version: string; url: string } | null {
  if (!body || typeof body !== "object") return null;
  const r = body as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
  if (r.draft || r.prerelease || typeof r.tag_name !== "string") return null;
  const parsed = parseVersion(r.tag_name);
  if (!parsed) return null;
  const url = typeof r.html_url === "string" && r.html_url.startsWith("https://github.com/") ? r.html_url : "";
  return { version: parsed.join("."), url };
}
