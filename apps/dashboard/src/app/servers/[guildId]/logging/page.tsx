import { eq, logCategory, logChannels, logIgnoredChannels, type LogCategory } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { LOG_INFO } from "@/lib/logging";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_CATEGORY, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { quickLogging, saveLogging } from "../actions";

export const metadata = { title: "Logging · Libremod" };

export default async function LoggingPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "logging");
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [rows, ignored, channels] = await Promise.all([
    db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
    db.select().from(logIgnoredChannels).where(eq(logIgnoredChannels.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const byCategory = new Map(rows.map((r) => [r.category, r.channelId]));
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const nameOf = (id: string) => channels.find((c) => c.id === id)?.name;

  return (
    <>
      <PageHeader
        icon="log"
        title="Logging"
        description="Libremod protokolliert, was auf deinem Server passiert. Wähle für jede Log-Art einen Kanal, oder lass sie aus."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form className="card quick" action={quickLogging.bind(null, guildId)}>
        <div className="card-title">
          <Icon name="check" />
          <h2>Schnell einrichten</h2>
        </div>
        <p className="card-sub">Alle Log-Arten in einen Kanal. Einzelne Arten kannst du danach unten umstellen.</p>
        <div className="inline-form">
          <select name="channelId" aria-label="Kanal für alle Logs" defaultValue="" required>
            <option value="" disabled>
              Kanal wählen …
            </option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="secondary">
            Alles dorthin loggen
          </button>
        </div>
        <div className="hint">Tipp: Ein Kanal wie #server-log, den nur dein Team sehen kann.</div>
      </form>

      <form action={saveLogging.bind(null, guildId)} className="stack">
        <section>
          <h2 style={{ marginBottom: "0.85rem" }}>Log-Arten</h2>
          <div className="filters">
            {(logCategory.enumValues as readonly LogCategory[]).map((cat) => {
              const info = LOG_INFO[cat];
              const current = byCategory.get(cat);
              const name = current ? nameOf(current) : undefined;
              return (
                <div className="card filter-card" key={cat}>
                  <div className="filter-head">
                    <div className="module-icon">
                      <Icon name={info.icon} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3>{info.label}</h3>
                    </div>
                    {current ? (
                      <span className="badge on">{name ? `#${name}` : "Aktiv"}</span>
                    ) : (
                      <span className="badge">Aus</span>
                    )}
                  </div>
                  <ul className="log-events">
                    {info.events.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`${cat}.channel`}>Log-Kanal</label>
                    <select id={`${cat}.channel`} name={`${cat}.channel`} defaultValue={current ?? ""}>
                      <option value="">Aus</option>
                      {current && !name && <option value={current}>Gelöschter Kanal ({current})</option>}
                      {textChannels.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="users" />
            <h2>Nicht loggen</h2>
          </div>
          <p className="card-sub">
            Gelöschte und bearbeitete Nachrichten aus diesen Kanälen oder Kategorien landen nicht im Log. Die Log-Kanäle selbst sind immer
            ausgenommen. Mehrfachauswahl mit Strg bzw. Cmd.
          </p>
          <select id="ignoredChannels" name="ignoredChannels" multiple defaultValue={ignored.map((i) => i.channelId)} aria-label="Ignorierte Kanäle">
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.type === CHANNEL_CATEGORY ? `▸ ${c.name}` : `#${c.name}`}
              </option>
            ))}
          </select>
        </section>

        <div className="savebar">
          <span className="small muted">Bot-Nachrichten werden nicht geloggt. Kicks und Bans stehen im Mod-Log.</span>
          <button type="submit">Speichern</button>
        </div>
      </form>
    </>
  );
}
