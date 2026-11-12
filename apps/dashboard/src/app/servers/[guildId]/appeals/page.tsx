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

export const metadata = { title: "Einsprüche · Libremod" };

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
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
        title="Einsprüche"
        description="Gebannte Personen können über eine eigene Seite Einspruch einlegen. Ihr entscheidet hier, bei Annahme hebt Libremod den Ban auf."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveAppealSettings.bind(null, guildId)} className="card">
        <Switch
          name="enabled"
          defaultChecked={s?.enabled ?? false}
          label="Einsprüche annehmen"
          description="Der Link steht dann auch in der Direktnachricht, die Gebannte bekommen (wenn Direktnachrichten unter Moderation an sind)."
        />
        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="appealLink">Link zum Einspruch</label>
          <input id="appealLink" type="text" readOnly value={link} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="channelId">Neue Einsprüche melden in</label>
            <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
              <option value="">Nirgends</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cooldownDays">Wartezeit nach Ablehnung (Tage)</label>
            <input id="cooldownDays" name="cooldownDays" type="number" min={0} max={365} defaultValue={s?.cooldownDays ?? 30} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="question">Frage an die gebannte Person</label>
          <input id="question" name="question" type="text" maxLength={300} defaultValue={s?.question ?? "Warum sollten wir deinen Ban aufheben?"} />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="mail" />
          <h2>{alle ? "Alle Einsprüche" : "Offene Einsprüche"}</h2>
          <a className="small" href={alle ? "?" : "?alle=1"} style={{ marginLeft: "auto" }}>
            {alle ? `Nur offene (${open})` : "Alle anzeigen"}
          </a>
        </div>
        {rows.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {alle ? "Noch keine Einsprüche." : "Gerade liegt kein Einspruch vor."}
          </p>
        ) : (
          <ul className="notes appeal-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="suggestion-head">
                  <strong>{r.userName}</strong>
                  <span className="small muted">{r.userId}</span>
                  <span className={`badge ${STATUS[r.status]?.badge ?? ""}`}>{STATUS[r.status]?.label ?? r.status}</span>
                  <span className="small muted">{when.format(r.createdAt)}</span>
                </div>
                <div className="quote-text" style={{ fontStyle: "normal" }}>
                  {r.text}
                </div>
                {r.status === "open" ? (
                  <form className="inline-form" style={{ marginTop: ".6rem" }}>
                    <input name="reason" type="text" maxLength={500} placeholder="Begründung (optional, geht an die Person)" aria-label="Begründung" />
                    <button className="small" type="submit" formAction={decideAppeal.bind(null, guildId, r.id, true)}>
                      Annehmen und entbannen
                    </button>
                    <button className="danger small" type="submit" formAction={decideAppeal.bind(null, guildId, r.id, false)}>
                      Ablehnen
                    </button>
                  </form>
                ) : (
                  <div className="small muted">
                    {r.reviewerId ? `von ${reviewer(r.reviewerId)}` : ""}
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
