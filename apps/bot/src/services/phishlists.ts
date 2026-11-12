import { DomainList, parseDomainList } from "@libremod/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";

/**
 * Öffentliche Betrugslink-Listen. Der Bot lädt sie nur herunter und gleicht Links
 * lokal ab. Es wird nie etwas an die Listen gesendet: keine Nachrichten, keine Nutzer, keine Server.
 */
export const PHISHING_LISTS = [
  {
    name: "discord-phishing-links (nikolaischunk, MIT)",
    url: "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json",
  },
  {
    name: "Discord-Phishing-URLs (Dogino, Unlicense)",
    url: "https://raw.githubusercontent.com/Dogino/Discord-Phishing-URLs/main/scam-urls.txt",
  },
] as const;

const REFRESH_MS = 6 * 60 * 60_000;
const RETRY_MS = 15 * 60_000;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

let current = new DomainList();
let lastLoaded: Date | null = null;

/** Aktuelle Liste (leer, solange noch nichts geladen wurde oder die Listen abgeschaltet sind). */
export const externalPhishingList = () => current;
export const externalPhishingInfo = () => ({
  domains: current.size,
  loadedAt: lastLoaded,
});

/** Für Tests: Liste direkt setzen. */
export function setExternalPhishingList(domains: Iterable<string>) {
  current = new DomainList(domains);
  lastLoaded = new Date();
}

async function download(url: string, fetcher: typeof fetch): Promise<string> {
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Nur ein schlichter Download: keine Cookies, keine Angaben zu Servern oder Nutzern.
    headers: {
      "user-agent": "Libremod",
      accept: "text/plain, application/json",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(t("HTTP {status}", { status: res.status }));
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) throw new Error(t("Liste zu groß"));
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(t("Liste zu groß"));
  return text;
}

/**
 * Lädt alle Listen neu. Schlägt eine fehl, bleiben ihre bisherigen Einträge erhalten,
 * damit ein kurzer Ausfall von GitHub den Schutz nicht abschaltet.
 */
const perList = new Map<string, string[]>();
export async function refreshPhishingLists(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  let ok = true;
  await Promise.all(
    PHISHING_LISTS.map(async (l) => {
      try {
        const domains = parseDomainList(await download(l.url, fetcher));
        if (domains.length) perList.set(l.url, domains);
        else throw new Error(t("Liste leer"));
      } catch (err) {
        ok = false;
        logger.warn(
          { err: String(err), list: l.name },
          "Betrugslink-Liste konnte nicht geladen werden",
        );
      }
    }),
  );
  if (perList.size) {
    current = new DomainList([...perList.values()].flat());
    lastLoaded = new Date();
    logger.info({ domains: current.size }, "Betrugslink-Listen geladen");
  }
  return ok;
}

/** Startet das regelmäßige Nachladen. Mit PHISHING_LISTS=off in der .env bleibt alles aus. */
export function startPhishingLists(): NodeJS.Timeout | undefined {
  if (!config.PHISHING_LISTS) return undefined;
  const run = () =>
    void refreshPhishingLists()
      .catch(() => false)
      .then((ok) => {
        // Beim ersten Mal nichts bekommen: nicht 6 Stunden warten.
        if (!ok && !perList.size)
          setTimeout(
            () => void refreshPhishingLists().catch(() => false),
            RETRY_MS,
          ).unref();
      });
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
  run();
  return timer;
}
