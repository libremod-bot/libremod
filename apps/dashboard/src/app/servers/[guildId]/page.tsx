import Link from "next/link";
import {
  and,
  automodRules,
  count,
  desc,
  eq,
  gt,
  guildSettings,
  logChannels,
  autoRoles,
  modCases,
  rolePanels,
  welcomeSettings,
  levelSettings,
  sql,
  warnEscalations,
  type CaseType,
} from "@libremod/db";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getGuildChannels } from "@/lib/discord";

export const metadata = { title: "Übersicht · Libremod" };

const CASE_LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};

const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
function ago(date: Date) {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const base = `/servers/${guildId}`;

  const { db } = database();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [[settings], rules, escalations, [weekStats], recent, channels, logs, [welcome], autoRoleRows, panels, [levels]] = await Promise.all([
    db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)),
    db.select().from(automodRules).where(and(eq(automodRules.guildId, guildId), eq(automodRules.enabled, true))),
    db.select({ n: count() }).from(warnEscalations).where(eq(warnEscalations.guildId, guildId)),
    db
      .select({
        total: count(),
        automatic: sql<number>`count(*) filter (where ${modCases.automatic})`.mapWith(Number),
      })
      .from(modCases)
      .where(and(eq(modCases.guildId, guildId), gt(modCases.createdAt, weekAgo))),
    db.select().from(modCases).where(eq(modCases.guildId, guildId)).orderBy(desc(modCases.caseNumber)).limit(5),
    getGuildChannels(guildId),
    db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
    db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, guildId)),
    db.select({ n: count() }).from(autoRoles).where(eq(autoRoles.guildId, guildId)),
    db.select({ n: count() }).from(rolePanels).where(eq(rolePanels.guildId, guildId)),
    db.select({ enabled: levelSettings.enabled }).from(levelSettings).where(eq(levelSettings.guildId, guildId)),
  ]);
  const welcomeOn = !!(welcome?.welcomeEnabled || welcome?.goodbyeEnabled || welcome?.dmEnabled);
  const roleFeatures = (autoRoleRows[0]?.n ?? 0) + (panels[0]?.n ?? 0);

  const modLogName = channels.find((c) => c.id === settings?.modLogChannelId)?.name;
  const automodOn = settings?.automodEnabled ?? false;
  const hasEscalations = (escalations[0]?.n ?? 0) > 0;

  const steps: { done: boolean; text: string; href: string }[] = [
    { done: !!settings?.modLogChannelId, text: "Mod-Log-Kanal festlegen", href: `${base}/moderation` },
    { done: automodOn, text: "Auto-Moderation einschalten", href: `${base}/automod` },
    { done: rules.length > 0, text: "Mindestens einen Filter aktivieren", href: `${base}/automod` },
    { done: hasEscalations, text: "Verwarnungsstufen festlegen", href: `${base}/moderation` },
    { done: settings?.raidEnabled ?? false, text: "Raid-Schutz aktivieren", href: `${base}/automod#raid` },
    { done: logs.length > 0, text: "Logging einrichten", href: `${base}/logging` },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const modules: { icon: IconName; title: string; text: string; href?: string; status: React.ReactNode }[] = [
    {
      icon: "gavel",
      title: "Moderation",
      text: "Mod-Log, Direktnachrichten bei Strafen und automatische Verwarnungsstufen.",
      href: `${base}/moderation`,
      status: settings?.modLogChannelId ? <span className="badge on">Eingerichtet</span> : <span className="badge warn">Mod-Log fehlt</span>,
    },
    {
      icon: "shield",
      title: "Auto-Mod",
      text: "Spam, Links, Einladungen, Wortfilter, Großbuchstaben, Erwähnungen und Raid-Schutz.",
      href: `${base}/automod`,
      status: automodOn ? <span className="badge on">{rules.length} von 6 Filtern aktiv</span> : <span className="badge">Aus</span>,
    },
    {
      icon: "list",
      title: "Fallakte",
      text: "Alle Verwarnungen, Timeouts, Kicks und Bans mit Grund und Moderator.",
      href: `${base}/cases`,
      status: <span className="badge info">{weekStats?.total ?? 0} diese Woche</span>,
    },
    {
      icon: "log",
      title: "Logging",
      text: "Gelöschte und bearbeitete Nachrichten, Beitritte, Rollen, Kanäle und Sprachkanäle.",
      href: `${base}/logging`,
      status: logs.length ? <span className="badge on">{logs.length} von 5 Log-Arten aktiv</span> : <span className="badge">Aus</span>,
    },
    {
      icon: "wave",
      title: "Begrüßung",
      text: "Willkommens- und Abschiedsnachrichten mit Platzhaltern, auf Wunsch per Direktnachricht.",
      href: `${base}/welcome`,
      status: welcomeOn ? <span className="badge on">Aktiv</span> : <span className="badge">Aus</span>,
    },
    {
      icon: "tag",
      title: "Rollen",
      text: "Auto-Rollen beim Beitritt und Rollen zum Selbstaussuchen per Button oder Menü.",
      href: `${base}/roles`,
      status: roleFeatures ? <span className="badge on">Eingerichtet</span> : <span className="badge">Aus</span>,
    },
    {
      icon: "steps",
      title: "Level",
      text: "XP für Nachrichten und Sprachkanäle, Rollenbelohnungen und Rangliste.",
      href: `${base}/levels`,
      status: levels?.enabled ? <span className="badge on">Aktiv</span> : <span className="badge">Aus</span>,
    },
  ];

  return (
    <>
      <PageHeader icon="home" title="Übersicht" description="Was Libremod auf deinem Server gerade macht und was du noch einrichten kannst." />

      <div className="stats">
        <div className="card stat">
          <div className="stat-label">Auto-Mod</div>
          <div className="stat-value small-value">
            {automodOn ? <span className="badge on">Aktiv</span> : <span className="badge">Aus</span>}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Aktive Filter</div>
          <div className="stat-value">{automodOn ? rules.length : 0} / 6</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Logging</div>
          <div className="stat-value">{logs.length} / 5</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Fälle (7 Tage)</div>
          <div className="stat-value">{weekStats?.total ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Davon automatisch</div>
          <div className="stat-value">{weekStats?.automatic ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Mod-Log</div>
          <div className="stat-value small-value">{modLogName ? `#${modLogName}` : <span className="badge warn">Nicht gesetzt</span>}</div>
        </div>
      </div>

      {doneCount < steps.length && (
        <section className="card">
          <div className="card-title">
            <Icon name="check" />
            <h2>Einrichtung</h2>
            <span className="badge info" style={{ marginLeft: "auto" }}>
              {doneCount} von {steps.length} erledigt
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.text} className={s.done ? "done" : undefined}>
                <Link href={s.href}>
                  <span className="check-dot">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="check-text">{s.text}</span>
                  {!s.done && (
                    <span className="go">
                      <Icon name="arrow" size={16} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 style={{ marginBottom: "0.85rem" }}>Module</h2>
        <div className="modules">
          {modules.map((m) => {
            const inner = (
              <>
                <div className="module-head">
                  <div className="module-icon">
                    <Icon name={m.icon} />
                  </div>
                  {m.status}
                </div>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
                {m.href && (
                  <span className="module-link">
                    Einstellen <Icon name="arrow" size={15} />
                  </span>
                )}
              </>
            );
            return m.href ? (
              <Link key={m.title} href={m.href} className="card module">
                {inner}
              </Link>
            ) : (
              <div key={m.title} className="card module" style={{ opacity: 0.6 }}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>Letzte Fälle</h2>
          <Link href={`${base}/cases`} className="small" style={{ marginLeft: "auto" }}>
            Alle ansehen
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">Noch keine Fälle. Ruhig hier!</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">#{c.caseNumber}</td>
                    <td>
                      <span className="badge">{CASE_LABELS[c.type]}</span>
                    </td>
                    <td className="mono">{c.targetId}</td>
                    <td>{c.reason || <span className="muted">Kein Grund</span>}</td>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                      {ago(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
