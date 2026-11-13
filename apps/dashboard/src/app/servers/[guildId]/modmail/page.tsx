import { and, desc, eq, modmailSettings, modmailThreads } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { saveModmail, unblockModmailUser } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Modmail") }) };
}

const when = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function ModmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "modmail");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [[s], threads, openThreads, channels, roles] = await Promise.all([
    db.select().from(modmailSettings).where(eq(modmailSettings.guildId, guildId)),
    db.select().from(modmailThreads).where(eq(modmailThreads.guildId, guildId)).orderBy(desc(modmailThreads.createdAt)).limit(30),
    db.select({ id: modmailThreads.id }).from(modmailThreads).where(and(eq(modmailThreads.guildId, guildId), eq(modmailThreads.open, true))),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const blocked = s?.blockedUserIds ?? [];
  const people = await getMembers(guildId, [...new Set([...threads.map((r) => r.userId), ...blocked])]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);

  return (
    <>
      <PageHeader
        icon="mail"
        title={t("Modmail")}
        description={t("Mitglieder schreiben Libremod eine Direktnachricht, dein Team antwortet in einem eigenen Thread. So bleibt alles an einem Ort und niemand braucht private Nachrichten aus dem Team.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveModmail.bind(null, guildId)} className="card">
        <Switch name="enabled" defaultChecked={s?.enabled ?? false} label={t("Modmail einschalten")} description={t("Wer Libremod privat schreibt, landet bei deinem Team.")} />
        <div className="grid-2" style={{ marginTop: "1rem", alignItems: "start" }}>
          <div className="field">
            <label htmlFor="channelId">{t("Kanal für Gespräche")}</label>
            <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
              <option value="">{t("Bitte wählen")}</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            <div className="hint">{t("Pro Gespräch entsteht hier ein Thread. Am besten ein Kanal, den nur dein Team sieht.")}</div>
          </div>
          <div className="field">
            <label htmlFor="pingRoleId">{t("Bei neuen Gesprächen erwähnen")}</label>
            <select id="pingRoleId" name="pingRoleId" defaultValue={s?.pingRoleId ?? ""}>
              <option value="">{t("Niemanden")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="greeting">{t("Antwort auf die erste Nachricht")}</label>
          <textarea id="greeting" name="greeting" maxLength={1000} defaultValue={s?.greeting ?? t("Danke für deine Nachricht! Das Team meldet sich hier, sobald jemand Zeit hat.")} style={{ minHeight: 70 }} />
        </div>
        <div className="field">
          <label htmlFor="closing">{t("Nachricht beim Schließen")}</label>
          <textarea id="closing" name="closing" maxLength={1000} defaultValue={s?.closing ?? t("Das Gespräch wurde geschlossen. Schreib einfach wieder, wenn du noch etwas brauchst.")} style={{ minHeight: 70 }} />
        </div>
        <Switch
          name="showStaffNames"
          defaultChecked={s?.showStaffNames ?? false}
          label={t("Namen aus dem Team zeigen")}
          description={t("Aus: Antworten kommen von „Team von …“. An: mit dem Namen der Person, die antwortet.")}
        />
        <div className="hint" style={{ marginTop: ".75rem" }}>
          {t("Im Thread gilt: Was mit „!“ oder „//“ beginnt, bleibt eine interne Notiz. Zum Beenden gibt es oben im Thread die Knöpfe „Schließen“ und „Schließen und Person sperren“.")}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">{t("Speichern")}</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="message" />
          <h2>{t("Letzte Gespräche")}</h2>
          <span className="badge info" style={{ marginLeft: "auto" }}>
            {t("{n} offen", { n: openThreads.length })}
          </span>
        </div>
        {threads.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>{t("Noch keine Gespräche.")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Person")}</th>
                  <th>{t("Begonnen")}</th>
                  <th>{t("Nachrichten")}</th>
                  <th>{t("Status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {threads.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a href={`/servers/${guildId}/members/${r.userId}`}>{nameOf(r.userId)}</a>
                    </td>
                    <td className="small">{when.format(r.createdAt)}</td>
                    <td>{r.messages}</td>
                    <td>{r.open ? <span className="badge on">{t("Offen")}</span> : <span className="badge">{t("Geschlossen")}</span>}</td>
                    <td>
                      <a className="small" href={`https://discord.com/channels/${guildId}/${r.threadId}`} target="_blank" rel="noreferrer">
                        {t("In Discord öffnen")}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="lock" />
          <h2>{t("Gesperrt")}</h2>
        </div>
        {blocked.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>{t("Niemand ist für Modmail gesperrt.")}</p>
        ) : (
          <ul className="notes">
            {blocked.map((id) => (
              <li key={id} style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                <span style={{ flex: 1 }}>
                  {nameOf(id)} {nameOf(id) !== id && <span className="small muted">{id}</span>}
                </span>
                <form action={unblockModmailUser.bind(null, guildId, id)}>
                  <button type="submit" className="secondary small">
                    {t("Entsperren")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
