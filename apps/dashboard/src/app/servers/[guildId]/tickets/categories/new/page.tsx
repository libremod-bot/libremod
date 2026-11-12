import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { getGuildChannels, getGuildRoles } from "@/lib/discord";
import { createTicketCategory } from "../../../actions";
import { CategoryForm } from "../../CategoryForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Neue Ticket-Art") }) };
}

export default async function NewCategoryPage({ params, searchParams }: { params: Promise<{ guildId: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "tickets");
  const { fehler } = await searchParams;
  const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
  return (
    <>
      <PageHeader icon="ticket" title={t("Neue Ticket-Art")} description={t("Zum Beispiel Support, Bewerbung, Melden oder Partnerschaft. Jede Art kann eigene Fragen und ein eigenes Team haben.")} />
      <Notice error={fehler} />
      <Link href={`/servers/${guildId}/tickets`} className="small back-link">
        <Icon name="back" size={15} /> {" "}{t("Zurück zu den Tickets")}</Link>
      <CategoryForm action={createTicketCategory.bind(null, guildId)} channels={channels} roles={roles} submitLabel="Anlegen" />
    </>
  );
}
