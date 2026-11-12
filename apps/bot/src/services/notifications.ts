import { DiscordAPIError, RESTJSONErrorCodes, type Client } from "discord.js";
import {
  eq,
  notificationFeeds,
  type Db,
  type NotificationFeed,
} from "@libremod/db";
import {
  credentialsFromEnv,
  fetchFeed,
  fetchKick,
  fetchTwitch,
  mergeSeen,
  newItems,
  POLL_MINUTES,
  renderNotification,
  SourceError,
  type FeedItem,
  type FeedResult,
  type LiveResult,
} from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";
import { inGuildLocale } from "../i18n.js";

/** Nach so vielen Fehlversuchen in Folge wird eine Quelle, die es nicht mehr gibt, abgeschaltet. */
const DISABLE_AFTER = 12;

class ChannelGone extends Error {}

type Outcome =
  | { ok: true; feed?: FeedResult; live?: LiveResult }
  | { ok: false; error: SourceError };

function errorOf(err: unknown): SourceError {
  if (err instanceof SourceError) return err;
  logger.warn({ err }, "Benachrichtigung: unerwarteter Fehler");
  return new SourceError(t("Unerwarteter Fehler"));
}

async function post(client: Client, f: NotificationFeed, content: string) {
  const channel = await client.channels.fetch(f.channelId).catch((err) => {
    if (
      err instanceof DiscordAPIError &&
      (err.code === RESTJSONErrorCodes.UnknownChannel ||
        err.code === RESTJSONErrorCodes.MissingAccess)
    )
      return null;
    throw err;
  });
  if (
    !channel?.isSendable() ||
    !("guildId" in channel) ||
    channel.guildId !== f.guildId
  )
    throw new ChannelGone();
  const everyone = f.mentionRoleId === f.guildId;
  const mention = f.mentionRoleId
    ? everyone
      ? "@everyone"
      : `<@&${f.mentionRoleId}>`
    : "";
  await channel.send({
    content: (mention ? `${mention} ${content}` : content).slice(0, 2000),
    allowedMentions: everyone
      ? { parse: ["everyone"] }
      : { roles: f.mentionRoleId ? [f.mentionRoleId] : [] },
  });
}

/** Wertet das Ergebnis einer Abfrage für eine einzelne Benachrichtigung aus und postet, was neu ist. */
export async function applyOutcome(
  client: Client,
  db: Db,
  f: NotificationFeed,
  outcome: Outcome,
  now = new Date(),
) {
  return inGuildLocale(f.guildId, async () => {
    if (!outcome.ok) {
      const failures = f.failures + 1;
      const disable = outcome.error.permanent && failures >= DISABLE_AFTER;
      await db
        .update(notificationFeeds)
        .set({
          failures,
          lastError: outcome.error.message.slice(0, 200),
          lastCheckedAt: now,
          ...(disable ? { enabled: false } : {}),
        })
        .where(eq(notificationFeeds.id, f.id));
      if (disable)
        logger.info(
          { id: f.id, guildId: f.guildId },
          "Benachrichtigung abgeschaltet: Quelle nicht mehr erreichbar",
        );
      return;
    }

    const update: Partial<NotificationFeed> = {
      failures: 0,
      lastError: null,
      lastCheckedAt: now,
    };
    const toPost: string[] = [];

    if (outcome.feed) {
      const { feed } = outcome;
      if (feed.name && f.platform !== "reddit")
        update.name = feed.name.slice(0, 200);
      if (f.seen) {
        for (const item of newItems(feed.items, f.seen, now))
          toPost.push(render(f, feed.name, item));
      }
      // Beim ersten Mal nur merken, was es schon gibt.
      update.seen = mergeSeen(f.seen ?? [], feed.items);
    } else if (outcome.live) {
      const l = outcome.live;
      update.name = l.name.slice(0, 200);
      update.live = l.live;
      if (l.live && l.streamId && l.streamId !== f.lastStreamId) {
        update.lastStreamId = l.streamId.slice(0, 100);
        // Läuft der Stream schon beim Einrichten, wird er nicht nachträglich verkündet.
        if (f.lastCheckedAt)
          toPost.push(
            renderNotification(f.message, {
              name: l.name,
              title: l.title,
              url: l.url,
            }),
          );
      }
    }

    // Erst speichern, dann posten: lieber eine Meldung verpassen als doppelt senden.
    await db
      .update(notificationFeeds)
      .set(update)
      .where(eq(notificationFeeds.id, f.id));
    for (const content of toPost) {
      try {
        await post(client, f, content);
        await db
          .update(notificationFeeds)
          .set({ lastPostAt: new Date() })
          .where(eq(notificationFeeds.id, f.id));
      } catch (err) {
        const gone =
          err instanceof ChannelGone ||
          (err instanceof DiscordAPIError &&
            err.code === RESTJSONErrorCodes.MissingPermissions);
        if (err instanceof ChannelGone)
          await db
            .update(notificationFeeds)
            .set({ enabled: false, lastError: "Kanal fehlt" })
            .where(eq(notificationFeeds.id, f.id));
        else if (gone)
          await db
            .update(notificationFeeds)
            .set({ lastError: "Keine Rechte zum Schreiben im Kanal" })
            .where(eq(notificationFeeds.id, f.id));
        logger.warn(
          { err, id: f.id, guildId: f.guildId },
          "Benachrichtigung konnte nicht gepostet werden",
        );
        break;
      }
    }
  });
}

