import { birthdays, birthdaySettings, eq } from "@libremod/db";
import { ageOn, BIRTHDAY_PLACEHOLDERS, formatBirthday, localDate, nextBirthday } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getBotTopPosition, getGuildChannels, getGuildRoles, getMembers } from "@/lib/discord";
import { saveBirthdays } from "../actions";

export const metadata = { title: "Geburtstage · Libremod" };

const DEFAULT_MESSAGE = "🎉 Alles Gute zum Geburtstag, {user}!";

export default async function BirthdaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "birthdays");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [[s], rows, channels, roles, botTop] = await Promise.all([
    db.select().from(birthdaySettings).where(eq(birthdaySettings.guildId, guildId)),
    db.select().from(birthdays).where(eq(birthdays.guildId, guildId)).limit(2000),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  const today = localDate();
  const upcoming = rows
    .map((b) => ({ b, next: nextBirthday(b, today) }))
    .sort((a, z) => a.next.inDays - z.next.inDays)
    .slice(0, 20);
  const people = await getMembers(guildId, upcoming.map((u) => u.b.userId));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const assignable = roles.filter((r) => r.position < botTop);

  return (
    <>
      <PageHeader
        icon="cake"
        title="Geburtstage"
        description="Mitglieder tragen ihren Geburtstag mit /birthday set ein. Libremod gratuliert am Tag selbst und vergibt auf Wunsch für 24 Stunden eine Rolle."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveBirthdays.bind(null, guildId)} className="card">
        <Switch
          name="enabled"
          defaultChecked={s?.enabled ?? false}
          label="Geburtstage feiern"
          description="Eintragen geht immer. Glückwünsche und Rolle gibt es nur, solange das hier eingeschaltet ist."
        />
        <div className="grid-3" style={{ marginTop: "1rem" }}>
          <div>
            <label htmlFor="channelId">Kanal für Glückwünsche</label>
            <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
              <option value="">Keine Nachricht</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="roleId">Geburtstagsrolle</label>
            <select id="roleId" name="roleId" defaultValue={s?.roleId ?? ""}>
              <option value="">Keine Rolle</option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  @{r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hour">Uhrzeit (deutsche Zeit)</label>
            <select id="hour" name="hour" defaultValue={String(s?.hour ?? 9)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 Uhr
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="message">Glückwunsch</label>
        <textarea id="message" name="message" rows={3} maxLength={1000} defaultValue={s?.message ?? DEFAULT_MESSAGE} />
        <div className="chips">
          {BIRTHDAY_PLACEHOLDERS.map((p) => (
            <span key={p.key} className="chip">
              <code>{p.key}</code> {p.description}
            </span>
          ))}
        </div>
        <div className="hint">
          Wer am 29. Februar Geburtstag hat, wird in Jahren ohne Schalttag am 28. Februar gefeiert. Das Geburtsjahr ist freiwillig und
          wird nur für <code>{"{age}"}</code> genutzt.
        </div>
        <div className="savebar">
          <span className="muted small">
            {rows.length} {rows.length === 1 ? "Geburtstag" : "Geburtstage"} eingetragen
          </span>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="cake" />
          <h2>Die nächsten Geburtstage</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch hat niemand einen Geburtstag eingetragen. Mitglieder machen das mit <code>/birthday set</code>.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {upcoming.map(({ b, next }) => {
                  const age = ageOn(b.year, next.year);
                  return (
                    <tr key={b.userId}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatBirthday({ day: next.day, month: next.month })}</td>
                      <td>
                        {name(b.userId)}
                        {age !== null && <span className="muted small"> · wird {age}</span>}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {next.inDays === 0 ? (
                          <span className="badge on">Heute 🎂</span>
                        ) : next.inDays === 1 ? (
                          "morgen"
                        ) : (
                          `in ${next.inDays} Tagen`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
