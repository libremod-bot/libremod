import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };
export { and, eq, desc, gt, lte, sql, count, isNotNull } from "drizzle-orm";

const SETTINGS_CHANNEL = "libremod_settings";

export function createDb(url: string) {
  const client = postgres(url);
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
    /** Meldet dem Bot, dass sich Einstellungen eines Servers geändert haben (z. B. aus dem Dashboard). */
    notifySettingsChanged: (guildId: string) => client.notify(SETTINGS_CHANNEL, guildId),
    /** Ruft onChange mit der Server-ID auf, sobald irgendwo Einstellungen geändert werden. */
    onSettingsChanged: (onChange: (guildId: string) => void) => client.listen(SETTINGS_CHANNEL, onChange),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
