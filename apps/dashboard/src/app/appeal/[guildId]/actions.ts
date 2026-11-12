"use server";

import { redirect } from "next/navigation";
import { and, appealSettings, banAppeals, eq } from "@libremod/db";
import { APPEAL_MAX_LENGTH, APPEAL_MIN_LENGTH, appealBlocker } from "@libremod/shared";
import { database } from "@/lib/db";
import { env } from "@/lib/env";
import { getBan, sendBotMessage } from "@/lib/discord";
import { getUser } from "@/lib/session";
import { t } from "@/lib/i18n";

/** Reicht einen Einspruch ein. Prüft alles noch einmal, die Seite allein ist kein Schutz. */
export async function submitAppeal(guildId: string, form: FormData) {
  if (!/^\d{17,20}$/.test(guildId)) redirect("/");
  const path = `/appeal/${guildId}`;
  const session = await getUser();
  if (!session) redirect(`/api/auth/login?weiter=${encodeURIComponent(path)}`);
  const fail = (msg: string): never => redirect(`${path}?fehler=${encodeURIComponent(msg)}`);

  const text = String(form.get("text") ?? "").trim();
  if (text.length < APPEAL_MIN_LENGTH) fail(t("Bitte schreib mindestens {APPEAL_MIN_LENGTH} Zeichen.", { APPEAL_MIN_LENGTH }));
  if (text.length > APPEAL_MAX_LENGTH) fail(t("Höchstens {APPEAL_MAX_LENGTH} Zeichen.", { APPEAL_MAX_LENGTH }));

  const { db } = database();
  const [s] = await db.select().from(appealSettings).where(eq(appealSettings.guildId, guildId));
  if (!s?.enabled) fail(t("Auf diesem Server sind Einsprüche ausgeschaltet."));
  if (!(await getBan(guildId, session.user.id))) fail(t("Du bist auf diesem Server nicht gebannt."));
  const previous = await db
    .select({ status: banAppeals.status, reviewedAt: banAppeals.reviewedAt, createdAt: banAppeals.createdAt })
    .from(banAppeals)
    .where(and(eq(banAppeals.guildId, guildId), eq(banAppeals.userId, session.user.id)));
  const blocker = appealBlocker(previous, s!.cooldownDays);
  if (blocker) fail(blocker);

  const [row] = await db
    .insert(banAppeals)
    .values({ guildId, userId: session.user.id, userName: session.user.username.slice(0, 100), text })
    .onConflictDoNothing()
    .returning();
  if (!row) fail(t("Dein Einspruch liegt dem Team schon vor."));

  if (s!.channelId) {
    await sendBotMessage(s!.channelId, {
      embeds: [
        {
          title: t("Neuer Einspruch gegen einen Ban"),
          description: `<@${session.user.id}> (${session.user.username}, ${session.user.id})\n\n>>> ${text.slice(0, 3500)}`,
          color: 0x4cb4ff,
          footer: { text: t("Einspruch #{id}", { id: row!.id }) },
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        { type: 1, components: [{ type: 2, style: 5, label: t("Im Dashboard entscheiden"), url: `${env.dashboardUrl}/servers/${guildId}/appeals` }] },
      ],
      allowed_mentions: { parse: [] },
    }).catch(() => {});
  }
  redirect(`${path}?gesendet=1`);
}
