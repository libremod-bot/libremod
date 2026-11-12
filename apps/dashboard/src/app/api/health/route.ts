import { sql } from "@libremod/db";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Für den Docker-Healthcheck: Dashboard läuft und erreicht die Datenbank. Gibt nichts Persönliches preis. */
export async function GET() {
  try {
    await database().db.execute(sql`select 1`);
    return Response.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
