import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ticketCategories, ticketPanels } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { updateTicketPanel } from "../../../actions";
import { TicketPanelForm } from "../../PanelForm";

export const metadata = { title: "Ticket-Panel bearbeiten · Libremod" };

export default async function EditTicketPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; panelId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, panelId } = await params;
  await requireGuildAccess(guildId, "tickets");
  const { gespeichert, fehler } = await searchParams;
  const id = Number(panelId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db } = database();
  const [[panel], channels, categories] = await Promise.all([
    db.select().from(ticketPanels).where(and(eq(ticketPanels.id, id), eq(ticketPanels.guildId, guildId))),
    getGuildChannels(guildId),
    db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId)).orderBy(asc(ticketCategories.position)),
  ]);
  if (!panel) notFound();
  return (
    <>
      <PageHeader icon="ticket" title="Ticket-Panel bearbeiten" description="Beim Speichern wird die Nachricht in Discord aktualisiert." />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/tickets`} className="small back-link">
        <Icon name="back" size={15} /> Zurück zu den Tickets
      </Link>
      <TicketPanelForm
        action={updateTicketPanel.bind(null, guildId, id)}
        panel={panel}
        channels={channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT)}
        categories={categories}
        submitLabel="Speichern"
      />
    </>
  );
}
