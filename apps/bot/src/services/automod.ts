import {
  EmbedBuilder,
  PermissionFlagsBits,
  userMention,
  type GuildMember,
  type Message,
  type PartialMessage,
} from "discord.js";
import {
  and,
  automodExemptions,
  automodRules,
  eq,
  type AutomodFilter,
  type AutomodRule,
  type Db,
} from "@libremod/db";
import { logger } from "../logger.js";
import {
  checkCaps,
  checkInvites,
  checkLinks,
  checkMentions,
  checkWords,
  compileWordList,
  JoinTracker,
  renderTemplate,
  SpamTracker,
  checkPhishing,
  extractLinks,
} from "@libremod/shared";
import { moderate } from "./actions.js";
import { getSettings } from "./cases.js";
import { markAutomodDeleted } from "./logging.js";
import { externalPhishingList } from "./phishlists.js";
import {
  LinkSpreadTracker,
  postPhishingNotice,
  shortLinkTargets,
} from "./phishing.js";
import { t } from "@libremod/shared";

interface GuildAutomod {
  enabled: boolean;
  rules: Map<AutomodFilter, AutomodRule>;
  words: RegExp | null;
  exemptRoles: Set<string>;
  exemptChannels: Set<string>;
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const PUNISH_COOLDOWN_MS = 10_000;
const RAID_MODE_MS = 5 * 60_000;
const RAID_TIMEOUT_SECONDS = 60 * 60;

/** Reihenfolge der Prüfung: die erste Regel, die anschlägt, gewinnt. */
const FILTER_ORDER: AutomodFilter[] = [
  "phishing",
  "words",
  "invites",
  "links",
  "mentions",
  "caps",
  "spam",
];

export const FILTER_LABELS: Record<AutomodFilter, string> = {
  spam: "Spam",
  invites: "Einladungslinks",
  links: "Links",
  words: "Wortfilter",
  caps: "Großbuchstaben",
  mentions: "Massen-Erwähnungen",
  phishing: "Anti-Phishing",
};

const cache = new Map<string, GuildAutomod>();
const spam = new SpamTracker();
const joins = new JoinTracker();
const lastPunished = new Map<string, number>();
const raidUntil = new Map<string, number>();

setInterval(() => {
  spam.sweep();
  const now = Date.now();
  for (const [k, tItem] of lastPunished)
    if (now - tItem > PUNISH_COOLDOWN_MS) lastPunished.delete(k);
}, 60_000).unref();

/** Nach Änderungen an den Einstellungen aufrufen, damit sie sofort gelten. */
export function invalidateAutomod(guildId: string) {
  cache.delete(guildId);
}

async function load(db: Db, guildId: string): Promise<GuildAutomod> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;

  const [settings, rules, exemptions] = await Promise.all([
    getSettings(db, guildId),
    db.select().from(automodRules).where(eq(automodRules.guildId, guildId)),
    db
      .select()
      .from(automodExemptions)
      .where(eq(automodExemptions.guildId, guildId)),
  ]);
  const ruleMap = new Map(
    rules.filter((r) => r.enabled).map((r) => [r.filter, r]),
  );
  const entry: GuildAutomod = {
    enabled: settings.automodEnabled,
    rules: ruleMap,
    words: compileWordList(ruleMap.get("words")?.config.words ?? []),
    exemptRoles: new Set(
      exemptions.filter((e) => e.kind === "role").map((e) => e.targetId),
    ),
    exemptChannels: new Set(
      exemptions.filter((e) => e.kind === "channel").map((e) => e.targetId),
    ),
    loadedAt: Date.now(),
  };
  cache.set(guildId, entry);
  return entry;
}

function isExempt(
  member: GuildMember,
  channelId: string,
  parentId: string | null,
  am: GuildAutomod,
) {
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true; // Moderatoren
  if (
    am.exemptChannels.has(channelId) ||
    (parentId && am.exemptChannels.has(parentId))
  )
    return true;
  return member.roles.cache.some((r) => am.exemptRoles.has(r.id));
}

function evaluate(
  filter: AutomodFilter,
  message: Message<true>,
  rule: AutomodRule,
  am: GuildAutomod,
): string | null {
  const content = message.content;
  switch (filter) {
    case "words":
      return checkWords(content, am.words);
    case "invites":
      return checkInvites(content);
    case "links":
      return checkLinks(content, rule.config.allowedDomains);
    case "caps":
      return checkCaps(content, rule.config.threshold);
    case "mentions": {
      const count = message.mentions.users.size + message.mentions.roles.size;
      const everyone =
        /@(everyone|here)/.test(content) &&
        !message.member?.permissions.has(PermissionFlagsBits.MentionEveryone);
      return checkMentions(count, everyone, rule.config.threshold);
    }
    case "phishing":
      return null; // eigener Schritt, siehe phishingStep
    case "spam":
      return spam.check(
        `${message.guildId}:${message.author.id}`,
        content,
        rule.config.threshold,
      );
  }
}

