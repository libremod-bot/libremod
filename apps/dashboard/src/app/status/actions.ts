"use server";

import { redirect } from "next/navigation";
import { eq, instanceStatus } from "@libremod/db";
import { isAutoUpdateHours } from "@libremod/shared";
import { database } from "@/lib/db";
import {
  getInstanceStatus,
  isInstanceOwner,
  updatePending,
  updateRunning,
  updaterOnline,
} from "@/lib/instance";
import { getUser } from "@/lib/session";
import { t } from "@/lib/i18n";

function back(error?: string): never {
  redirect(error ? `/status?fehler=${encodeURIComponent(error)}` : "/status?gespeichert=1");
}

/** Nur Besitzer der Bot-Anwendung dürfen die Installation verwalten. */
async function requireOwner() {
  const session = await getUser();
  if (!session) redirect("/");
  const status = await getInstanceStatus();
  if (!isInstanceOwner(status, session.user.id)) back(t("Das dürfen nur die Besitzer der Bot-Anwendung."));
  return { status: status!, userId: session.user.id };
}

/** Update anfordern. Der Update-Dienst auf dem Server holt es innerhalb einer Minute ab. */
export async function requestUpdate() {
  const { status, userId } = await requireOwner();
  if (!updaterOnline(status))
    back(t("Der Update-Dienst auf dem Server meldet sich nicht. Bitte einmal „libremod update“ auf dem Server ausführen."));
  if (updatePending(status) || updateRunning(status)) back(t("Es läuft schon ein Update."));
  const { db } = database();
  await db
    .update(instanceStatus)
    .set({ updateRequestedAt: new Date(), updateRequestedBy: userId })
    .where(eq(instanceStatus.id, 1));
  redirect("/status?angefordert=1#updates");
}

export async function saveAutoUpdate(form: FormData) {
  await requireOwner();
  const hours = Number(form.get("hours"));
  if (!isAutoUpdateHours(hours)) back(t("Ungültige Auswahl."));
  const { db } = database();
  await db.update(instanceStatus).set({ autoUpdateHours: hours }).where(eq(instanceStatus.id, 1));
  back();
}
