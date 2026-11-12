import Link from "next/link";
import { notFound } from "next/navigation";
import { and, customCommands, eq } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { updateCommand } from "../../actions";
import { CommandForm } from "../CommandForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Befehl bearbeiten") }) };
}

export default async function EditCommandPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; commandId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, commandId } = await params;
  await requireGuildAccess(guildId, "commands");
  const { gespeichert, fehler } = await searchParams;
  const id = Number(commandId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db } = database();
  const [command] = await db.select().from(customCommands).where(and(eq(customCommands.id, id), eq(customCommands.guildId, guildId)));
  if (!command) notFound();

  return (
    <>
      <PageHeader icon="slash" title={t("/{name} bearbeiten", { name: command.name })} description={t("Änderungen sind nach wenigen Sekunden in Discord sichtbar.")} />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/commands`} className="small back-link">
        <Icon name="back" size={15} /> {" "}{t("Zurück zu den Befehlen")}</Link>
      <div className="card">
        <CommandForm action={updateCommand.bind(null, guildId, command.id)} command={command} submitLabel="Speichern" />
      </div>
    </>
  );
}
