import { countingChannels, eq, wordChainChannels } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { addWordChain, deleteWordChain, resetWordChain, updateWordChain } from "../actions";

export const metadata = { title: "Wortkette · Libremod" };

const nf = new Intl.NumberFormat("de-DE");

function Options({ allowSameUser }: { allowSameUser?: boolean }) {
  return (
    <label className="check-inline">
      <input type="checkbox" name="allowSameUser" defaultChecked={allowSameUser ?? false} /> Dieselbe Person darf zweimal hintereinander
    </label>
  );
}

export default async function WordChainPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [rows, counting, channels] = await Promise.all([
    db.select().from(wordChainChannels).where(eq(wordChainChannels.guildId, guildId)),
    db.select({ id: countingChannels.channelId }).from(countingChannels).where(eq(countingChannels.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const taken = new Set([...rows.map((r) => r.channelId), ...counting.map((c) => c.id)]);
  const textChannels = channels.filter((c) => (c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT) && !taken.has(c.id));
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";

  return (
    <>
      <PageHeader
        icon="link"
        title="Wortkette"
        description="Jedes Wort beginnt mit dem letzten Buchstaben des vorigen: Apfel, Lampe, Elefant … Kein Wort darf zweimal vorkommen."
      />
      <Notice saved={gespeichert} error={fehler} />

      {rows.map((c) => (
        <section className="card" key={c.channelId}>
          <div className="card-title">
            <Icon name="link" />
            <h2>#{channelName(c.channelId)}</h2>
          </div>
          <div className="stats" style={{ marginBottom: "1rem" }}>
            <div className="stat">
              <div className="stat-label">Letztes Wort</div>
              <div className="stat-value" style={{ overflowWrap: "anywhere" }}>{c.lastWord ?? "–"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Länge</div>
              <div className="stat-value">{nf.format(c.length)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Rekord</div>
              <div className="stat-value">{nf.format(c.record)}</div>
            </div>
          </div>
          <form action={updateWordChain.bind(null, guildId, c.channelId)}>
            <Options allowSameUser={c.allowSameUser} />
            <div className="inline-form" style={{ marginTop: "1rem" }}>
              <button type="submit" className="secondary small">
                Speichern
              </button>
            </div>
          </form>
          <div className="inline-form" style={{ marginTop: ".5rem" }}>
            <form action={resetWordChain.bind(null, guildId, c.channelId)}>
              <button type="submit" className="secondary small">
                Neue Kette beginnen
              </button>
            </form>
            <form action={deleteWordChain.bind(null, guildId, c.channelId)}>
              <button type="submit" className="danger small">
                <Icon name="trash" size={15} /> Keine Wortkette mehr
              </button>
            </form>
          </div>
        </section>
      ))}

      {rows.length < 5 && (
        <form action={addWordChain.bind(null, guildId)} className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>{rows.length ? "Weitere Wortkette einrichten" : "Wortkette einrichten"}</h2>
          </div>
          <label htmlFor="channelId">Kanal</label>
          <select id="channelId" name="channelId" required defaultValue="">
            <option value="" disabled>
              Kanal wählen …
            </option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <div style={{ marginTop: "1rem" }}>
            <Options />
          </div>
          <div className="hint">
            Nur einzelne Wörter zählen, alles andere löscht Libremod mit einem kurzen Hinweis. Umlaute zählen wie ihr Grundbuchstabe, ß wie s.
            Libremod braucht im Kanal „Nachrichten verwalten“ und „Reaktionen hinzufügen“.
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">
              <Icon name="plus" size={16} /> Einrichten
            </button>
          </div>
        </form>
      )}
    </>
  );
}
