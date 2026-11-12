import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Status, Team, type Client } from "discord.js";
import { instanceStatus, sql, type Db } from "@libremod/db";
import { logger } from "../logger.js";
import { externalPhishingInfo } from "./phishlists.js";

const require = createRequire(import.meta.url);
export const VERSION: string = (
  require("../../package.json") as { version: string }
).version;

/** Datei für den Docker-Healthcheck (siehe health.ts). */
export const HEARTBEAT_FILE = "/tmp/libremod-heartbeat";

const startedAt = new Date();
let ownerIds: string[] | undefined;
let ownersFetchedAt = 0;

/** Besitzer der Bot-Anwendung (bzw. Team-Mitglieder). Nur sie sehen die Statusseite im Dashboard. */
async function owners(client: Client): Promise<string[] | undefined> {
  if (ownerIds && Date.now() - ownersFetchedAt < 60 * 60_000) return ownerIds;
  try {
    const app = await client.application?.fetch();
    const owner = app?.owner;
    if (owner instanceof Team) ownerIds = [...owner.members.keys()];
    else if (owner) ownerIds = [owner.id];
    ownersFetchedAt = Date.now();
  } catch (err) {
    logger.debug({ err }, "Bot-Besitzer konnten nicht geladen werden");
  }
  return ownerIds;
}

/** Meldet den Zustand in die Datenbank (für die Statusseite) und in eine Datei (für Docker). */
export async function beat(client: Client, db: Db) {
  const ready = client.ws.status === Status.Ready;
  if (ready) {
    try {
      writeFileSync(HEARTBEAT_FILE, String(Date.now()));
    } catch {
      /* z. B. schreibgeschütztes Dateisystem: nur die Statusseite fällt weg */
    }
  }
  const values = {
    version: VERSION,
    startedAt,
    heartbeatAt: ready ? new Date() : undefined,
    guilds: client.guilds.cache.size,
    pingMs: Math.max(0, Math.round(client.ws.ping)),
    phishingDomains: externalPhishingInfo().domains,
    ...(ready ? { ownerIds: await owners(client) } : {}),
  };
  await db
    .insert(instanceStatus)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: instanceStatus.id,
      set: {
        ...values,
        heartbeatAt: ready ? new Date() : sql`${instanceStatus.heartbeatAt}`,
      },
    });
}

/** So lange darf die Verbindung zu Discord fehlen, bevor sich der Bot beendet und Docker ihn neu startet. */
const WATCHDOG_MS = 10 * 60_000;
let lastReady = Date.now();

export function startHeartbeat(client: Client, db: Db): NodeJS.Timeout {
  const run = () => {
    if (client.ws.status === Status.Ready) lastReady = Date.now();
    else if (Date.now() - lastReady > WATCHDOG_MS) {
      logger.error(
        "Seit 10 Minuten keine Verbindung zu Discord, Bot startet neu",
      );
      process.exit(1);
    }
    void beat(client, db).catch((err) =>
      logger.warn({ err }, "Statusmeldung fehlgeschlagen"),
    );
  };
  run();
  return setInterval(run, 30_000);
}
