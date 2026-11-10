import "server-only";
import { createDb } from "@libremod/db";
import { env } from "./env";

// Eine Verbindung pro Prozess, auch beim Neuladen im Entwicklungsmodus.
const globalForDb = globalThis as unknown as { libremodDb?: ReturnType<typeof createDb> };

export function database() {
  globalForDb.libremodDb ??= createDb(env.databaseUrl);
  return globalForDb.libremodDb;
}
