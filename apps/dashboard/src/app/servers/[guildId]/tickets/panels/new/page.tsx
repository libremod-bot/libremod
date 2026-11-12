import Link from "next/link";
import { asc, eq, ticketCategories } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { createTicketPanel } from "../../../actions";
import { TicketPanelForm } from "../../PanelForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Neues Ticket-Panel") }) };
}

export default async function NewTicketPanelPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "tickets");
  const { fehler } = await searchParams;
  const { db } = database();
  const [channels, categories] = await Promise.all([
    getGuildChannels(guildId),
    db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId)).orderBy(asc(ticketCategories.position)),
  ]);
  return (
    <>
      <PageHeader icon="ticket" title={t("Neues Ticket-Panel")} description={t("Libremod postet die Nachricht sofort im gewählten Kanal.")} />
      <Notice error={fehler} />
      <Link href={`/servers/${guildId}/tickets`} className="small back-link">
        <Icon name="back" size={15} /> {" "}{t("Zurück zu den Tickets")}</Link>
      <TicketPanelForm
        action={createTicketPanel.bind(null, guildId)}
        channels={channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT)}
        categories={categories}
        submitLabel="Posten"
      />
    </>
  );
}
