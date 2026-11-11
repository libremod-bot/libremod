import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { getGuildChannels, getGuildRoles } from "@/lib/discord";
import { createTicketCategory } from "../../../actions";
import { CategoryForm } from "../../CategoryForm";

export const metadata = { title: "Neue Ticket-Art · Libremod" };

export default async function NewCategoryPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { fehler } = await searchParams;
  const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
  return (
    <>
      <PageHeader icon="ticket" title="Neue Ticket-Art" description="Zum Beispiel Support, Bewerbung, Melden oder Partnerschaft. Jede Art kann eigene Fragen und ein eigenes Team haben." />
      <Notice error={fehler} />
      <Link href={`/servers/${guildId}/tickets`} className="small back-link">
        <Icon name="back" size={15} /> Zurück zu den Tickets
      </Link>
      <CategoryForm action={createTicketCategory.bind(null, guildId)} channels={channels} roles={roles} submitLabel="Anlegen" />
    </>
  );
}
