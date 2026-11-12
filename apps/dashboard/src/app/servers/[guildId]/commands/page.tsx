import Link from "next/link";
import { asc, customCommands, eq } from "@libremod/db";
import { MAX_CUSTOM_COMMANDS } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { createCommand, deleteCommand } from "../actions";
import { CommandForm } from "./CommandForm";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Eigene Befehle") }) };
}

export default async function CommandsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "commands");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const commands = await db.select().from(customCommands).where(eq(customCommands.guildId, guildId)).orderBy(asc(customCommands.name));

  return (
    <>
      <PageHeader
        icon="slash"
        title={t("Eigene Befehle")}
        description={t("Eigene Slash-Befehle wie /regeln oder /discord, die mit deinem Text antworten. Sie erscheinen nach wenigen Sekunden in Discord.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      {commands.length > 0 && (
        <div className="filters">
          {commands.map((c) => (
            <div className="card" key={c.id}>
              <div className="filter-head">
                <div className="module-icon">
                  <Icon name="slash" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>/{c.name}</h3>
                  <div className="small muted">{c.description}</div>
                </div>
              </div>
              <div className="panel-roles">
                <span className="badge">{c.responses.length === 1 ? t("1 Antwort") : t("{length} Antworten", { length: c.responses.length })}</span>
                {c.embed && <span className="badge info">{t("Embed")}</span>}
                {c.ephemeral && <span className="badge">{t("Nur sichtbar für Nutzer")}</span>}
                <span className="badge">{c.uses}{t("× genutzt")}</span>
              </div>
              <div className="panel-actions">
                <Link className="button secondary small" href={`/servers/${guildId}/commands/${c.id}`}>
                  <Icon name="edit" size={15} /> {" "}{t("Bearbeiten")}</Link>
                <form action={deleteCommand.bind(null, guildId, c.id)} style={{ marginLeft: "auto" }}>
                  <button className="danger small" type="submit">
                    <Icon name="trash" size={15} /> {" "}{t("Löschen")}</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>{t("Neuer Befehl")}</h2>
          <span className="badge" style={{ marginLeft: "auto" }}>
            {commands.length} {" "}{t("von")}{" "}{MAX_CUSTOM_COMMANDS}
          </span>
        </div>
        <CommandForm action={createCommand.bind(null, guildId)} submitLabel={t("Befehl anlegen")} />
      </section>
    </>
  );
}
