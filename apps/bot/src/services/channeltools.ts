import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  EmbedBuilder,
  RESTJSONErrorCodes,
  type Client,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import {
  and,
  autoPurgeChannels,
  autoSlowmodeChannels,
  eq,
  highlightPosts,
  highlightSettings,
  lte,
  type AutoSlowmodeChannel,
  type Db,
  type HighlightSettings,
} from "@libremod/db";
import { BULK_DELETE_MAX_AGE_MS, emojiMatches, nextSlowmode, truncate } from "@libremod/shared";
import { logger } from "../logger.js";

const gone = (err: unknown) =>
  err instanceof DiscordAPIError && (err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.MissingAccess);

// --- Highlight-Kanal ---

const CACHE_TTL_MS = 60_000;
const highlightCache = new Map<string, { settings: HighlightSettings | null; loadedAt: number }>();

export function invalidateHighlights(guildId: string) {
  highlightCache.delete(guildId);
}

async function loadHighlights(db: Db, guildId: string) {
  const hit = highlightCache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.settings;
  const [settings] = await db.select().from(highlightSettings).where(eq(highlightSettings.guildId, guildId));
  highlightCache.set(guildId, { settings: settings ?? null, loadedAt: Date.now() });
  return settings ?? null;
}

function highlightHeader(emoji: string, count: number, channelId: string) {
  return `${emoji} **${count}** · <#${channelId}>`;
}

function highlightEmbed(message: Message<true>) {
  const embed = new EmbedBuilder()
    .setColor(0xffc83d)
    .setAuthor({ name: message.member?.displayName ?? message.author.displayName, iconURL: message.author.displayAvatarURL({ size: 64 }) })
    .setTimestamp(message.createdAt);
  if (message.content) embed.setDescription(truncate(message.content, 4000));
  const image =
    message.attachments.find((a) => a.contentType?.startsWith("image/"))?.url ?? message.embeds.find((e) => e.image || e.thumbnail)?.image?.url;
  if (image) embed.setImage(image);
  const others = message.attachments.filter((a) => a.url !== image);
  if (others.size) embed.addFields({ name: "Anhänge", value: truncate(others.map((a) => `[${a.name}](${a.url})`).join("\n"), 1024) });
  return embed;
}

/** Reaktion hinzugefügt oder entfernt: Zähler prüfen und ggf. im Highlight-Kanal posten oder aktualisieren. */
export async function onHighlightReaction(raw: MessageReaction | PartialMessageReaction, _user: User | PartialUser, db: Db) {
  const guildId = raw.message.guildId;
  if (!guildId) return;
  const cfg = await loadHighlights(db, guildId);
  if (!cfg?.enabled || !cfg.channelId || !emojiMatches(cfg.emoji, raw.emoji)) return;
  if (raw.message.channelId === cfg.channelId) return;

  const reaction = raw.partial ? await raw.fetch() : raw;
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.inGuild() || message.system || message.author.id === message.client.user.id) return;
  const channel = message.channel;
  const nsfw = "nsfw" in channel ? channel.nsfw : channel.isThread() ? (channel.parent?.nsfw ?? false) : false;
  if (nsfw && !cfg.allowNsfw) return;

  let count = reaction.count ?? 0;
  if (!cfg.countSelf && count > 0) {
    const users = await reaction.users.fetch({ limit: 100 });
    if (users.has(message.author.id)) count--;
  }

  const [existing] = await db.select().from(highlightPosts).where(eq(highlightPosts.messageId, message.id));
  const emojiText = reaction.emoji.toString();
  if (existing) {
    if (!existing.highlightMessageId || existing.count === count) return;
    await db.update(highlightPosts).set({ count }).where(eq(highlightPosts.messageId, message.id));
    const target = await message.client.channels.fetch(existing.highlightChannelId ?? cfg.channelId).catch(() => null);
    if (target?.isTextBased()) {
      await target.messages
        .edit(existing.highlightMessageId, { content: highlightHeader(emojiText, count, message.channelId) })
        .catch((err) => logger.debug({ err }, "Highlight konnte nicht aktualisiert werden"));
    }
    return;
  }
  if (count < cfg.threshold) return;

  // Platz reservieren: Bei gleichzeitigen Reaktionen postet nur einer.
  const claimed = await db
    .insert(highlightPosts)
    .values({ messageId: message.id, guildId, channelId: message.channelId, count, highlightChannelId: cfg.channelId })
    .onConflictDoNothing()
    .returning();
  if (!claimed.length) return;

  try {
    const target = await message.client.channels.fetch(cfg.channelId);
    if (!target?.isSendable()) throw new Error("Highlight-Kanal nicht beschreibbar");
    const posted = await target.send({
      content: highlightHeader(emojiText, count, message.channelId),
      embeds: [highlightEmbed(message)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Zur Nachricht").setURL(message.url))],
      allowedMentions: { parse: [] },
    });
    await db.update(highlightPosts).set({ highlightMessageId: posted.id }).where(eq(highlightPosts.messageId, message.id));
  } catch (err) {
    // Reservierung freigeben, damit es beim nächsten Mal wieder versucht wird.
    await db.delete(highlightPosts).where(eq(highlightPosts.messageId, message.id));
    throw err;
  }
}

