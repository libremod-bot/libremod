import { and, count, desc, eq, giveawayEntries, giveaways, inArray } from "@libremod/db";
import { MAX_ACTIVE_GIVEAWAYS, MAX_GIVEAWAY_WINNERS } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { createGiveaway, deleteGiveaway, endGiveawayNow } from "../actions";

export const metadata = { title: "Gewinnspiele · Libremod" };

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function GiveawaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "giveaways");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [running, finished, channels, roles] = await Promise.all([
    db.select().from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false))).orderBy(giveaways.endsAt),
    db.select().from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, true))).orderBy(desc(giveaways.endsAt)).limit(15),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const ids = [...running, ...finished].map((g) => g.id);
  const counts = ids.length
    ? await db
        .select({ id: giveawayEntries.giveawayId, n: count() })
        .from(giveawayEntries)
        .where(inArray(giveawayEntries.giveawayId, ids))
        .groupBy(giveawayEntries.giveawayId)
    : [];
  const entrants = (id: number) => counts.find((c) => c.id === id)?.n ?? 0;
  const people = await getMembers(guildId, [...new Set([...running, ...finished].flatMap((g) => [g.hostId, ...g.winnerIds]))]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "gelöschte Rolle";
  const rules = (g: (typeof running)[number]) =>
    [g.requiredRoleId && `@${roleName(g.requiredRoleId)}`, g.minLevel > 0 && `ab Level ${g.minLevel}`].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        icon="gift"
        title="Gewinnspiele"
        description="Preise verlosen: Mitglieder machen mit einem Klick mit, Libremod lost zum Ende fair aus und gibt die Gewinner bekannt."
      />
      <Notice saved={gespeichert} error={fehler} />

      <section className="card">
        <div className="card-title">
          <Icon name="gift" />
          <h2>Laufende Gewinnspiele</h2>
        </div>
        {running.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            Gerade läuft nichts. Starte unten eins oder im Chat mit <code>/giveaway start</code>.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Preis</th>
                  <th>Kanal</th>
                  <th>Endet</th>
                  <th>Dabei</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {running.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.prize}</strong> <span className="muted small">#{g.id}</span>
                      <div className="small muted">
                        {g.winners} {g.winners === 1 ? "Gewinner" : "Gewinner"}
                        {rules(g) && ` · ${rules(g)}`}
                      </div>
                    </td>
                    <td>#{channelName(g.channelId)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{g.endsAt <= new Date() ? "wird ausgelost …" : when.format(g.endsAt)}</td>
                    <td>{entrants(g.id)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <form action={endGiveawayNow.bind(null, guildId, g.id)} style={{ display: "inline" }}>
                        <button className="secondary small" type="submit">
                          Jetzt auslosen
                        </button>
                      </form>{" "}
                      <form action={deleteGiveaway.bind(null, guildId, g.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label={`${g.prize} löschen`}>
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {running.length < MAX_ACTIVE_GIVEAWAYS && (
        <form action={createGiveaway.bind(null, guildId)} className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>Neues Gewinnspiel</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="prize">Preis</label>
              <input id="prize" name="prize" type="text" required maxLength={200} placeholder="z. B. 1 Monat Server-Boost" />
            </div>
            <div>
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
            </div>
            <div>
              <label htmlFor="duration">Dauer</label>
              <input id="duration" name="duration" type="text" required maxLength={20} placeholder="z. B. 2h, 3d, 1w" defaultValue="1d" />
            </div>
            <div>
              <label htmlFor="winners">Anzahl Gewinner</label>
              <input id="winners" name="winners" type="number" min={1} max={MAX_GIVEAWAY_WINNERS} defaultValue={1} required />
            </div>
            <div>
              <label htmlFor="requiredRoleId">Nur mit Rolle</label>
              <select id="requiredRoleId" name="requiredRoleId" defaultValue="">
                <option value="">Alle dürfen mitmachen</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="minLevel">Mindest-Level</label>
              <input id="minLevel" name="minLevel" type="number" min={0} max={1000} defaultValue={0} />
            </div>
          </div>
          <label htmlFor="description">Beschreibung (freiwillig)</label>
          <textarea id="description" name="description" rows={3} maxLength={1000} placeholder="Was gibt es genau und wie wird der Preis übergeben?" />
          <div className="hint">
            Das Mindest-Level gilt nur, wenn das Level-System eingeschaltet ist. Wer den Server bis zum Ende verlässt, kann nicht gewinnen.
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">
              <Icon name="gift" size={16} /> Gewinnspiel starten
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>Zuletzt beendet</h2>
        </div>
        {finished.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch kein Gewinnspiel beendet.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Preis</th>
                  <th>Gewinner</th>
                  <th>Beendet</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {finished.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.prize}</strong> <span className="muted small">#{g.id}</span>
                      <div className="small muted">
                        {entrants(g.id)} {entrants(g.id) === 1 ? "Teilnahme" : "Teilnahmen"} · von {name(g.hostId)}
                      </div>
                    </td>
                    <td>{g.winnerIds.length ? g.winnerIds.map(name).join(", ") : <span className="muted">niemand</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{when.format(g.endsAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteGiveaway.bind(null, guildId, g.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label={`${g.prize} entfernen`}>
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint">
          Neu auslosen geht im Chat mit <code>/giveaway reroll</code>. Wer schon gewonnen hat, wird dabei nicht noch einmal gezogen.
        </div>
      </section>
    </>
  );
}
