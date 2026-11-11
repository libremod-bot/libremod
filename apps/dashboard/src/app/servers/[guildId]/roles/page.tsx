import Link from "next/link";
import { autoRoles, desc, eq, rolePanels } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getBotTopPosition, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { createPanel, deletePanel, saveAutoRoles } from "../actions";
import { PanelForm } from "./PanelForm";

export const metadata = { title: "Rollen · Libremod" };

export default async function RolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [auto, panels, channels, roles, botTop] = await Promise.all([
    db.select().from(autoRoles).where(eq(autoRoles.guildId, guildId)),
    db.select().from(rolePanels).where(eq(rolePanels.guildId, guildId)).orderBy(desc(rolePanels.id)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "gelöschte Rolle";
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";
  const humans = auto.filter((a) => a.target === "humans").map((a) => a.roleId);
  const bots = auto.filter((a) => a.target === "bots").map((a) => a.roleId);
  const tooHigh = roles.filter((r) => r.position >= botTop);

  const roleOptions = roles.map((r) => (
    <option key={r.id} value={r.id} disabled={r.position >= botTop}>
      @{r.name}
      {r.position >= botTop ? " (steht über Libremod)" : ""}
    </option>
  ));

  return (
    <>
      <PageHeader
        icon="tag"
        title="Rollen"
        description="Rollen automatisch beim Beitritt vergeben und Mitglieder sich Rollen selbst aussuchen lassen."
      />
      <Notice saved={gespeichert} error={fehler} />

      {tooHigh.length > 0 && (
        <div className="toast warn-box">
          Libremod kann nur Rollen vergeben, die unter seiner eigenen Rolle stehen. {tooHigh.length === 1 ? "Eine Rolle steht" : `${tooHigh.length} Rollen stehen`}{" "}
          darüber und ist hier ausgegraut. Ziehe in Discord unter Servereinstellungen → Rollen die Libremod-Rolle nach oben.
        </div>
      )}

      <form className="card" action={saveAutoRoles.bind(null, guildId)}>
        <div className="card-title">
          <Icon name="plus" />
          <h2>Auto-Rollen</h2>
        </div>
        <p className="card-sub">
          Bekommt jedes neue Mitglied sofort. Ist auf deinem Server die Regel-Bestätigung aktiv, erst nachdem die Regeln akzeptiert wurden.
        </p>
        <div className="grid-3">
          <div>
            <label htmlFor="humanRoles">Für neue Mitglieder</label>
            <select id="humanRoles" name="humanRoles" multiple defaultValue={humans}>
              {roleOptions}
            </select>
          </div>
          <div>
            <label htmlFor="botRoles">Für neue Bots</label>
            <select id="botRoles" name="botRoles" multiple defaultValue={bots}>
              {roleOptions}
            </select>
          </div>
        </div>
        <div className="hint">Mehrfachauswahl mit Strg bzw. Cmd. Keine Auswahl heißt: keine Auto-Rolle.</div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section>
        <h2 style={{ marginBottom: "0.4rem" }}>Rollen zum Selbstaussuchen</h2>
        <p className="muted" style={{ marginBottom: "0.85rem" }}>
          Libremod postet eine Nachricht mit Buttons oder einem Auswahlmenü. Mitglieder klicken und bekommen die Rolle, ein zweiter Klick nimmt sie
          wieder weg. Gut für Spiele, Pings, Farben oder Pronomen.
        </p>
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
                      #{channelName(p.channelId)} · {p.style === "buttons" ? "Buttons" : "Auswahlmenü"}
                      {p.single ? " · nur eine Rolle" : ""}
                    </div>
                  </div>
                  {p.messageId ? <span className="badge on">Gepostet</span> : <span className="badge warn">Nicht gepostet</span>}
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
                    <Icon name="edit" size={15} /> Bearbeiten
                  </Link>
                  {p.messageId && (
                    <a className="small" href={`https://discord.com/channels/${guildId}/${p.channelId}/${p.messageId}`} target="_blank" rel="noreferrer">
                      In Discord ansehen
                    </a>
                  )}
                  <form action={deletePanel.bind(null, guildId, p.id)} style={{ marginLeft: "auto" }}>
                    <button className="danger small" type="submit">
                      <Icon name="trash" size={15} /> Löschen
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>Neues Rollen-Panel</h2>
          </div>
          <PanelForm action={createPanel.bind(null, guildId)} channels={textChannels} roles={roles} botTop={botTop} submitLabel="Panel posten" />
        </div>
      </section>
    </>
  );
}
