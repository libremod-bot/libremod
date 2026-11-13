import Link from "next/link";
import { notFound } from "next/navigation";
import { and, birthdays, count, desc, economySettings, eq, gt, levelSettings, memberBalances, memberNotes, memberXp, modCases, tickets, type CaseType } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { canSee, requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getBan, getDiscordUser, getGuildRoles, getMember, getMembers, snowflakeDate } from "@/lib/discord";
import { t, dateFmt, initLocale, numFmt } from "@/lib/i18n";
import { addMemberNote, deleteMemberNote } from "../../actions";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Mitglied") }) };
}

const LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};
const BADGE: Partial<Record<CaseType, string>> = { warn: "warn", timeout: "warn", kick: "warn", ban: "danger" };

const day = dateFmt({ dateStyle: "medium", timeZone: "Europe/Berlin" });
const when = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
const num = numFmt();
const hex = (c: number) => (c ? `#${c.toString(16).padStart(6, "0")}` : undefined);

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; userId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, userId } = await params;
  const { access } = await requireGuildAccess(guildId, "members");
  if (!/^\d{17,20}$/.test(userId)) notFound();
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();

  const member = await getMember(guildId, userId);
  const [user, ban, roles] = await Promise.all([
    member ? null : getDiscordUser(userId),
    member ? null : getBan(guildId, userId).catch(() => null),
    getGuildRoles(guildId),
  ]);
  const name = member?.displayName ?? user?.displayName ?? userId;
  const username = member?.username ?? user?.username;
  const avatar = member?.avatar ?? user?.avatar;

  const [cases, notes, [xp], [balance], [bday], [ticketCount], [lvl], [eco]] = await Promise.all([
    db.select().from(modCases).where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, userId))).orderBy(desc(modCases.caseNumber)).limit(50),
    db.select().from(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.userId, userId))).orderBy(desc(memberNotes.createdAt)),
    db.select().from(memberXp).where(and(eq(memberXp.guildId, guildId), eq(memberXp.userId, userId))),
    db.select().from(memberBalances).where(and(eq(memberBalances.guildId, guildId), eq(memberBalances.userId, userId))),
    db.select().from(birthdays).where(and(eq(birthdays.guildId, guildId), eq(birthdays.userId, userId))),
    db.select({ n: count() }).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.ownerId, userId))),
    db.select({ enabled: levelSettings.enabled }).from(levelSettings).where(eq(levelSettings.guildId, guildId)),
    db.select({ enabled: economySettings.enabled, symbol: economySettings.currencySymbol }).from(economySettings).where(eq(economySettings.guildId, guildId)),
  ]);
  const [rank] = xp
    ? await db.select({ n: count() }).from(memberXp).where(and(eq(memberXp.guildId, guildId), gt(memberXp.xp, xp.xp)))
    : [];
  const people = await getMembers(guildId, [...new Set([...cases.map((c) => c.moderatorId), ...notes.map((n) => n.authorId)])]);
  const who = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  const activeWarns = cases.filter((c) => c.type === "warn" && c.active).length;
  const memberRoles = roles.filter((r) => member?.roles.includes(r.id));
  const base = `/servers/${guildId}`;
  const canNotes = canSee(access, "cases");

  return (
    <>
      <Link href={`${base}/members`} className="back-link small">
        <Icon name="back" size={16} /> {t("Mitglieder")}
      </Link>
      <PageHeader icon="users" title={name} description={username ? `@${username} · ${userId}` : userId} />
      <Notice saved={gespeichert} error={fehler} />

      <section className="card member-head">
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="member-avatar" src={avatar} alt="" />
        )}
        <div className="member-status">
          {member ? (
            <span className="badge on">{t("Auf dem Server")}</span>
          ) : ban ? (
            <span className="badge danger">{t("Gebannt")}</span>
          ) : (
            <span className="badge">{t("Nicht mehr auf dem Server")}</span>
          )}
          {member?.timeoutUntil && <span className="badge warn">{t("Timeout bis {time}", { time: when.format(new Date(member.timeoutUntil)) })}</span>}
          {activeWarns > 0 && <span className="badge warn">{activeWarns === 1 ? t("1 aktive Verwarnung") : t("{n} aktive Verwarnungen", { n: activeWarns })}</span>}
          {member?.bot && <span className="badge info">{t("Bot")}</span>}
          {ban?.reason && <p className="small muted">{t("Grund für den Ban: {reason}", { reason: ban.reason })}</p>}
        </div>
        <div className="stats stats-4">
          <div className="stat">
            <div className="stat-label">{t("Beigetreten")}</div>
            <div className="stat-value small-value">{member?.joinedAt ? day.format(new Date(member.joinedAt)) : "–"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t("Konto erstellt")}</div>
            <div className="stat-value small-value">{day.format(snowflakeDate(userId))}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t("Level")}</div>
            <div className="stat-value small-value">{lvl?.enabled && xp ? t("Level {level} · Platz {rank}", { level: xp.level, rank: (rank?.n ?? 0) + 1 }) : "–"}</div>
            {lvl?.enabled && xp && <div className="stat-sub">{t("{xp} XP · {messages} Nachrichten", { xp: num.format(xp.xp), messages: num.format(xp.messages) })}</div>}
          </div>
          <div className="stat">
            <div className="stat-label">{t("Münzen")}</div>
            <div className="stat-value small-value">{eco?.enabled && balance ? `${eco.symbol} ${num.format(balance.balance)}` : "–"}</div>
          </div>
        </div>
        <div className="small muted">
          {bday ? t("Geburtstag am {day}.{month}.", { day: bday.day, month: bday.month }) + " · " : ""}
          {ticketCount?.n ? (ticketCount.n === 1 ? t("1 Ticket") : t("{n} Tickets", { n: ticketCount.n })) : t("Keine Tickets")}
        </div>
      </section>

      {member && (
        <section className="card">
          <div className="card-title">
            <Icon name="tag" />
            <h2>{t("Rollen")}</h2>
            <span className="badge" style={{ marginLeft: "auto" }}>
              {memberRoles.length}
            </span>
          </div>
          {memberRoles.length === 0 ? (
            <p className="empty" style={{ paddingTop: 0 }}>
              {t("Keine Rollen.")}
            </p>
          ) : (
            <div className="chips">
              {memberRoles.map((r) => (
                <span key={r.id} className="chip role-chip">
                  <span className="role-dot" style={{ background: hex(r.color) }} />
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>{t("Fallakte")}</h2>
          {canSee(access, "cases") && cases.length > 0 && (
            <Link className="small" href={`${base}/cases?nutzer=${userId}`} style={{ marginLeft: "auto" }}>
              {t("In der Fallakte öffnen")}
            </Link>
          )}
        </div>
        {cases.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Keine Fälle. Hier gab es noch nie Ärger.")}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("Art")}</th>
                  <th>{t("Grund")}</th>
                  <th>{t("Von")}</th>
                  <th>{t("Wann")}</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>{c.caseNumber}</td>
                    <td>
                      <span className={`badge ${BADGE[c.type] ?? ""}`}>{t(LABELS[c.type])}</span>
                      {!c.active && (c.type === "warn" || c.type === "ban") && <div className="small muted">{t("nicht mehr aktiv")}</div>}
                    </td>
                    <td>{c.reason || <span className="muted">{t("Kein Grund angegeben")}</span>}</td>
                    <td>{c.automatic ? <span className="muted">{t("automatisch")}</span> : who(c.moderatorId)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{when.format(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="note" />
          <h2>{t("Notizen des Teams")}</h2>
        </div>
        {notes.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Noch keine Notizen. Nur das Team sieht sie, die Person selbst nicht.")}
          </p>
        ) : (
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="small muted">
                  {when.format(n.createdAt)} · {who(n.authorId)}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
                {canNotes && (
                  <form action={deleteMemberNote.bind(null, guildId, n.id)}>
                    <input type="hidden" name="ziel" value="mitglied" />
                    <button className="danger small" type="submit" aria-label={t("Notiz {id} löschen", { id: n.id })}>
                      <Icon name="trash" size={15} />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canNotes && (
          <form action={addMemberNote.bind(null, guildId, userId)}>
            <input type="hidden" name="ziel" value="mitglied" />
            <label htmlFor="note">{t("Neue Notiz")}</label>
            <textarea id="note" name="note" rows={2} maxLength={1000} required placeholder={t("z. B. Hat sich im Ticket entschuldigt, beim nächsten Mal direkt Timeout.")} />
            <button type="submit" className="secondary" style={{ marginTop: ".75rem" }}>
              <Icon name="plus" size={16} /> {t("Notiz speichern")}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
