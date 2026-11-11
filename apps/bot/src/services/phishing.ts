import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  userMention,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { and, automodRules, eq, type AutomodConfig, type Db } from "@libremod/db";
import { extractLinks, isOfficialDomain, isPublicUrl, isShortener, type FoundLink } from "@libremod/shared";
import { logger } from "../logger.js";
import { getSettings } from "./cases.js";

// =============== Kurzlinks auflösen ===============

const MAX_HOPS = 5;
const RESOLVE_TIMEOUT_MS = 4000;
const resolved = new Map<string, { target: { host: string; path: string } | null; at: number }>();

/**
 * Folgt den Weiterleitungen eines Kurzlinks, ohne die Zielseite zu laden.
 * Private Adressen werden nie angefragt. Ergebnis 1 Stunde im Speicher.
 */
export async function resolveShortLink(
  url: string,
  fetcher: typeof fetch = fetch,
  isPublic: (u: URL) => Promise<boolean> = isPublicUrl,
): Promise<{ host: string; path: string } | null> {
  const hit = resolved.get(url);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.target;
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return null;
  }
  let target: { host: string; path: string } | null = null;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!(await isPublic(current))) break;
    const res = await fetcher(current, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
      headers: { "user-agent": "LibremodBot (+https://libremod.xyz)" },
    }).catch(() => null);
    const location = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    try {
      current = new URL(location, current);
    } catch {
      break;
    }
    target = { host: current.hostname.toLowerCase(), path: `${current.pathname}${current.search}`.toLowerCase() };
    if (!isShortener(target.host)) break;
  }
  resolved.set(url, { target, at: Date.now() });
  if (resolved.size > 5000) for (const [k, v] of resolved) if (Date.now() - v.at > 3_600_000) resolved.delete(k);
  return target;
}

/** Ziele der Kurzlinks einer Nachricht (höchstens 3 pro Nachricht). */
export async function shortLinkTargets(links: FoundLink[], fetcher?: typeof fetch, isPublic?: (u: URL) => Promise<boolean>) {
  const short = links.filter((l) => isShortener(l.host)).slice(0, 3);
  const targets = await Promise.all(short.map((l) => resolveShortLink(l.url, fetcher, isPublic).catch(() => null)));
  return targets.filter((t): t is { host: string; path: string } => !!t);
}

// =============== Gekaperte Konten: gleicher Link in vielen Kanälen ===============

const SPREAD_WINDOW_MS = 2 * 60_000;
export const SPREAD_CHANNELS = 3;

interface Posted {
  channelId: string;
  messageId: string;
  at: number;
}

export class LinkSpreadTracker {
  private seen = new Map<string, Posted[]>();

  /** Merkt sich eine Nachricht mit Links. Gibt alle Kopien zurück, sobald sie in genug Kanälen steht. */
  record(guildId: string, userId: string, links: FoundLink[], post: Omit<Posted, "at">, now = Date.now()): Posted[] | null {
    if (!links.length) return null;
    const key = `${guildId}:${userId}:${links.map((l) => l.host + l.path).sort().join(" ")}`;
    const list = (this.seen.get(key) ?? []).filter((p) => now - p.at < SPREAD_WINDOW_MS);
    list.push({ ...post, at: now });
    this.seen.set(key, list);
    const channels = new Set(list.map((p) => p.channelId));
    if (channels.size < SPREAD_CHANNELS) return null;
    this.seen.delete(key);
    return list;
  }

  sweep(now = Date.now()) {
    for (const [k, list] of this.seen) if (list.every((p) => now - p.at >= SPREAD_WINDOW_MS)) this.seen.delete(k);
  }
}

// =============== Meldung im Mod-Log mit Knöpfen ===============

const PREFIX = "lmph";
export const isPhishingInteraction = (customId: string) => customId.startsWith(`${PREFIX}:`);

