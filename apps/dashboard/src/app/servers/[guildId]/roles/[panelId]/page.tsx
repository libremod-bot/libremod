import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, rolePanels } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getBotTopPosition, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { updatePanel } from "../../actions";
import { PanelForm } from "../PanelForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Rollen-Panel bearbeiten") }) };
}

export default async function EditPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; panelId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, panelId } = await params;
  await requireGuildAccess(guildId, "roles");
  const { gespeichert, fehler } = await searchParams;
  const id = Number(panelId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { db } = database();
  const [[panel], channels, roles, botTop] = await Promise.all([
    db.select().from(rolePanels).where(and(eq(rolePanels.id, id), eq(rolePanels.guildId, guildId))),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  if (!panel) notFound();
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);

  return (
    <>
      <PageHeader icon="tag" title={t("Rollen-Panel bearbeiten")} description={t("Änderungen werden direkt in der Nachricht in Discord übernommen.")} />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/roles`} className="small back-link">
        <Icon name="back" size={15} /> {" "}{t("Zurück zu Rollen")}</Link>
      <div className="card">
        <PanelForm
          action={updatePanel.bind(null, guildId, panel.id)}
          panel={panel}
          channels={textChannels}
          roles={roles}
          botTop={botTop}
          submitLabel={panel.messageId ? t("Speichern und Nachricht aktualisieren") : t("Speichern und posten")}
        />
      </div>
    </>
  );
}
