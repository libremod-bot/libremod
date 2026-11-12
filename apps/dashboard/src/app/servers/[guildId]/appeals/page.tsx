import { and, appealSettings, banAppeals, count, desc, eq } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { env } from "@/lib/env";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getMembers } from "@/lib/discord";
import { decideAppeal, saveAppealSettings } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Einsprüche") }) };
}

const when = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
const STATUS: Record<string, { label: string; badge: string }> = {
  open: { label: "Offen", badge: "info" },
  accepted: { label: "Angenommen", badge: "on" },
  denied: { label: "Abgelehnt", badge: "danger" },
};

export default async function AppealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string; alle?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "appeals");
  const { gespeichert, fehler, alle } = await searchParams;
  const { db } = database();
  const [[s], rows, [{ open } = { open: 0 }], channels] = await Promise.all([
    db.select().from(appealSettings).where(eq(appealSettings.guildId, guildId)),
    db
      .select()
      .from(banAppeals)
      .where(alle ? eq(banAppeals.guildId, guildId) : and(eq(banAppeals.guildId, guildId), eq(banAppeals.status, "open")))
      .orderBy(desc(banAppeals.createdAt))
      .limit(50),
    db.select({ open: count() }).from(banAppeals).where(and(eq(banAppeals.guildId, guildId), eq(banAppeals.status, "open"))),
    getGuildChannels(guildId),
  ]);
  const reviewers = await getMembers(guildId, [...new Set(rows.flatMap((r) => (r.reviewerId ? [r.reviewerId] : [])))]);
  const reviewer = (id: string) => reviewers.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const link = `${env.dashboardUrl}/appeal/${guildId}`;

  return (
    <>
      <PageHeader
        icon="mail"
        title={t("Einsprüche")}
        description={t("Gebannte Personen können über eine eigene Seite Einspruch einlegen. Ihr entscheidet hier, bei Annahme hebt Libremod den Ban auf.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveAppealSettings.bind(null, guildId)} className="card">
        <Switch
          name="enabled"
          defaultChecked={s?.enabled ?? false}
          label={t("Einsprüche annehmen")}
          description={t("Der Link steht dann auch in der Direktnachricht, die Gebannte bekommen (wenn Direktnachrichten unter Moderation an sind).")}
        />
        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="appealLink">{t("Link zum Einspruch")}</label>
          <input id="appealLink" type="text" readOnly value={link} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="channelId">{t("Neue Einsprüche melden in")}</label>
            <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
              <option value="">{t("Nirgends")}</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cooldownDays">{t("Wartezeit nach Ablehnung (Tage)")}</label>
            <input id="cooldownDays" name="cooldownDays" type="number" min={0} max={365} defaultValue={s?.cooldownDays ?? 30} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="question">{t("Frage an die gebannte Person")}</label>
          <input id="question" name="question" type="text" maxLength={300} defaultValue={s?.question ?? t("Warum sollten wir deinen Ban aufheben?")} />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">{t("Speichern")}</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="mail" />
          <h2>{alle ? t("Alle Einsprüche") : t("Offene Einsprüche")}</h2>
          <a className="small" href={alle ? "?" : "?alle=1"} style={{ marginLeft: "auto" }}>
            {alle ? t("Nur offene ({open})", { open }) : t("Alle anzeigen")}
          </a>
        </div>
        {rows.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {alle ? t("Noch keine Einsprüche.") : t("Gerade liegt kein Einspruch vor.")}
          </p>
        ) : (
          <ul className="notes appeal-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="suggestion-head">
                  <strong>{r.userName}</strong>
                  <span className="small muted">{r.userId}</span>
                  <span className={`badge ${STATUS[r.status]?.badge ?? ""}`}>{STATUS[r.status] ? t(STATUS[r.status].label) : r.status}</span>
                  <span className="small muted">{when.format(r.createdAt)}</span>
                </div>
                <div className="quote-text" style={{ fontStyle: "normal" }}>
                  {r.text}
                </div>
                {r.status === "open" ? (
                  <form className="inline-form" style={{ marginTop: ".6rem" }}>
                    <input name="reason" type="text" maxLength={500} placeholder={t("Begründung (optional, geht an die Person)")} aria-label={t("Begründung")} />
                    <button className="small" type="submit" formAction={decideAppeal.bind(null, guildId, r.id, true)}>
                      {t("Annehmen und entbannen")}</button>
                    <button className="danger small" type="submit" formAction={decideAppeal.bind(null, guildId, r.id, false)}>
                      {t("Ablehnen")}</button>
                  </form>
                ) : (
                  <div className="small muted">
                    {r.reviewerId ? t("von {reviewerId}", { reviewerId: reviewer(r.reviewerId) }) : ""}
                    {r.reviewedAt ? ` · ${when.format(r.reviewedAt)}` : ""}
                    {r.reviewReason ? ` · ${r.reviewReason}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