/** Prüft eine neue oder bearbeitete Nachricht. Liefert true, wenn die Nachricht entfernt wurde. */
export async function handleMessage(
  message: Message | PartialMessage,
  db: Db,
  { edited = false } = {},
): Promise<boolean> {
  if (
    !message.inGuild() ||
    message.author.bot ||
    message.webhookId ||
    !message.member
  )
    return false;
  const am = await load(db, message.guildId);
  if (!am.enabled || am.rules.size === 0) return false;
  const channel = message.channel;
  const exempt = isExempt(
    message.member,
    channel.id,
    "parentId" in channel ? channel.parentId : null,
    am,
  );
  // Betrugslinks prüfen wir auch bei Ausnahmen und beim Team: gekaperte Konten gibt es überall. Nur der Inhaber bleibt außen vor.
  const phishing = am.rules.get("phishing");
  if (
    phishing &&
    message.author.id !== message.guild.ownerId &&
    (await phishingStep(message, phishing, db, edited, exempt))
  )
    return true;
  if (exempt) return false;

  for (const filter of FILTER_ORDER) {
    if (filter === "phishing") continue;
    if (edited && filter === "spam") continue; // Bearbeitungen zählen nicht als neue Nachrichten
    const rule = am.rules.get(filter);
    if (!rule) continue;
    const violation = evaluate(filter, message, rule, am);
    if (!violation) continue;

    markAutomodDeleted(message.id);
    await message.delete().catch(() => {});
    if (rule.config.notice) void sendNotice(message, rule.config.notice);
    await punish(
      message,
      rule,
      t("Auto-Mod ({n0}): {violation}", {
        n0: t(FILTER_LABELS[filter]),
        violation,
      }),
      db,
    );
    return true;
  }
  return false;
}

const spread = new LinkSpreadTracker();
setInterval(() => spread.sweep(), 60_000).unref();

const HIJACK_TIMEOUT_SECONDS = 60 * 60;

async function phishingStep(
  message: Message<true>,
  rule: AutomodRule,
  db: Db,
  edited: boolean,
  exempt: boolean,
): Promise<boolean> {
  const text = [
    message.content,
    ...message.embeds.map((e) => e.url ?? ""),
  ].join("\n");
  const links = extractLinks(text);
  if (!links.length) return false;
  const opts = {
    blocked: rule.config.blockedDomains,
    allowed: rule.config.allowedDomains,
    listed:
      rule.config.externalLists === false ? undefined : externalPhishingList(),
  };
  let reason = checkPhishing(text, opts);
  if (!reason) {
    const targets = await shortLinkTargets(links);
    const viaShort = targets.length ? checkPhishing(text, opts, targets) : null;
    if (viaShort)
      reason = t("{viaShort} (hinter einem Kurzlink)", { viaShort });
  }
  // Derselbe Link in mehreren Kanälen kurz hintereinander: typisch für gekaperte Konten.
  const canSpread =
    !edited &&
    !exempt &&
    !message.member!.permissions.has(PermissionFlagsBits.ManageMessages);
  const copies = canSpread
    ? spread.record(message.guildId, message.author.id, links, {
        channelId: message.channelId,
        messageId: message.id,
      })
    : null;
  if (!reason && !copies) return false;

  for (const c of copies ?? []) {
    if (c.messageId === message.id) continue;
    markAutomodDeleted(c.messageId);
    const ch = message.guild.channels.cache.get(c.channelId);
    if (ch?.isTextBased())
      await ch.messages.delete(c.messageId).catch(() => {});
  }
  markAutomodDeleted(message.id);
  await message.delete().catch(() => {});
  if (rule.config.notice) void sendNotice(message, rule.config.notice);

  const why =
    reason ??
    t(
      "Gleicher Link in {size} Kanälen innerhalb von 2 Minuten, Konto vermutlich gekapert",
      { size: new Set(copies!.map((c) => c.channelId)).size },
    );
  if (copies) {
    await message.author
      .send(
        t(
          "Von deinem Konto wurde auf **{name}** derselbe Link in mehreren Kanälen gepostet. Falls du das nicht warst, ist dein Konto vermutlich gekapert: ",
          { name: message.guild.name },
        ) +
          t(
            "Ändere sofort dein Passwort, schalte die Zwei-Faktor-Anmeldung ein und melde unter Einstellungen → Geräte alle unbekannten Geräte ab.",
          ),
      )
      .catch(() => {});
  }
  await postPhishingNotice(
    message,
    db,
    t("Auto-Mod (Anti-Phishing): {why}", { why }),
    copies
      ? t("{length} Kopien gelöscht.", { length: copies.length })
      : undefined,
  );
  // Bei gekaperten Konten mindestens stummschalten, damit nicht weiter gespammt wird.
  const effective: AutomodRule =
    copies && (rule.action === "delete" || rule.action === "warn")
      ? { ...rule, action: "timeout", durationSeconds: HIJACK_TIMEOUT_SECONDS }
      : rule;
  if (effective.action !== "delete")
    await punish(
      message,
      effective,
      t("Auto-Mod (Anti-Phishing): {why}", { why }).slice(0, 500),
      db,
    );
  return true;
}

const NOTICE_LIFETIME_MS = 10_000;

