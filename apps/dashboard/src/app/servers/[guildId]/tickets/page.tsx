import Link from "next/link";
import { and, asc, desc, eq, gt, sql, ticketCategories, ticketPanels, tickets, ticketSettings } from "@libremod/db";
import { AUTO_CLOSE_OPTIONS, ratingStars, ticketDuration } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { deleteTicketCategory, deleteTicketPanel, saveTicketSettings } from "../actions";

export const metadata = { title: "Tickets · Libremod" };

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "tickets");
  const { gespeichert, fehler } = await searchParams;
  const base = `/servers/${guildId}/tickets`;
  const { db } = database();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const cols = {
    id: tickets.id,
    number: tickets.number,
    categoryName: tickets.categoryName,
    channelId: tickets.channelId,
    ownerId: tickets.ownerId,
    claimedBy: tickets.claimedBy,
    createdAt: tickets.createdAt,
    closedAt: tickets.closedAt,
    closeReason: tickets.closeReason,
    rating: tickets.rating,
    messageCount: tickets.messageCount,
    hasTranscript: sql<boolean>`${tickets.transcript} is not null`,
  };
  const [[settings], categories, panels, open, closed, [stats], channels, roles] = await Promise.all([
    db.select().from(ticketSettings).where(eq(ticketSettings.guildId, guildId)),
    db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId)).orderBy(asc(ticketCategories.position), asc(ticketCategories.id)),
    db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId)).orderBy(asc(ticketPanels.id)),
    db.select(cols).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open"))).orderBy(asc(tickets.createdAt)).limit(50),
    db.select(cols).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.status, "closed"))).orderBy(desc(tickets.closedAt)).limit(25),
    db
      .select({
        closedWeek: sql<number>`count(*) filter (where ${tickets.status} = 'closed' and ${tickets.closedAt} > ${weekAgo.toISOString()}::timestamptz)`.mapWith(Number),
        avgRating: sql<number | null>`avg(${tickets.rating})`.mapWith((v) => (v === null ? null : Number(v))),
        ratings: sql<number>`count(${tickets.rating})`.mapWith(Number),
        avgMinutes: sql<number | null>`avg(extract(epoch from ${tickets.closedAt} - ${tickets.createdAt}) / 60) filter (where ${tickets.closedAt} is not null)`.mapWith(
          (v) => (v === null ? null : Number(v)),
        ),
      })
      .from(tickets)
      .where(and(eq(tickets.guildId, guildId), gt(tickets.createdAt, new Date(Date.now() - 90 * 24 * 3600_000)))),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const people = await getMembers(guildId, [...new Set([...open, ...closed].flatMap((t) => [t.ownerId, t.claimedBy ?? ""]).filter(Boolean))]);
  const person = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? id) : "–");
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";
  const catName = (id: number) => categories.find((c) => c.id === id)?.name;

  return (
    <>
      <PageHeader
        icon="ticket"
        title="Tickets"
        description="Mitglieder öffnen über ein Panel einen privaten Kanal oder Thread mit dem Team. Mit Formularfragen, Übernahme, Transkripten und Bewertungen."
      />
      <Notice saved={gespeichert} error={fehler} />

      <div className="stats">
        <div className="card stat">
          <div className="stat-label">Offen</div>
          <div className="stat-value">{open.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Geschlossen (7 Tage)</div>
          <div className="stat-value">{stats?.closedWeek ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Ø Bearbeitungszeit</div>
          <div className="stat-value small-value">{stats?.avgMinutes != null ? ticketDuration(stats.avgMinutes * 60_000) : "–"}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Ø Bewertung</div>
          <div className="stat-value small-value" title={`${stats?.ratings ?? 0} Bewertungen`}>
            {stats?.avgRating != null ? `${nf1.format(stats.avgRating)} / 5` : "–"}
          </div>
        </div>
      </div>

      {categories.length === 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>So geht&apos;s los</h2>
          <ol className="steps-list">
            <li>Lege unten eine Ticket-Art an, z. B. „Support“ oder „Bewerbung“, mit Team-Rollen und optionalen Fragen.</li>
            <li>Erstelle ein Panel in einem Kanal, den alle sehen. Dort öffnen Mitglieder per Klick ein Ticket.</li>
            <li>Wähle einen Log-Kanal, damit Transkripte und Bewertungen beim Team ankommen.</li>
          </ol>
        </div>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="ticket" />
          <h2>Ticket-Arten</h2>
          <Link href={`${base}/categories/new`} className="button small" style={{ marginLeft: "auto" }}>
            <Icon name="plus" size={15} /> Neue Ticket-Art
          </Link>
        </div>
        {categories.length === 0 ? (
          <p className="empty">Noch keine Ticket-Arten.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Als</th>
                  <th>Team</th>
                  <th>Fragen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>
                        {c.emoji && !/^\d+$/.test(c.emoji) ? `${c.emoji} ` : ""}
                        {c.name}
                      </strong>
                      {c.description && <div className="small muted">{c.description}</div>}
                    </td>
                    <td className="small">{c.mode === "thread" ? `Thread in #${channelName(c.parentId)}` : "eigener Kanal"}</td>
                    <td className="small">
                      {c.staffRoleIds.length ? c.staffRoleIds.map((r) => `@${roles.find((x) => x.id === r)?.name ?? "gelöscht"}`).join(", ") : "alle mit „Kanäle verwalten“"}
                    </td>
                    <td>{c.questions.length || "–"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link href={`${base}/categories/${c.id}`} className="button secondary small">
                        <Icon name="edit" size={15} /> Bearbeiten
                      </Link>{" "}
                      <form action={deleteTicketCategory.bind(null, guildId, c.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label={`${c.name} löschen`}>
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

      <section className="card">
        <div className="card-title">
          <Icon name="message" />
          <h2>Panels</h2>
          {categories.length > 0 && (
            <Link href={`${base}/panels/new`} className="button small" style={{ marginLeft: "auto" }}>
              <Icon name="plus" size={15} /> Neues Panel
            </Link>
          )}
        </div>
        {panels.length === 0 ? (
          <p className="empty">{categories.length ? "Noch kein Panel. Erstelle eins, damit Mitglieder Tickets öffnen können." : "Lege zuerst eine Ticket-Art an."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {panels.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className="small muted">
                        #{channelName(p.channelId)} · {p.style === "select" ? "Auswahlmenü" : "Buttons"} ·{" "}
                        {p.categoryIds.map(catName).filter(Boolean).join(", ") || "keine Ticket-Arten"}
                      </div>
                    </td>
                    <td>{p.messageId ? <span className="badge on">gepostet</span> : <span className="badge warn">nicht gepostet</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link href={`${base}/panels/${p.id}`} className="button secondary small">
                        <Icon name="edit" size={15} /> Bearbeiten
                      </Link>{" "}
                      <form action={deleteTicketPanel.bind(null, guildId, p.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label="Panel löschen">
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

      <section className="card">
        <div className="card-title">
          <Icon name="circle" />
          <h2>Offene Tickets</h2>
        </div>
        {open.length === 0 ? (
          <p className="empty">Gerade ist kein Ticket offen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Art</th>
                  <th>Von</th>
                  <th>Übernommen</th>
                  <th>Offen seit</th>
                </tr>
              </thead>
              <tbody>
                {open.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.channelId ? (
                        <a href={`https://discord.com/channels/${guildId}/${t.channelId}`} target="_blank" rel="noreferrer noopener">
                          #{t.number}
                        </a>
                      ) : (
                        `#${t.number}`
                      )}
                    </td>
                    <td>{t.categoryName}</td>
                    <td>{person(t.ownerId)}</td>
                    <td>{person(t.claimedBy)}</td>
                    <td className="small">{ticketDuration(Date.now() - t.createdAt.getTime())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="file" />
          <h2>Zuletzt geschlossen</h2>
        </div>
        {closed.length === 0 ? (
          <p className="empty">Noch keine geschlossenen Tickets.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Art</th>
                  <th>Von</th>
                  <th>Geschlossen</th>
                  <th>Bewertung</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => (
                  <tr key={t.id}>
                    <td>#{t.number}</td>
                    <td>{t.categoryName}</td>
                    <td>{person(t.ownerId)}</td>
                    <td className="small">
                      {t.closedAt ? when.format(t.closedAt) : "–"}
                      {t.closeReason && <div className="muted">{t.closeReason}</div>}
                    </td>
                    <td className="rating">{t.rating ? ratingStars(t.rating) : <span className="muted">–</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      {t.hasTranscript && (
                        <a href={`${base}/${t.id}/transcript`} target="_blank" rel="noreferrer" className="button secondary small">
                          Transkript
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form action={saveTicketSettings.bind(null, guildId)} className="card">
        <div className="card-title">
          <Icon name="usercog" />
          <h2>Einstellungen</h2>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="logChannelId">Log-Kanal für Transkripte und Bewertungen</label>
            <select id="logChannelId" name="logChannelId" defaultValue={settings?.logChannelId ?? ""}>
              <option value="">Keiner</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="autoCloseHours">Automatisch schließen ohne Aktivität</label>
            <select id="autoCloseHours" name="autoCloseHours" defaultValue={String(settings?.autoCloseHours ?? 0)}>
              {AUTO_CLOSE_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? "Nie" : h < 48 ? `nach ${h} Stunden` : `nach ${h / 24} Tagen`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ height: ".5rem" }} />
        <Switch
          name="transcriptDm"
          defaultChecked={settings?.transcriptDm ?? true}
          label="Transkript per Direktnachricht"
          description="Wer das Ticket geöffnet hat, bekommt beim Schließen den Verlauf als Datei."
        />
        <Switch
          name="ratingEnabled"
          defaultChecked={settings?.ratingEnabled ?? true}
          label="Nach Bewertung fragen"
          description="Nach dem Schließen kommt eine Direktnachricht mit 1 bis 5 Sternen."
        />
        <Switch
          name="ownerCanClose"
          defaultChecked={settings?.ownerCanClose ?? true}
          label="Mitglieder dürfen ihr eigenes Ticket schließen"
          description="Sonst kann nur das Team schließen."
        />
        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="blockedRoleIds">Gesperrte Rollen (dürfen keine Tickets öffnen)</label>
          <select id="blockedRoleIds" name="blockedRoleIds" multiple defaultValue={settings?.blockedRoleIds ?? []} style={{ minHeight: 110 }}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </select>
          <div className="hint">Mehrfachauswahl mit Strg bzw. Cmd.</div>
        </div>
        <button type="submit">Speichern</button>
      </form>
    </>
  );
}
