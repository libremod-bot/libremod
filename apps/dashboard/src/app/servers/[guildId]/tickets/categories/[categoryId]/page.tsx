import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ticketCategories } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getGuildChannels, getGuildRoles } from "@/lib/discord";
import { updateTicketCategory } from "../../../actions";
import { CategoryForm } from "../../CategoryForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Ticket-Art bearbeiten") }) };
}

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; categoryId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, categoryId } = await params;
  await requireGuildAccess(guildId, "tickets");
  const { gespeichert, fehler } = await searchParams;
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db } = database();
  const [[category], channels, roles] = await Promise.all([
    db.select().from(ticketCategories).where(and(eq(ticketCategories.id, id), eq(ticketCategories.guildId, guildId))),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  if (!category) notFound();
  return (
    <>
      <PageHeader icon="ticket" title={t("{name} bearbeiten", { name: category.name })} description={t("Änderungen gelten für neue Tickets. Panels mit dieser Art werden automatisch aktualisiert.")} />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/tickets`} className="small back-link">
        <Icon name="back" size={15} /> {" "}{t("Zurück zu den Tickets")}</Link>
      <CategoryForm action={updateTicketCategory.bind(null, guildId, id)} category={category} channels={channels} roles={roles} submitLabel="Speichern" />
    </>
  );
}