/** Kurzer Hinweis im Kanal, der sich nach 10 Sekunden selbst löscht. */
async function sendNotice(message: Message<true>, template: string) {
  if (!message.channel.isSendable()) return;
  const text = renderTemplate(template, {
    user: userMention(message.author.id),
    username: message.author.globalName ?? message.author.username,
    server: message.guild.name,
    membercount: message.guild.memberCount,
  }).slice(0, 2000);
  const sent = await message.channel
    .send({ content: text, allowedMentions: { users: [message.author.id] } })
    .catch(() => null);
  if (sent)
    setTimeout(
      () => void sent.delete().catch(() => {}),
      NOTICE_LIFETIME_MS,
    ).unref();
}

async function punish(
  message: Message<true>,
  rule: AutomodRule,
  reason: string,
  db: Db,
) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const me = message.guild.members.me;
  // Bei Spam nicht für jede einzelne Nachricht erneut bestrafen.
  if (!me || (lastPunished.get(key) ?? 0) > now - PUNISH_COOLDOWN_MS) return;
  lastPunished.set(key, now);

  if (rule.action === "delete") {
    const settings = await getSettings(db, message.guildId);
    if (!settings.modLogChannelId) return;
    const log = await message.guild.channels
      .fetch(settings.modLogChannelId)
      .catch(() => null);
    if (!log?.isSendable()) return;
    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(t("Nachricht entfernt (Auto-Mod)"))
      .addFields(
        {
          name: t("Mitglied"),
          value: `${userMention(message.author.id)} (${message.author.id})`,
          inline: true,
        },
        { name: t("Kanal"), value: `<#${message.channelId}>`, inline: true },
        { name: t("Grund"), value: reason },
        {
          name: t("Inhalt"),
          value: message.content.slice(0, 1000) || "(leer)",
        },
      )
      .setTimestamp();
    await log
      .send({ embeds: [embed], allowedMentions: { parse: [] } })
      .catch(() => {});
    return;
  }

  if (rule.action !== "ban" && !message.member!.moderatable) return;
  try {
    await moderate({
      db,
      guild: message.guild,
      type: rule.action,
      target: message.author,
      member: message.member,
      moderatorId: me.id,
      reason,
      durationSeconds:
        rule.action === "timeout"
          ? (rule.durationSeconds ?? 600)
          : rule.durationSeconds,
      automatic: true,
    });
  } catch (err) {
    logger.warn(
      { err, guildId: message.guildId, action: rule.action },
      "Auto-Mod-Strafe fehlgeschlagen",
    );
  }
}

/** Raid-Schutz: bei vielen Beitritten in kurzer Zeit warnen und auf Wunsch eingreifen. */
export async function handleMemberJoin(member: GuildMember, db: Db) {
  const settings = await getSettings(db, member.guild.id);
  if (!settings.raidEnabled) return;

  const now = Date.now();
  const inRaid = (raidUntil.get(member.guild.id) ?? 0) > now;
  const triggered = joins.record(
    member.guild.id,
    settings.raidJoinThreshold,
    settings.raidWindowSeconds,
    now,
  );
  if (!triggered && !inRaid) return;

  raidUntil.set(member.guild.id, now + RAID_MODE_MS);

  if (!inRaid && settings.modLogChannelId) {
    const log = await member.guild.channels
      .fetch(settings.modLogChannelId)
      .catch(() => null);
    if (log?.isSendable()) {
      const action =
        settings.raidAction === "alert"
          ? t("Nur Warnung, keine automatische Aktion.")
          : t(
              "Neue Mitglieder erhalten 5 Minuten lang automatisch: {raidAction}.",
              { raidAction: settings.raidAction },
            );
      await log
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xd63031)
              .setTitle("Möglicher Raid erkannt")
              .setDescription(
                `${settings.raidJoinThreshold} oder mehr Beitritte innerhalb von ${settings.raidWindowSeconds} Sekunden.\n${action}`,
              )
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    }
  }

  const me = member.guild.members.me;
  if (!me || settings.raidAction === "alert" || member.user.bot) return;
  const type = settings.raidAction as "kick" | "ban" | "timeout";
  try {
    await moderate({
      db,
      guild: member.guild,
      type,
      target: member.user,
      member,
      moderatorId: me.id,
      reason: t("Raid-Schutz: Beitritt während eines erkannten Raids"),
      durationSeconds: type === "timeout" ? RAID_TIMEOUT_SECONDS : null,
      automatic: true,
    });
  } catch (err) {
    logger.warn(
      { err, guildId: member.guild.id },
      "Raid-Schutz konnte nicht eingreifen",
    );
  }
}

/** Liefert die Regel eines Filters und legt sie bei Bedarf mit Standardwerten an. */
export async function getRule(
  db: Db,
  guildId: string,
  filter: AutomodFilter,
): Promise<AutomodRule> {
  await db
    .insert(automodRules)
    .values({ guildId, filter })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(automodRules)
    .where(
      and(eq(automodRules.guildId, guildId), eq(automodRules.filter, filter)),
    );
  return row!;
}
