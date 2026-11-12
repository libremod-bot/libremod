/**
 * Rollen-Panels: eine Nachricht mit Buttons oder Auswahlmenü, über die sich Mitglieder Rollen geben.
 * Hier entsteht das Nachrichten-JSON für die Discord-API, das Dashboard und Bot gemeinsam nutzen.
 */

import { t } from "./i18n.js";
export const MAX_PANEL_ROLES = 25;
const PREFIX = "lmrole";

export interface PanelInput {
  id: number;
  title: string;
  description: string;
  style: "buttons" | "select";
  single: boolean;
  roles: { id: string; name: string }[];
}

/** custom_id eines Buttons bzw. Menüs. Buttons tragen zusätzlich die Rollen-ID. */
export function panelCustomId(panelId: number, roleId?: string) {
  return roleId ? `${PREFIX}:${panelId}:${roleId}` : `${PREFIX}:${panelId}`;
}

export function parsePanelCustomId(customId: string): { panelId: number; roleId?: string } | null {
  const m = /^lmrole:(\d{1,10})(?::(\d{17,20}))?$/.exec(customId);
  if (!m) return null;
  return { panelId: Number(m[1]), roleId: m[2] };
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Nachricht für POST/PATCH /channels/{id}/messages. */
export function buildPanelMessage(panel: PanelInput) {
  const roles = panel.roles.slice(0, MAX_PANEL_ROLES);
  const hint = panel.single
    ? t("Du kannst eine Rolle aus dieser Liste haben. Eine neue Wahl ersetzt die alte.")
    : panel.style === "buttons"
      ? t("Klicke auf eine Rolle, um sie zu bekommen. Nochmal klicken entfernt sie wieder.")
      : t("Wähle im Menü alle Rollen aus, die du haben möchtest.");

  const embed = {
    title: clip(panel.title, 256),
    description: clip([panel.description.trim(), hint].filter(Boolean).join("\n\n"), 4000),
    color: 0x4cb4ff,
  };

  let components: unknown[];
  if (panel.style === "buttons") {
    components = [];
    for (let i = 0; i < roles.length; i += 5) {
      components.push({
        type: 1,
        components: roles.slice(i, i + 5).map((r) => ({
          type: 2,
          style: 2,
          label: clip(r.name, 80),
          custom_id: panelCustomId(panel.id, r.id),
        })),
      });
    }
  } else {
    components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: panelCustomId(panel.id),
            placeholder: panel.single ? t("Rolle wählen") : t("Rollen wählen"),
            min_values: 0,
            max_values: panel.single ? 1 : Math.max(1, roles.length),
            options: roles.map((r) => ({ label: clip(r.name, 100), value: r.id })),
          },
        ],
      },
    ];
  }
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

/**
 * Berechnet, welche Rollen ein Mitglied nach einer Auswahl bekommen bzw. verlieren soll.
 * clicked: Button-Klick auf eine Rolle. selected: Auswahl im Menü (vollständige gewünschte Menge).
 */
export function panelRoleChanges(
  panelRoles: string[],
  memberRoles: Iterable<string>,
  action: { clicked: string } | { selected: string[] },
  single: boolean,
): { add: string[]; remove: string[] } {
  const has = new Set(memberRoles);
  const inPanel = new Set(panelRoles);
  let wanted: Set<string>;
  if ("clicked" in action) {
    if (!inPanel.has(action.clicked)) return { add: [], remove: [] };
    if (has.has(action.clicked)) return { add: [], remove: [action.clicked] };
    wanted = single ? new Set([action.clicked]) : new Set([...panelRoles.filter((r) => has.has(r)), action.clicked]);
  } else {
    const chosen = action.selected.filter((r) => inPanel.has(r));
    wanted = new Set(single ? chosen.slice(0, 1) : chosen);
  }
  return {
    add: panelRoles.filter((r) => wanted.has(r) && !has.has(r)),
    remove: panelRoles.filter((r) => !wanted.has(r) && has.has(r)),
  };
}
