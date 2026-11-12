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
  customCommands,
  scheduledMessages,
  counterChannels,
  tempVoiceHubs,
  notificationFeeds,
  highlightSettings,
  autoPurgeChannels,
  autoSlowmodeChannels,
  tickets,
  ticketPanels,
  economySettings,
  shopItems,
  giveaways,
  guildEvents,
  birthdays,
  birthdaySettings,
  verificationSettings,
  suggestionSettings,
  suggestions,
  countingChannels,
  wordChainChannels,
  quotes,
  appealSettings,
  banAppeals,
  channelLocks,
  sql,
  warnEscalations,
  type CaseType,
} from "@libremod/db";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { canSee, requireGuildAccess } from "@/lib/access";
import type { AreaKey } from "@/lib/areas";
import { Notice } from "@/components/Notice";
import { database } from "@/lib/db";
import { getGuildChannels } from "@/lib/discord";
import { t, relFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Übersicht") }) };
}

const CASE_LABELS: Record<CaseType, string> = {
  warn: "Verwarnung",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  kick: "Kick",
  ban: "Ban",
  unban: "Ban aufgehoben",
};

const relative = relFmt({ numeric: "auto" });
function ago(date: Date) {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { guildId } = await params;
  const { fehler } = await searchParams;
  const { access } = await requireGuildAccess(guildId);
  const visible = (href: string) => {
    const area = href.split("/")[3]?.split("#")[0];
    return !area || canSee(access, area as AreaKey);
  };
  const base = `/servers/${guildId}`;

  const { db } = database();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [[settings], rules, escalations, [weekStats], recent, channels, logs, [welcome], autoRoleRows, panels, [levels], [cmdCount], [schedCount], [counterCount], [hubCount], [feedCount], [hl], [purgeCount], [slowCount], [openTickets], [panelCount], [eco], [itemCount], [gwCount], [bday], [bdayCount], [verify], [lockCount], [sugg], [openSugg], [countRow], [chainRow], [quoteCount], [appealCfg], [openAppeals], [eventCount]] = await Promise.all([
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
    db.select({ n: count() }).from(customCommands).where(eq(customCommands.guildId, guildId)),
    db.select({ n: count() }).from(scheduledMessages).where(and(eq(scheduledMessages.guildId, guildId), eq(scheduledMessages.enabled, true))),
    db.select({ n: count() }).from(counterChannels).where(eq(counterChannels.guildId, guildId)),
    db.select({ n: count() }).from(tempVoiceHubs).where(eq(tempVoiceHubs.guildId, guildId)),
    db.select({ n: count() }).from(notificationFeeds).where(and(eq(notificationFeeds.guildId, guildId), eq(notificationFeeds.enabled, true))),
    db.select({ enabled: highlightSettings.enabled }).from(highlightSettings).where(eq(highlightSettings.guildId, guildId)),
    db.select({ n: count() }).from(autoPurgeChannels).where(eq(autoPurgeChannels.guildId, guildId)),
    db.select({ n: count() }).from(autoSlowmodeChannels).where(eq(autoSlowmodeChannels.guildId, guildId)),
    db.select({ n: count() }).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open"))),
    db.select({ n: count() }).from(ticketPanels).where(eq(ticketPanels.guildId, guildId)),
    db.select({ enabled: economySettings.enabled }).from(economySettings).where(eq(economySettings.guildId, guildId)),
    db.select({ n: count() }).from(shopItems).where(eq(shopItems.guildId, guildId)),
    db.select({ n: count() }).from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false))),
    db.select({ enabled: birthdaySettings.enabled }).from(birthdaySettings).where(eq(birthdaySettings.guildId, guildId)),
    db.select({ n: count() }).from(birthdays).where(eq(birthdays.guildId, guildId)),
    db.select({ enabled: verificationSettings.enabled }).from(verificationSettings).where(eq(verificationSettings.guildId, guildId)),
    db.select({ n: count() }).from(channelLocks).where(eq(channelLocks.guildId, guildId)),
    db.select({ enabled: suggestionSettings.enabled }).from(suggestionSettings).where(eq(suggestionSettings.guildId, guildId)),
    db.select({ n: count() }).from(suggestions).where(and(eq(suggestions.guildId, guildId), eq(suggestions.status, "open"))),
    db.select({ current: countingChannels.current, record: countingChannels.record }).from(countingChannels).where(eq(countingChannels.guildId, guildId)).limit(1),
    db.select({ length: wordChainChannels.length, record: wordChainChannels.record }).from(wordChainChannels).where(eq(wordChainChannels.guildId, guildId)).limit(1),
    db.select({ n: count() }).from(quotes).where(eq(quotes.guildId, guildId)),
    db.select({ enabled: appealSettings.enabled }).from(appealSettings).where(eq(appealSettings.guildId, guildId)),
    db.select({ n: count() }).from(banAppeals).where(and(eq(banAppeals.guildId, guildId), eq(banAppeals.status, "open"))),
    db.select({ n: count() }).from(guildEvents).where(and(eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open"))),
  ]);
  const countBadge = (n: number | undefined, one: string, many: string) =>
    n ? <span className="badge on">{n === 1 ? one : `${n} ${many}`}</span> : <span className="badge">{t("Keine")}</span>;
  const welcomeOn = !!(welcome?.welcomeEnabled || welcome?.goodbyeEnabled || welcome?.dmEnabled);
  const roleFeatures = (autoRoleRows[0]?.n ?? 0) + (panels[0]?.n ?? 0);

  const modLogName = channels.find((c) => c.id === settings?.modLogChannelId)?.name;
  const automodOn = settings?.automodEnabled ?? false;
  const hasEscalations = (escalations[0]?.n ?? 0) > 0;

  const steps: { done: boolean; text: string; href: string }[] = [
    { done: !!settings?.modLogChannelId, text: t("Mod-Log-Kanal festlegen"), href: `${base}/moderation` },
    { done: automodOn, text: t("Auto-Moderation einschalten"), href: `${base}/automod` },
    { done: rules.length > 0, text: t("Mindestens einen Filter aktivieren"), href: `${base}/automod` },
    { done: hasEscalations, text: t("Verwarnungsstufen festlegen"), href: `${base}/moderation` },
    { done: settings?.raidEnabled ?? false, text: t("Raid-Schutz aktivieren"), href: `${base}/automod#raid` },
    { done: logs.length > 0, text: t("Logging einrichten"), href: `${base}/logging` },
  ];
  if (!access.full) steps.length = 0;
  const doneCount = steps.filter((s) => s.done).length;

  const modules: { icon: IconName; title: string; text: string; href?: string; status: React.ReactNode }[] = [
    {
      icon: "ticket",
      title: t("Tickets"),
      text: t("Support-Tickets mit Formularen, Team-Rollen, Übernahme, Transkripten und Bewertungen."),
      href: `${base}/tickets`,
      status: panelCount?.n ? (
        <span className="badge on">{openTickets?.n ? `${openTickets.n} offen` : "Aktiv"}</span>
      ) : (
        <span className="badge">{t("Aus")}</span>
      ),
    },
    {
      icon: "mail",
      title: t("Einsprüche"),
      text: t("Gebannte können über eine eigene Seite Einspruch einlegen, das Team entscheidet hier."),
      href: `${base}/appeals`,
      status: appealCfg?.enabled ? <span className={`badge ${openAppeals?.n ? "warn" : "on"}`}>{openAppeals?.n ? `${openAppeals.n} offen` : "Aktiv"}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "usercheck",
      title: t("Verifizierung"),
      text: t("Neue Mitglieder bestätigen per Knopf, Code oder Frage. Mit Mindestalter für Konten und Rauswurf nach Frist."),
      href: `${base}/verification`,
      status: verify?.enabled ? <span className="badge on">{t("Aktiv")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "lock",
      title: t("Lockdown"),
      text: t("Im Notfall einzelne Kanäle oder den ganzen Server sperren, auf Wunsch befristet. Mit /lockdown und /unlock."),
      href: `${base}/moderation#lockdown`,
      status: lockCount?.n ? <span className="badge danger">{lockCount.n === 1 ? "1 Kanal gesperrt" : `${lockCount.n} Kanäle gesperrt`}</span> : <span className="badge">{t("Nichts gesperrt")}</span>,
    },
    {
      icon: "gavel",
      title: t("Moderation"),
      text: t("Mod-Log, Direktnachrichten bei Strafen und automatische Verwarnungsstufen."),
      href: `${base}/moderation`,
      status: settings?.modLogChannelId ? <span className="badge on">{t("Eingerichtet")}</span> : <span className="badge warn">{t("Mod-Log fehlt")}</span>,
    },
    {
      icon: "shield",
      title: "Auto-Mod",
      text: t("Spam, Links, Einladungen, Wortfilter, Großbuchstaben, Erwähnungen und Raid-Schutz."),
      href: `${base}/automod`,
      status: automodOn ? <span className="badge on">{rules.length} {" "}{t("von 6 Filtern aktiv")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "list",
      title: t("Fallakte"),
      text: t("Alle Verwarnungen, Timeouts, Kicks und Bans mit Grund und Moderator."),
      href: `${base}/cases`,
      status: <span className="badge info">{weekStats?.total ?? 0} {" "}{t("diese Woche")}</span>,
    },
    {
      icon: "log",
      title: t("Logging"),
      text: t("Gelöschte und bearbeitete Nachrichten, Beitritte, Rollen, Kanäle und Sprachkanäle."),
      href: `${base}/logging`,
      status: logs.length ? <span className="badge on">{logs.length} {" "}{t("von 5 Log-Arten aktiv")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "wave",
      title: t("Begrüßung"),
      text: t("Willkommens- und Abschiedsnachrichten mit Platzhaltern, auf Wunsch per Direktnachricht."),
      href: `${base}/welcome`,
      status: welcomeOn ? <span className="badge on">{t("Aktiv")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "tag",
      title: t("Rollen"),
      text: t("Auto-Rollen beim Beitritt und Rollen zum Selbstaussuchen per Button oder Menü."),
      href: `${base}/roles`,
      status: roleFeatures ? <span className="badge on">{t("Eingerichtet")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "steps",
      title: t("Level"),
      text: t("XP für Nachrichten und Sprachkanäle, Rollenbelohnungen und Rangliste."),
      href: `${base}/levels`,
      status: levels?.enabled ? <span className="badge on">{t("Aktiv")}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "slash",
      title: t("Eigene Befehle"),
      text: t("Slash-Befehle wie /regeln mit eigenem Text oder Embed, auf Wunsch mit Zufallsantworten."),
      href: `${base}/commands`,
      status: countBadge(cmdCount?.n, "1 Befehl", "Befehle"),
    },
    {
      icon: "clock",
      title: t("Geplante Nachrichten"),
      text: t("Erinnerungen und Hinweise, die Libremod täglich, wöchentlich oder in festen Abständen postet."),
      href: `${base}/schedule`,
      status: countBadge(schedCount?.n, "1 aktiv", "aktiv"),
    },
    {
      icon: "mic",
      title: t("Sprachkanäle & Zähler"),
      text: t("Sprachkanäle, die sich selbst erstellen und löschen, und Kanäle mit Mitgliederzahl."),
      href: `${base}/channels`,
      status: countBadge((counterCount?.n ?? 0) + (hubCount?.n ?? 0), "1 eingerichtet", "eingerichtet"),
    },
    {
      icon: "bell",
      title: t("Benachrichtigungen"),
      text: t("Neue Videos, Livestreams, Reddit-Beiträge und RSS-Feeds automatisch im Kanal melden."),
      href: `${base}/notifications`,
      status: countBadge(feedCount?.n, "1 aktiv", "aktiv"),
    },
    {
      icon: "coin",
      title: t("Währung & Shop"),
      text: t("Eigene Währung mit täglichem Bonus, Arbeiten, Überweisungen und einem Shop für Rollen und Artikel."),
      href: `${base}/economy`,
      status: eco?.enabled ? (
        <span className="badge on">{itemCount?.n ? `Aktiv · ${itemCount.n} im Shop` : "Aktiv"}</span>
      ) : (
        <span className="badge">{t("Aus")}</span>
      ),
    },
    {
      icon: "gift",
      title: t("Gewinnspiele"),
      text: t("Preise verlosen mit Mitmach-Knopf, Bedingungen wie Rolle oder Level und fairer Auslosung."),
      href: `${base}/giveaways`,
      status: countBadge(gwCount?.n, "1 läuft", "laufen"),
    },
    {
      icon: "calendar",
      title: t("Events"),
      text: t("Termine planen mit Zu- und Absagen, Warteliste, Event-Rolle und Erinnerung vor Beginn."),
      href: `${base}/events`,
      status: countBadge(eventCount?.n, "1 geplant", "geplant"),
    },
    {
      icon: "cake",
      title: t("Geburtstage"),
      text: t("Mitglieder tragen ihren Geburtstag ein, Libremod gratuliert und vergibt für einen Tag eine Rolle."),
      href: `${base}/birthdays`,
      status: bday?.enabled ? (
        <span className="badge on">{bdayCount?.n ? `Aktiv · ${bdayCount.n} eingetragen` : "Aktiv"}</span>
      ) : (
        <span className="badge">{t("Aus")}</span>
      ),
    },
    {
      icon: "bulb",
      title: t("Vorschläge"),
      text: t("Ideen sammeln, mit 👍 und 👎 abstimmen lassen und als Team entscheiden."),
      href: `${base}/suggestions`,
      status: sugg?.enabled ? <span className="badge on">{openSugg?.n ? `${openSugg.n} offen` : "Aktiv"}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "hash",
      title: t("Zähl-Kanal"),
      text: t("Gemeinsam hochzählen, mit Rekord und Neustart bei Fehlern."),
      href: `${base}/counting`,
      status: countRow ? <span className="badge on">{t("Bei")}{" "}{countRow.current} {" "}{t("· Rekord")}{" "}{countRow.record}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "link",
      title: t("Wortkette"),
      text: t("Jedes Wort beginnt mit dem letzten Buchstaben des vorigen."),
      href: `${base}/wordchain`,
      status: chainRow ? <span className="badge on">{chainRow.length} {" "}{t("Wörter · Rekord")}{" "}{chainRow.record}</span> : <span className="badge">{t("Aus")}</span>,
    },
    {
      icon: "note",
      title: t("Zitate"),
      text: t("Denkwürdige Sätze per Rechtsklick speichern und mit /quote random wieder hervorholen."),
      href: `${base}/quotes`,
      status: countBadge(quoteCount?.n, "1 Zitat", "Zitate"),
    },
    {
      icon: "sparkle",
      title: t("Highlights & Kanal-Pflege"),
      text: t("Beliebte Nachrichten sammeln, Kanäle regelmäßig leeren und Langsam-Modus nach Aktivität."),
      href: `${base}/tools`,
      status: countBadge((hl?.enabled ? 1 : 0) + (purgeCount?.n ?? 0) + (slowCount?.n ?? 0), "1 aktiv", "aktiv"),
    },
  ];

  const shownModules = modules.filter((m) => !m.href || visible(m.href));

  return (
    <>
      <PageHeader icon="home" title={t("Übersicht")} description={t("Was Libremod auf deinem Server gerade macht und was du noch einrichten kannst.")} />
      <Notice error={fehler} />
      {!access.full && (
        <div className="card small muted">
          {t("Du hast einen Team-Zugang und siehst nur die Bereiche, die das Server-Team für deine Rolle freigegeben hat.")}</div>
      )}

      <div className="stats">
        <div className="card stat">
          <div className="stat-label">{t("Auto-Mod")}</div>
          <div className="stat-value small-value">
            {automodOn ? <span className="badge on">{t("Aktiv")}</span> : <span className="badge">{t("Aus")}</span>}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Aktive Filter")}</div>
          <div className="stat-value">{automodOn ? rules.length : 0} / 6</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Logging")}</div>
          <div className="stat-value">{logs.length} / 5</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Fälle (7 Tage)")}</div>
          <div className="stat-value">{weekStats?.total ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Davon automatisch")}</div>
          <div className="stat-value">{weekStats?.automatic ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t("Mod-Log")}</div>
          <div className="stat-value small-value">{modLogName ? `#${modLogName}` : <span className="badge warn">{t("Nicht gesetzt")}</span>}</div>
        </div>
      </div>

      {steps.length > 0 && doneCount < steps.length && (
        <section className="card">
          <div className="card-title">
            <Icon name="check" />
            <h2>{t("Einrichtung")}</h2>
            <span className="badge info" style={{ marginLeft: "auto" }}>
              {doneCount} {" "}{t("von")}{" "}{steps.length} {" "}{t("erledigt")}</span>
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
        <h2 style={{ marginBottom: "0.85rem" }}>{t("Module")}</h2>
        <div className="modules">
          {shownModules.map((m) => {
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
                    {t("Einstellen")}{" "}<Icon name="arrow" size={15} />
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

      {canSee(access, "cases") && (
      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>{t("Letzte Fälle")}</h2>
          <Link href={`${base}/cases`} className="small" style={{ marginLeft: "auto" }}>
            {t("Alle ansehen")}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">{t("Noch keine Fälle. Ruhig hier!")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">#{c.caseNumber}</td>
                    <td>
                      <span className="badge">{t(CASE_LABELS[c.type])}</span>
                    </td>
                    <td className="mono">{c.targetId}</td>
                    <td>{c.reason || <span className="muted">{t("Kein Grund")}</span>}</td>
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
      )}
    </>
  );
}
