import "server-only";
import { eq, instanceStatus, type InstanceStatus } from "@libremod/db";
import { database } from "./db";

/** Ab so vielen Sekunden ohne Meldung gilt der Bot als offline (er meldet sich alle 30 Sekunden). */
export const OFFLINE_AFTER_S = 120;
/** Ab so vielen Stunden ohne Sicherung gibt es einen Hinweis. */
export const BACKUP_WARN_H = 48;

export async function getInstanceStatus(): Promise<InstanceStatus | null> {
  const { db } = database();
  const [row] = await db
    .select()
    .from(instanceStatus)
    .where(eq(instanceStatus.id, 1));
  return row ?? null;
}

export const botOnline = (s: InstanceStatus | null, now = Date.now()) =>
  !!s?.heartbeatAt && now - s.heartbeatAt.getTime() < OFFLINE_AFTER_S * 1000;

/** Nur die Besitzer der Bot-Anwendung sehen den Zustand der Installation. */
export const isInstanceOwner = (s: InstanceStatus | null, userId: string) =>
  !!s?.ownerIds.includes(userId);

/** Der Update-Dienst auf dem Server meldet sich jede Minute. */
export const UPDATER_OFFLINE_AFTER_S = 180;

export const updaterOnline = (s: InstanceStatus | null, now = Date.now()) =>
  !!s?.updaterSeenAt && now - s.updaterSeenAt.getTime() < UPDATER_OFFLINE_AFTER_S * 1000;

/** Wartet ein angefordertes Update noch darauf, dass der Server es abholt? */
export const updatePending = (s: InstanceStatus | null) =>
  !!s?.updateRequestedAt &&
  (!s.updateStartedAt || s.updateRequestedAt > s.updateStartedAt);

/** Läuft gerade ein Update? Nach 30 Minuten ohne Abschluss gilt es als hängengeblieben. */
export const updateRunning = (s: InstanceStatus | null, now = Date.now()) =>
  !!s?.updateStartedAt &&
  (!s.updateFinishedAt || s.updateFinishedAt < s.updateStartedAt) &&
  now - s.updateStartedAt.getTime() < 30 * 60_000;
