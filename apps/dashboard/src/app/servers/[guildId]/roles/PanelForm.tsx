import type { RolePanel } from "@libremod/db";
import { MAX_PANEL_ROLES } from "@libremod/shared";
import type { GuildChannel, GuildRole } from "@/lib/discord";

/** Formular zum Anlegen und Bearbeiten eines Rollen-Panels. */
export function PanelForm({
  action,
  panel,
  channels,
  roles,
  botTop,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  panel?: RolePanel;
  channels: GuildChannel[];
  roles: GuildRole[];
  botTop: number;
  submitLabel: string;
}) {
  return (
    <form action={action}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="title">Überschrift</label>
          <input id="title" name="title" type="text" required maxLength={256} defaultValue={panel?.title ?? ""} placeholder="z. B. Wähle deine Spiele" />
        </div>
        <div className="field">
          <label htmlFor="channelId">Kanal</label>
          <select id="channelId" name="channelId" required defaultValue={panel?.channelId ?? ""}>
            <option value="" disabled>
              Kanal wählen …
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">Beschreibung (optional)</label>
        <textarea id="description" name="description" maxLength={2000} defaultValue={panel?.description ?? ""} style={{ minHeight: 80 }} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="style">Darstellung</label>
          <select id="style" name="style" defaultValue={panel?.style ?? "buttons"}>
            <option value="buttons">Buttons</option>
            <option value="select">Auswahlmenü</option>
          </select>
        </div>
        <label className="check-inline">
          <input type="checkbox" name="single" defaultChecked={panel?.single ?? false} />
          Nur eine Rolle aus diesem Panel erlauben
        </label>
      </div>
      <div className="field">
        <label htmlFor="roleIds">Rollen (bis zu {MAX_PANEL_ROLES})</label>
        <select id="roleIds" name="roleIds" multiple required defaultValue={panel?.roleIds ?? []} style={{ minHeight: 160 }}>
          {roles.map((r) => (
            <option key={r.id} value={r.id} disabled={r.position >= botTop}>
              @{r.name}
              {r.position >= botTop ? " (steht über Libremod)" : ""}
            </option>
          ))}
        </select>
        <div className="hint">Mehrfachauswahl mit Strg bzw. Cmd. Die Reihenfolge entspricht der Rollenliste deines Servers.</div>
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