// --- Kanäle automatisch leeren ---

/** Löscht in fälligen Kanälen alle Nachrichten, die jünger als 14 Tage sind (optional ohne angepinnte). */
export async function runDuePurges(client: Client, db: Db, now = new Date()) {
  const due = await db.select().from(autoPurgeChannels).where(lte(autoPurgeChannels.nextRunAt, now)).limit(10);
  for (const p of due) {
    if (!client.guilds.cache.has(p.guildId)) continue;
    const claimed = await db
      .update(autoPurgeChannels)
      .set({ nextRunAt: new Date(now.getTime() + p.intervalHours * 3600_000), lastRunAt: now })
      .where(and(eq(autoPurgeChannels.channelId, p.channelId), eq(autoPurgeChannels.nextRunAt, p.nextRunAt)))
      .returning();
    if (!claimed.length) continue;

    try {
      const channel = await client.channels.fetch(p.channelId).catch((err) => (gone(err) ? null : Promise.reject(err)));
      if (!channel || !("bulkDelete" in channel) || channel.guildId !== p.guildId) {
        await db.delete(autoPurgeChannels).where(eq(autoPurgeChannels.channelId, p.channelId));
        logger.info({ channelId: p.channelId }, "Kanal-Leeren entfernt: Kanal fehlt");
        continue;
      }
      let deleted = 0;
      let before: string | undefined;
      for (let round = 0; round < 20; round++) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (!batch.size) break;
        before = batch.last()!.id;
        const tooOld = batch.some((m) => now.getTime() - m.createdTimestamp >= BULK_DELETE_MAX_AGE_MS);
        const victims = batch.filter((m) => !(p.keepPinned && m.pinned) && now.getTime() - m.createdTimestamp < BULK_DELETE_MAX_AGE_MS);
        if (victims.size === 1) {
          await victims.first()!.delete();
          deleted++;
        } else if (victims.size > 1) {
          deleted += (await channel.bulkDelete(victims, true)).size;
        }
        if (tooOld || batch.size < 100) break;
      }
      await db.update(autoPurgeChannels).set({ lastDeleted: deleted }).where(eq(autoPurgeChannels.channelId, p.channelId));
    } catch (err) {
      logger.warn({ err, channelId: p.channelId, guildId: p.guildId }, "Kanal leeren fehlgeschlagen");
    }
  }
}

// --- Automatischer Langsam-Modus ---

const watched = new Set<string>();
const activity = new Map<string, number[]>();

/** Merkt sich Nachrichten in beobachteten Kanälen. */
export function trackSlowmodeMessage(message: Message) {
  if (message.author.bot || !watched.has(message.channelId)) return;
  const list = activity.get(message.channelId) ?? [];
  list.push(Date.now());
  activity.set(message.channelId, list);
}

export function messagesLastMinute(channelId: string, now = Date.now()) {
  const list = (activity.get(channelId) ?? []).filter((t) => now - t < 60_000);
  activity.set(channelId, list);
  return list.length;
}

export async function updateSlowmodes(client: Client, db: Db, now = Date.now()) {
  const rows: AutoSlowmodeChannel[] = await db.select().from(autoSlowmodeChannels);
  watched.clear();
  for (const r of rows) watched.add(r.channelId);
  for (const id of activity.keys()) if (!watched.has(id)) activity.delete(id);

  for (const r of rows) {
    const guild = client.guilds.cache.get(r.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(r.channelId);
    if (!channel) {
      await db.delete(autoSlowmodeChannels).where(eq(autoSlowmodeChannels.channelId, r.channelId));
      continue;
    }
    if (!("setRateLimitPerUser" in channel) || !("rateLimitPerUser" in channel)) continue;
    const current = channel.rateLimitPerUser ?? 0;
    const next = nextSlowmode(current, messagesLastMinute(r.channelId, now), r);
    if (next === current) continue;
    await channel
      .setRateLimitPerUser(next, "Automatischer Langsam-Modus")
      .catch((err) => logger.warn({ err, channelId: r.channelId }, "Langsam-Modus konnte nicht gesetzt werden"));
  }
}

export function startChannelTools(client: Client, db: Db): NodeJS.Timeout[] {
  const log = (what: string) => (err: unknown) => logger.error({ err }, `${what} fehlgeschlagen`);
  void updateSlowmodes(client, db).catch(log("Langsam-Modus"));
  return [
    setInterval(() => void runDuePurges(client, db).catch(log("Kanal leeren")), 60_000),
    setInterval(() => void updateSlowmodes(client, db).catch(log("Langsam-Modus")), 60_000),
  ];
}