/** Meldung mit „Domain sperren“ und „Fehlalarm“. */
export async function postPhishingNotice(message: Message<true>, db: Db, reason: string, extra?: string) {
  const { modLogChannelId } = await getSettings(db, message.guildId);
  if (!modLogChannelId) return;
  const log = await message.guild.channels.fetch(modLogChannelId).catch(() => null);
  if (!log?.isSendable()) return;
  const hosts = [...new Set(extractLinks(message.content).map((l) => l.host))]
    .filter((h) => !isOfficialDomain(h) && !isShortener(h) && `${PREFIX}:allow:${h}`.length <= 100)
    .slice(0, 2);
  const embed = new EmbedBuilder()
    .setColor(0xd63031)
    .setTitle("Betrugsverdacht")
    .addFields(
      { name: "Mitglied", value: `${userMention(message.author.id)} (${message.author.id})`, inline: true },
      { name: "Kanal", value: `<#${message.channelId}>`, inline: true },
      { name: "Grund", value: reason.slice(0, 1024) },
      { name: "Inhalt", value: message.content.slice(0, 1000) || "(leer)" },
    )
    .setTimestamp();
  if (extra) embed.setDescription(extra);
  const rows = hosts.map((h) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}:block:${h}`).setLabel(`${h} sperren`.slice(0, 80)).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${PREFIX}:allow:${h}`).setLabel(`Fehlalarm: ${h} erlauben`.slice(0, 80)).setStyle(ButtonStyle.Secondary),
    ),
  );
  await log.send({ embeds: [embed], components: rows, allowedMentions: { parse: [] } }).catch(() => {});
}

/** Trägt Domains in die Sperr- oder Freigabeliste des Anti-Phishing-Filters ein. */
export async function updatePhishingLists(db: Db, guildId: string, add: { blocked?: string[]; allowed?: string[] }) {
  return db.transaction(async (tx) => {
    await tx.insert(automodRules).values({ guildId, filter: "phishing" }).onConflictDoNothing();
    const [rule] = await tx
      .select()
      .from(automodRules)
      .where(and(eq(automodRules.guildId, guildId), eq(automodRules.filter, "phishing")))
      .for("update");
    const config: AutomodConfig = { ...rule!.config };
    const blocked = new Set(config.blockedDomains ?? []);
    const allowed = new Set(config.allowedDomains ?? []);
    for (const d of add.blocked ?? []) {
      blocked.add(d);
      allowed.delete(d);
    }
    for (const d of add.allowed ?? []) {
      allowed.add(d);
      blocked.delete(d);
    }
    config.blockedDomains = [...blocked].slice(-500);
    config.allowedDomains = [...allowed].slice(-500);
    await tx.update(automodRules).set({ config }).where(and(eq(automodRules.guildId, guildId), eq(automodRules.filter, "phishing")));
    return rule!.enabled;
  });
}

export async function handlePhishingButton(interaction: ButtonInteraction, db: Db, invalidate: (guildId: string) => void) {
  if (!interaction.inCachedGuild()) return;
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return void (await interaction.reply({ content: "Das darf nur, wer den Server verwalten darf.", flags: MessageFlags.Ephemeral }));
  }
  const [, action, host] = interaction.customId.split(":");
  if (!host || (action !== "block" && action !== "allow")) return;
  await updatePhishingLists(db, interaction.guildId, action === "block" ? { blocked: [host] } : { allowed: [host] });
  invalidate(interaction.guildId);
  const note = action === "block" ? `🔒 ${host} gesperrt von ${interaction.user.tag}` : `✅ ${host} als Fehlalarm freigegeben von ${interaction.user.tag}`;
  const embeds = interaction.message.embeds.map((e) => EmbedBuilder.from(e).setFooter({ text: note }));
  // Knöpfe dieser Domain entfernen, die anderen bleiben.
  const components = interaction.message.components
    .map((row) => row.toJSON() as { type: number; components: { custom_id?: string }[] })
    .filter((row) => row.type === 1 && !row.components.some((b) => b.custom_id?.endsWith(`:${host}`)))
    .map((row) => new ActionRowBuilder<ButtonBuilder>(row as never));
  await interaction.update({ embeds, components }).catch(async (err) => {
    logger.debug({ err }, "Phishing-Meldung konnte nicht aktualisiert werden");
    await interaction.reply({ content: note, flags: MessageFlags.Ephemeral }).catch(() => {});
  });
}