function render(f: NotificationFeed, sourceName: string, item: FeedItem) {
  return renderNotification(f.message, {
    name: f.platform === "reddit" ? f.sourceId : sourceName,
    title: item.title,
    url: item.url,
    author: item.author,
  });
}

const due = (f: NotificationFeed, now: Date) =>
  !f.lastCheckedAt ||
  now.getTime() - f.lastCheckedAt.getTime() >=
    POLL_MINUTES[f.platform] * 60_000 - 5_000;

let running = false;

/** Fragt alle fälligen Quellen ab. Gleiche Quellen auf mehreren Servern werden nur einmal geladen. */
export async function pollNotifications(
  client: Client,
  db: Db,
  now = new Date(),
  fetcher: typeof fetch = fetch,
) {
  if (running) return;
  running = true;
  try {
    const feeds = (
      await db
        .select()
        .from(notificationFeeds)
        .where(eq(notificationFeeds.enabled, true))
    ).filter((f) => client.guilds.cache.has(f.guildId) && due(f, now));
    if (!feeds.length) return;
    const creds = credentialsFromEnv();
    const groups = new Map<string, NotificationFeed[]>();
    for (const f of feeds) {
      const key = `${f.platform}\n${f.sourceId}`;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }

    // Twitch und Kick gesammelt in einer Anfrage.
    for (const platform of ["twitch", "kick"] as const) {
      const ids = [
        ...new Set(
          feeds.filter((f) => f.platform === platform).map((f) => f.sourceId),
        ),
      ];
      if (!ids.length) continue;
      let results: Map<string, LiveResult> | null = null;
      let error: SourceError | null = null;
      try {
        results =
          platform === "twitch"
            ? await fetchTwitch(ids, creds, fetcher)
            : await fetchKick(ids, creds, fetcher);
      } catch (err) {
        error = errorOf(err);
      }
      for (const id of ids) {
        const live = results?.get(id);
        const outcome: Outcome = live
          ? { ok: true, live }
          : {
              ok: false,
              error: error ?? new SourceError(t("Kanal nicht gefunden"), true),
            };
        for (const f of groups.get(`${platform}\n${id}`) ?? [])
          await applyOutcome(client, db, f, outcome, now).catch(logFail(f));
      }
    }

    // Feeds: höchstens 4 gleichzeitig.
    const feedGroups = [...groups.values()].filter(
      (g) => g[0]!.platform !== "twitch" && g[0]!.platform !== "kick",
    );
    const queue = [...feedGroups];
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let g = queue.shift(); g; g = queue.shift()) {
          const first = g[0]!;
          let outcome: Outcome;
          try {
            outcome = {
              ok: true,
              feed: await fetchFeed(
                first.platform as "youtube" | "reddit" | "rss",
                first.sourceId,
                fetcher,
              ),
            };
          } catch (err) {
            outcome = { ok: false, error: errorOf(err) };
          }
          for (const f of g)
            await applyOutcome(client, db, f, outcome, now).catch(logFail(f));
        }
      }),
    );
  } finally {
    running = false;
  }
}

const logFail = (f: NotificationFeed) => (err: unknown) =>
  logger.error({ err, id: f.id }, "Benachrichtigung fehlgeschlagen");

export function startNotifications(client: Client, db: Db): NodeJS.Timeout {
  return setInterval(
    () =>
      void pollNotifications(client, db).catch((err) =>
        logger.error({ err }, "Benachrichtigungen fehlgeschlagen"),
      ),
    60_000,
  );
}
