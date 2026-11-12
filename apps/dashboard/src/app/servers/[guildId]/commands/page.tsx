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

export const metadata = { title: "Eigene Befehle · Libremod" };

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
        title="Eigene Befehle"
        description="Eigene Slash-Befehle wie /regeln oder /discord, die mit deinem Text antworten. Sie erscheinen nach wenigen Sekunden in Discord."
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
                <span className="badge">{c.responses.length === 1 ? "1 Antwort" : `${c.responses.length} Antworten`}</span>
                {c.embed && <span className="badge info">Embed</span>}
                {c.ephemeral && <span className="badge">Nur sichtbar für Nutzer</span>}
                <span className="badge">{c.uses}× genutzt</span>
              </div>
              <div className="panel-actions">
                <Link className="button secondary small" href={`/servers/${guildId}/commands/${c.id}`}>
                  <Icon name="edit" size={15} /> Bearbeiten
                </Link>
                <form action={deleteCommand.bind(null, guildId, c.id)} style={{ marginLeft: "auto" }}>
                  <button className="danger small" type="submit">
                    <Icon name="trash" size={15} /> Löschen
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>Neuer Befehl</h2>
          <span className="badge" style={{ marginLeft: "auto" }}>
            {commands.length} von {MAX_CUSTOM_COMMANDS}
          </span>
        </div>
        <CommandForm action={createCommand.bind(null, guildId)} submitLabel="Befehl anlegen" />
      </section>
    </>
  );
}
