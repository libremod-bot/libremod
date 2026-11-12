import Link from "next/link";
import { asc, autoRoles, desc, eq, rolePanels, tempRoles, voiceRoles } from "@libremod/db";
import { ANY_VOICE_CHANNEL } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_STAGE, CHANNEL_TEXT, CHANNEL_VOICE, getBotTopPosition, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { addVoiceRole, createPanel, deletePanel, endTempRole, removeVoiceRole, saveAutoRoles } from "../actions";
import { PanelForm } from "./PanelForm";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Rollen") }) };
}

export default async function RolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "roles");
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [auto, panels, channels, roles, botTop, temps, vRoles] = await Promise.all([
    db.select().from(autoRoles).where(eq(autoRoles.guildId, guildId)),
    db.select().from(rolePanels).where(eq(rolePanels.guildId, guildId)).orderBy(desc(rolePanels.id)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
    db.select().from(tempRoles).where(eq(tempRoles.guildId, guildId)).orderBy(asc(tempRoles.expiresAt)).limit(50),
    db.select().from(voiceRoles).where(eq(voiceRoles.guildId, guildId)),
  ]);
  const voiceChannels = channels.filter((c) => c.type === CHANNEL_VOICE || c.type === CHANNEL_STAGE);
  const tempPeople = await getMembers(guildId, [...new Set(temps.map((tItem) => tItem.userId))]);
  const personName = (id: string) => tempPeople.find((p) => p.id === id)?.name ?? id;
  const when = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? t("gelöschte Rolle");
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? t("gelöschter Kanal");
  const humans = auto.filter((a) => a.target === "humans").map((a) => a.roleId);
  const bots = auto.filter((a) => a.target === "bots").map((a) => a.roleId);
  const tooHigh = roles.filter((r) => r.position >= botTop);

  const roleOptions = roles.map((r) => (
    <option key={r.id} value={r.id} disabled={r.position >= botTop}>
      @{r.name}
      {r.position >= botTop ? t(" (steht über Libremod)") : ""}
    </option>
  ));

  return (
    <>
      <PageHeader
        icon="tag"
        title={t("Rollen")}
        description={t("Rollen automatisch beim Beitritt vergeben und Mitglieder sich Rollen selbst aussuchen lassen.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      {tooHigh.length > 0 && (
        <div className="toast warn-box">
          {t("Libremod kann nur Rollen vergeben, die unter seiner eigenen Rolle stehen.")}{" "}{tooHigh.length === 1 ? t("Eine Rolle steht") : t("{length} Rollen stehen", { length: tooHigh.length })}{" "}
          {t("darüber und ist hier ausgegraut. Ziehe in Discord unter Servereinstellungen → Rollen die Libremod-Rolle nach oben.")}</div>
      )}

      <form className="card" action={saveAutoRoles.bind(null, guildId)}>
        <div className="card-title">
          <Icon name="plus" />
          <h2>{t("Auto-Rollen")}</h2>
        </div>
        <p className="card-sub">
          {t("Bekommt jedes neue Mitglied sofort. Ist auf deinem Server die Regel-Bestätigung aktiv, erst nachdem die Regeln akzeptiert wurden.")}</p>
        <div className="grid-3">
          <div>
            <label htmlFor="humanRoles">{t("Für neue Mitglieder")}</label>
            <select id="humanRoles" name="humanRoles" multiple defaultValue={humans}>
              {roleOptions}
            </select>
          </div>
          <div>
            <label htmlFor="botRoles">{t("Für neue Bots")}</label>
            <select id="botRoles" name="botRoles" multiple defaultValue={bots}>
              {roleOptions}
            </select>
          </div>
        </div>
        <div className="hint">{t("Mehrfachauswahl mit Strg bzw. Cmd. Keine Auswahl heißt: keine Auto-Rolle.")}</div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">{t("Speichern")}</button>
        </div>
      </form>

      <section>
        <h2 style={{ marginBottom: "0.4rem" }}>{t("Rollen zum Selbstaussuchen")}</h2>
        <p className="muted" style={{ marginBottom: "0.85rem" }}>
          {t("Libremod postet eine Nachricht mit Buttons oder einem Auswahlmenü. Mitglieder klicken und bekommen die Rolle, ein zweiter Klick nimmt sie wieder weg. Gut für Spiele, Pings, Farben oder Pronomen.")}</p>
        {panels.length > 0 && (
          <div className="filters" style={{ marginBottom: "1rem" }}>
            {panels.map((p) => (
              <div className="card" key={p.id}>
                <div className="filter-head">
                  <div className="module-icon">
                    <Icon name="tag" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0 }}>{p.title}</h3>
                    <div className="small muted">
                      #{channelName(p.channelId)} · {p.style === "buttons" ? "Buttons" : t("Auswahlmenü")}
                      {p.single ? t(" · nur eine Rolle") : ""}
                    </div>
                  </div>
                  {p.messageId ? <span className="badge on">{t("Gepostet")}</span> : <span className="badge warn">{t("Nicht gepostet")}</span>}
                </div>
                <div className="panel-roles">
                  {p.roleIds.map((id) => (
                    <span key={id} className="badge">
                      @{roleName(id)}
                    </span>
                  ))}
                </div>
                <div className="panel-actions">
                  <Link className="button secondary small" href={`/servers/${guildId}/roles/${p.id}`}>
                    <Icon name="edit" size={15} /> {" "}{t("Bearbeiten")}</Link>
                  {p.messageId && (
                    <a className="small" href={`https://discord.com/channels/${guildId}/${p.channelId}/${p.messageId}`} target="_blank" rel="noreferrer">
                      {t("In Discord ansehen")}</a>
                  )}
                  <form action={deletePanel.bind(null, guildId, p.id)} style={{ marginLeft: "auto" }}>
                    <button className="danger small" type="submit">
                      <Icon name="trash" size={15} /> {" "}{t("Löschen")}</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>{t("Neues Rollen-Panel")}</h2>
          </div>
          <PanelForm action={createPanel.bind(null, guildId)} channels={textChannels} roles={roles} botTop={botTop} submitLabel={t("Panel posten")} />
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="clock" />
          <h2>{t("Rollen auf Zeit")}</h2>
        </div>
        {temps.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Gerade läuft keine Rolle auf Zeit. Vergeben geht mit")}{" "}<code>{t("/temprole add")}</code> {" "}{t("oder als Shop-Artikel mit Tagen.")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {temps.map((tItem) => (
                  <tr key={`${tItem.userId}-${tItem.roleId}`}>
                    <td>
                      {personName(tItem.userId)}
                      {tItem.source && <div className="small muted">{tItem.source}</div>}
                    </td>
                    <td>@{roleName(tItem.roleId)}</td>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {tItem.expiresAt <= new Date() ? t("läuft ab …") : t("bis {n0}", { n0: when.format(tItem.expiresAt) })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={endTempRole.bind(null, guildId, tItem.userId, tItem.roleId)}>
                        <button className="secondary small" type="submit">
                          {t("Jetzt beenden")}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="sprachrollen">
        <div className="card-title">
          <Icon name="mic" />
          <h2>{t("Rolle im Sprachkanal")}</h2>
        </div>
        <p className="card-sub">
          {t("Solange jemand in einem Sprachkanal ist, hat er diese Rolle. Praktisch für einen Text-Kanal, den nur sieht, wer gerade mitredet.")}</p>
        {vRoles.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <tbody>
                {vRoles.map((v) => (
                  <tr key={`${v.channelId}-${v.roleId}`}>
                    <td>{v.channelId === ANY_VOICE_CHANNEL ? t("Jeder Sprachkanal") : `🔊 ${channelName(v.channelId)}`}</td>
                    <td>
                      <span className="badge info">@{roleName(v.roleId)}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={removeVoiceRole.bind(null, guildId, v.channelId, v.roleId)}>
                        <button className="danger small" type="submit">
                          {t("Entfernen")}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={addVoiceRole.bind(null, guildId)}>
          <div className="grid-2">
            <div>
              <label htmlFor="voiceChannelId">{t("Sprachkanal")}</label>
              <select id="voiceChannelId" name="voiceChannelId" defaultValue={ANY_VOICE_CHANNEL}>
                <option value={ANY_VOICE_CHANNEL}>{t("Jeder Sprachkanal")}</option>
                {voiceChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    🔊 {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="voiceRoleId">{t("Rolle")}</label>
              <select id="voiceRoleId" name="voiceRoleId" required defaultValue="">
                <option value="" disabled>
                  {t("Rolle wählen …")}</option>
                {roleOptions}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> {" "}{t("Hinzufügen")}</button>
          </div>
        </form>
      </section>
    </>
  );
}
