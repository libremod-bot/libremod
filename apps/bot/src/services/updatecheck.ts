import { instanceStatus, type Db } from "@libremod/db";
import { parseRelease } from "@libremod/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Sieht einmal am Tag bei GitHub nach, ob es eine neue Libremod-Version gibt, und trägt sie
 * in die Datenbank ein. Das Dashboard zeigt dann „Update verfügbar“. Gesendet wird dabei nur
 * die Anfrage selbst, keine Angaben zu Servern oder Nutzern.
 */
const CHECK_MS = 24 * 60 * 60_000;
const FIRST_CHECK_MS = 2 * 60_000;
const TIMEOUT_MS = 20_000;

export async function checkForUpdate(db: Db, fetcher: typeof fetch = fetch) {
  const res = await fetcher(
    `https://api.github.com/repos/${config.LIBREMOD_REPO}/releases/latest`,
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Libremod", accept: "application/vnd.github+json" },
    },
  );
  // 404: noch kein Release veröffentlicht. Das ist kein Fehler.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const release = parseRelease(await res.json());
  if (!release) return null;
  const values = {
    latestVersion: release.version,
    latestUrl: release.url,
    latestCheckedAt: new Date(),
  };
  await db
    .insert(instanceStatus)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: instanceStatus.id, set: values });
  return release;
}

/** Mit UPDATE_CHECK=off in der .env bleibt die Prüfung aus. */
export function startUpdateCheck(db: Db): NodeJS.Timeout | undefined {
  if (!config.UPDATE_CHECK) return undefined;
  const run = () =>
    void checkForUpdate(db)
      .then((r) => r && logger.debug({ latest: r.version }, "Update-Prüfung"))
      .catch((err) =>
        logger.warn({ err: String(err) }, "Update-Prüfung fehlgeschlagen"),
      );
  setTimeout(run, FIRST_CHECK_MS).unref();
  const timer = setInterval(run, CHECK_MS);
  timer.unref();
  return timer;
}
