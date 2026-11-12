import Link from "next/link";
import { asc, eq, notificationFeeds } from "@libremod/db";
import {
  credentialsFromEnv,
  MAX_FEEDS,
  NOTIFY_PLATFORMS,
  platformAvailable,
  PLATFORM_INFO,
  POLL_MINUTES,
  sourceUrl,
  type NotifyPlatform,
} from "@libremod/shared";
import { Icon, type IconName } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { createFeed, deleteFeed, toggleFeed } from "../actions";
import { FeedFields } from "./FeedFields";

export const metadata = { title: "Benachrichtigungen · Libremod" };

const PLATFORM_ICON: Record<NotifyPlatform, IconName> = {
  youtube: "play",
  twitch: "broadcast",
  kick: "broadcast",
  reddit: "message",
  rss: "rss",
};

const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "notifications");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [feeds, channels, roles] = await Promise.all([
    db.select().from(notificationFeeds).where(eq(notificationFeeds.guildId, guildId)).orderBy(asc(notificationFeeds.id)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "gelöschter Kanal";
  const mentionName = (id: string) => (id === guildId ? "@everyone" : `@${roles.find((r) => r.id === id)?.name ?? "gelöschte Rolle"}`);
  const creds = credentialsFromEnv();
  const unavailable = NOTIFY_PLATFORMS.filter((p) => !platformAvailable(p, creds));

  return (
    <>
      <PageHeader
        icon="bell"
        title="Benachrichtigungen"
        description="Libremod meldet neue Videos, Livestreams, Reddit-Beiträge und Einträge aus RSS-Feeds in einem Kanal deiner Wahl."
      />
      <Notice saved={gespeichert} error={fehler} />

      {feeds.length > 0 && (
        <div className="filters">
          {feeds.map((f) => (
            <div className="card" key={f.id} style={f.enabled ? undefined : { opacity: 0.65 }}>
              <div className="filter-head">
                <div className="module-icon">
                  <Icon name={PLATFORM_ICON[f.platform]} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>
                    <a href={sourceUrl(f.platform, f.sourceId)} target="_blank" rel="noreferrer noopener">
                      {f.platform === "reddit" ? `r/${f.sourceId}` : f.name}
                    </a>
                  </h3>
                  <div className="small muted">
                    {PLATFORM_INFO[f.platform].label} → #{channelName(f.channelId)}
                    {f.mentionRoleId ? ` · erwähnt ${mentionName(f.mentionRoleId)}` : ""}
                  </div>
                </div>
                {!f.enabled ? (
                  <span className="badge">pausiert</span>
                ) : f.lastError ? (
                  <span className="badge danger" title={f.lastError}>
                    Problem
                  </span>
                ) : f.live ? (
                  <span className="badge on">live</span>
                ) : null}
              </div>
              <p className="preview">{f.message}</p>
              <div className="small muted" style={{ marginBottom: ".75rem" }}>
                {f.lastError
                  ? `Letzte Abfrage fehlgeschlagen: ${f.lastError}`
                  : f.lastCheckedAt
                    ? `Zuletzt geprüft ${when.format(f.lastCheckedAt)}${f.lastPostAt ? ` · zuletzt gemeldet ${when.format(f.lastPostAt)}` : ""}`
                    : "Wird in den nächsten Minuten zum ersten Mal geprüft."}
              </div>
              <div className="panel-actions">
                <Link href={`/servers/${guildId}/notifications/${f.id}`} className="button secondary small">
                  <Icon name="edit" size={15} /> Bearbeiten
                </Link>
                <form action={toggleFeed.bind(null, guildId, f.id)}>
                  <button className="secondary small" type="submit">
                    {f.enabled ? "Pausieren" : "Fortsetzen"}
                  </button>
                </form>
                <form action={deleteFeed.bind(null, guildId, f.id)} style={{ marginLeft: "auto" }}>
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
          <h2>Neue Benachrichtigung</h2>
        </div>
        {feeds.length >= MAX_FEEDS ? (
          <p className="empty">Du hast das Maximum von {MAX_FEEDS} Benachrichtigungen erreicht.</p>
        ) : (
          <form action={createFeed.bind(null, guildId)}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="platform">Plattform</label>
                <select id="platform" name="platform" required defaultValue="youtube">
                  {NOTIFY_PLATFORMS.map((p) => (
                    <option key={p} value={p} disabled={!platformAvailable(p, creds)}>
                      {PLATFORM_INFO[p].label}
                      {platformAvailable(p, creds) ? "" : " (nicht eingerichtet)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="source">Quelle</label>
                <input id="source" name="source" type="text" required maxLength={500} placeholder="@kanalname, r/de oder https://…" />
                <div className="hint">
                  {NOTIFY_PLATFORMS.filter((p) => platformAvailable(p, creds))
                    .map((p) => `${PLATFORM_INFO[p].label}: ${PLATFORM_INFO[p].source}`)
                    .join(" · ")}
                </div>
              </div>
            </div>
            <FeedFields guildId={guildId} textChannels={textChannels} roles={roles} messagePlaceholder="Standardtext der Plattform" />
            <div style={{ marginTop: "1rem" }}>
              <button type="submit">Hinzufügen</button>
            </div>
          </form>
        )}
        <div className="hint" style={{ marginTop: "1rem" }}>
          Geprüft wird alle {POLL_MINUTES.twitch} Minuten (Livestreams) bzw. {POLL_MINUTES.youtube} bis {POLL_MINUTES.rss} Minuten (Videos, Beiträge,
          Feeds). Beim Einrichten merkt sich Libremod, was es schon gibt, und meldet nur Neues.
          {unavailable.length > 0 &&
            ` ${unavailable.map((p) => PLATFORM_INFO[p].label).join(" und ")} brauchen eigene Zugangsdaten in der .env (siehe README).`}
        </div>
      </section>
    </>
  );
}
