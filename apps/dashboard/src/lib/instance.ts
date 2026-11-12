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
