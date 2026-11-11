import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, shopItems } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getBotTopPosition, getGuildRoles } from "@/lib/discord";
import { updateShopItem } from "../../../actions";
import { ItemFields } from "../../ItemFields";

export const metadata = { title: "Artikel bearbeiten · Libremod" };

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; itemId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, itemId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db } = database();
  const [[item], roles, botTop] = await Promise.all([
    db.select().from(shopItems).where(and(eq(shopItems.id, id), eq(shopItems.guildId, guildId))),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  if (!item) notFound();
  return (
    <>
      <PageHeader icon="coin" title={`${item.name} bearbeiten`} description="Änderungen gelten sofort im Shop." />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/economy`} className="small back-link">
        <Icon name="back" size={15} /> Zurück zum Shop
      </Link>
      <form action={updateShopItem.bind(null, guildId, id)} className="card">
        <ItemFields item={item} roles={roles} botTop={botTop} />
        <input type="hidden" name="enabled" value={item.enabled ? "on" : "off"} />
        <button type="submit">Speichern</button>
      </form>
    </>
  );
}
