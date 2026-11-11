/** Platzhalter für Begrüßungs- und Hinweistexte. */
export interface TemplateVars {
  /** Erwähnung, z. B. <@123> */
  user: string;
  username: string;
  server: string;
  membercount?: number;
}

export const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "{user}", description: "Erwähnung der Person" },
  { key: "{username}", description: "Name der Person ohne Erwähnung" },
  { key: "{server}", description: "Name des Servers" },
  { key: "{membercount}", description: "Anzahl der Mitglieder" },
];

/** Ersetzt {user}, {username}, {server} und {membercount}. Unbekannte Platzhalter bleiben stehen. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(user|username|server|membercount)\}/gi, (_, key: string) => {
    switch (key.toLowerCase()) {
      case "user":
        return vars.user;
      case "username":
        return vars.username;
      case "server":
        return vars.server;
      default:
        return vars.membercount === undefined ? "" : String(vars.membercount);
    }
  });
}

/** Höchstlänge für Texte, die im Dashboard eingegeben werden. */
export const MAX_TEMPLATE_LENGTH = 1500;
