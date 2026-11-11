import { and, eq, tickets } from "@libremod/db";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";

/** Liefert das gespeicherte HTML-Transkript. Strenge CSP: keine Skripte, nur Bilder von außen. */
export async function GET(_req: Request, { params }: { params: Promise<{ guildId: string; ticketId: string }> }) {
  const { guildId, ticketId } = await params;
  await requireGuildAccess(guildId);
  const id = Number(ticketId);
  if (!Number.isInteger(id) || id <= 0) return new Response("Nicht gefunden", { status: 404 });
  const { db } = database();
  const [t] = await db
    .select({ transcript: tickets.transcript, number: tickets.number })
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.guildId, guildId)));
  if (!t?.transcript) return new Response("Für dieses Ticket gibt es kein Transkript.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(t.transcript, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; sandbox allow-popups allow-popups-to-escape-sandbox",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="ticket-${t.number}.html"`,
    },
  });
}
