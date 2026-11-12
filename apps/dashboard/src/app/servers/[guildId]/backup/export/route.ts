import { requireGuildAccess } from "@/lib/access";
import { exportSettings } from "@/lib/backup";
import { database } from "@/lib/db";

/** Lädt alle Einstellungen des Servers als JSON-Datei herunter. */
export async function GET(_req: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId, "backup");
  const { db } = database();
  const data = await exportSettings(db, guildId, guild.name);
  const day = new Date().toISOString().slice(0, 10);
  const safe = guild.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || guildId;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="libremod-${encodeURIComponent(safe)}-${day}.json"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
