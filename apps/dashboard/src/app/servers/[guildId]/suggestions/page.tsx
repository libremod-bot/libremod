import { and, count, desc, eq, suggestions, suggestionSettings, type SuggestionStatus } from "@libremod/db";
import { SUGGESTION_STATUS, SUGGESTION_STATUSES, voteBar } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getMembers } from "@/lib/discord";
import { deleteSuggestion, saveSuggestions, setSuggestionStatusFromDashboard } from "../actions";

export const metadata = { title: "Vorschläge · Libremod" };

const BADGE: Record<SuggestionStatus, string> = { open: "info", considered: "warn", accepted: "on", denied: "danger", implemented: "on" };
const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: "Europe/Berlin" });

export default async function SuggestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string; status?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler, status } = await searchParams;
  const filter = SUGGESTION_STATUSES.includes(status as SuggestionStatus) ? (status as SuggestionStatus) : undefined;
  const { db } = database();
  const [[s], rows, counts, channels] = await Promise.all([
    db.select().from(suggestionSettings).where(eq(suggestionSettings.guildId, guildId)),
    db
      .select()
      .from(suggestions)
      .where(filter ? and(eq(suggestions.guildId, guildId), eq(suggestions.status, filter)) : eq(suggestions.guildId, guildId))
      .orderBy(desc(suggestions.number))
      .limit(30),
    db.select({ status: suggestions.status, n: count() }).from(suggestions).where(eq(suggestions.guildId, guildId)).groupBy(suggestions.status),
    getGuildChannels(guildId),
  ]);
  const people = await getMembers(guildId, [...new Set(rows.map((r) => r.authorId))]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const countOf = (st: SuggestionStatus) => counts.find((c) => c.status === st)?.n ?? 0;
  const total = counts.reduce((a, c) => a + c.n, 0);

  return (
    <>
      <PageHeader
        icon="bulb"
        title="Vorschläge"
        description="Mitglieder reichen Ideen ein, alle stimmen mit 👍 oder 👎 ab und das Team entscheidet. Mit /suggest oder einfach als Nachricht im Vorschläge-Kanal."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveSuggestions.bind(null, guildId)} className="card">
        <Switch name="enabled" defaultChecked={s?.enabled ?? false} label="Vorschläge" description="Befehle: /suggest für alle, /suggestion für das Team." />
        <div className="grid-2" style={{ marginTop: "1rem", alignItems: "start" }}>
          <div>
            <label htmlFor="channelId">Vorschläge-Kanal</label>
            <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
              <option value="">Kanal wählen …</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="checks">
            <label className="check-inline">
              <input type="checkbox" name="autoConvert" defaultChecked={s?.autoConvert ?? true} /> Nachrichten im Kanal automatisch umwandeln
            </label>
            <label className="check-inline">
              <input type="checkbox" name="threads" defaultChecked={s?.threads ?? false} /> Pro Vorschlag einen Thread zum Diskutieren
            </label>
            <label className="check-inline">
              <input type="checkbox" name="anonymous" defaultChecked={s?.anonymous ?? false} /> Verfasser nicht anzeigen
            </label>
            <label className="check-inline">
              <input type="checkbox" name="dmAuthor" defaultChecked={s?.dmAuthor ?? true} /> Verfasser bei Entscheidungen per Direktnachricht informieren
            </label>
          </div>
        </div>
        <div className="hint">Für Threads braucht Libremod im Kanal das Recht „Öffentliche Threads erstellen“.</div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="bulb" />
          <h2>Eingereichte Vorschläge</h2>
        </div>
        <div className="chips" style={{ marginBottom: "1rem" }}>
          <a className="chip" href="?" aria-current={!filter ? "page" : undefined}>
            Alle <strong>{total}</strong>
          </a>
          {SUGGESTION_STATUSES.map((st) => (
            <a key={st} className="chip" href={`?status=${st}`} aria-current={filter === st ? "page" : undefined}>
              {SUGGESTION_STATUS[st].emoji} {SUGGESTION_STATUS[st].label} <strong>{countOf(st)}</strong>
            </a>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {filter ? "Keine Vorschläge mit diesem Status." : "Noch keine Vorschläge eingereicht."}
          </p>
        ) : (
          <ul className="suggestion-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="suggestion-head">
                  <strong>#{r.number}</strong>
                  <span className={`badge ${BADGE[r.status]}`}>
                    {SUGGESTION_STATUS[r.status].emoji} {SUGGESTION_STATUS[r.status].label}
                  </span>
                  <span className="small muted">
                    {s?.anonymous ? "anonym" : name(r.authorId)} · {when.format(r.createdAt)}
                  </span>
                  <span className="small" style={{ marginLeft: "auto" }}>
                    👍 {r.up} · 👎 {r.down}
                  </span>
                </div>
                <div className="suggestion-text">{r.text}</div>
                <div className="small muted">{voteBar(r.up, r.down)}</div>
                {r.statusReason && <div className="small">Begründung: {r.statusReason}</div>}
                <form action={setSuggestionStatusFromDashboard.bind(null, guildId, r.id)} className="inline-form" style={{ marginTop: ".6rem" }}>
                  <select name="status" defaultValue={r.status} aria-label="Status">
                    {SUGGESTION_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {SUGGESTION_STATUS[st].label}
                      </option>
                    ))}
                  </select>
                  <input name="reason" type="text" maxLength={500} placeholder="Begründung (optional)" defaultValue={r.statusReason ?? ""} aria-label="Begründung" />
                  <button className="secondary small" type="submit">
                    Übernehmen
                  </button>
                </form>
                <form action={deleteSuggestion.bind(null, guildId, r.id)} className="suggestion-delete">
                  <button className="danger small" type="submit" aria-label={`Vorschlag ${r.number} löschen`}>
                    <Icon name="trash" size={15} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
