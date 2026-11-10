import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };
export { and, eq, desc, lte, sql, count, isNotNull } from "drizzle-orm";

export function createDb(url: string) {
  const client = postgres(url);
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Spielt alle Migrationen aus packages/db/drizzle ein. Wird beim Bot-Start aufgerufen. */
export async function runMigrations(url: string) {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await client.end();
  }
}
