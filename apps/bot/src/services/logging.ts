import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  channelMention,
  roleMention,
  time,
  userMention,
  type Client,
  type ReadonlyCollection,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type PartialUser,
  type Role,
  type Snowflake,
  type User,
  type VoiceState,
  type DMChannel,
  type NonThreadGuildBasedChannel,
  type GuildTextBasedChannel,
} from "discord.js";
import {
  eq,
  logChannels,
  logIgnoredChannels,
  type Db,
  type LogCategory,
} from "@libremod/db";
import {
  diffIds,
  formatTranscript,
  isNewAccount,
  truncate,
} from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";

export const LOG_LABELS: Record<LogCategory, string> = {
  messages: "Nachrichten",
  members: "Beitritte & Austritte",
  member_updates: "Mitglieder-Änderungen",
  server: "Server-Änderungen",
  voice: "Sprachkanäle",
};

const COLORS = {
  red: 0xe5534b,
  orange: 0xf59e42,
  blue: 0x4cb4ff,
  green: 0x2ecc71,
  violet: 0x7c5cff,
  gray: 0x95a5a6,
};

interface GuildLogging {
  channels: Map<LogCategory, string>;
  ignored: Set<string>;
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, GuildLogging>();

/** Nachrichten, die die Auto-Mod gerade gelöscht hat, damit das Log das kennzeichnen kann. */
const automodDeleted = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, at] of automodDeleted)
    if (at < cutoff) automodDeleted.delete(id);
}, 60_000).unref();

export function markAutomodDeleted(messageId: string) {
  automodDeleted.set(messageId, Date.now());
}

/** Nach Änderungen an den Einstellungen aufrufen, damit sie sofort gelten. */
export function invalidateLogging(guildId: string) {
  cache.delete(guildId);
}

export async function loadLogging(
  db: Db,
  guildId: string,
): Promise<GuildLogging> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;
  const [channels, ignored] = await Promise.all([
    db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
    db
      .select()
      .from(logIgnoredChannels)
      .where(eq(logIgnoredChannels.guildId, guildId)),
  ]);
  const entry: GuildLogging = {
    channels: new Map(channels.map((c) => [c.category, c.channelId])),
    ignored: new Set(ignored.map((i) => i.channelId)),
    loadedAt: Date.now(),
  };
  cache.set(guildId, entry);
  return entry;
}

/** Schickt eine Log-Meldung in den Kanal der jeweiligen Log-Art, falls eingestellt. */
async function send(
  db: Db,
  guild: Guild,
  category: LogCategory,
  embed: EmbedBuilder,
  files: AttachmentBuilder[] = [],
) {
  const cfg = await loadLogging(db, guild.id);
  const channelId = cfg.channels.get(category);
  if (!channelId) return;
  try {
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId));
    if (!channel?.isSendable()) return;
    await channel.send({
      embeds: [embed.setTimestamp()],
      files,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    logger.warn(
      { err, guildId: guild.id, channelId, category },
      "Log-Meldung konnte nicht gesendet werden",
    );
  }
}

/** Nachrichten in ignorierten Kanälen (oder deren Kategorie) und in Log-Kanälen selbst werden nicht geloggt. */
function isIgnored(
  cfg: GuildLogging,
  channel: { id: string; parentId?: string | null } | null,
) {
  if (!channel) return false;
  if (
    cfg.ignored.has(channel.id) ||
    (channel.parentId && cfg.ignored.has(channel.parentId))
  )
    return true;
  for (const id of cfg.channels.values()) if (id === channel.id) return true;
  return false;
}

const who = (user: { id: string; tag?: string } | null | undefined) =>
  user
    ? `${userMention(user.id)} · ${user.tag ?? "unbekannt"} (${user.id})`
    : "Unbekannt";

const attachmentList = (message: Message | PartialMessage) =>
  message.attachments.size
    ? truncate(message.attachments.map((a) => a.name).join("\n"), 1024)
    : null;

// ---------- Nachrichten ----------

export async function onMessageDelete(
  message: Message | PartialMessage,
  db: Db,
) {
  if (!message.guild || message.author?.bot || message.webhookId) return;
  const cfg = await loadLogging(db, message.guild.id);
  if (
    !cfg.channels.has("messages") ||
    isIgnored(cfg, message.channel as GuildTextBasedChannel)
  )
    return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle(t("Nachricht gelöscht"))
    .addFields(
      { name: t("Von"), value: who(message.author), inline: true },
      {
        name: t("Kanal"),
        value: channelMention(message.channelId),
        inline: true,
      },
      {
        name: t("Inhalt"),
        value: message.partial
          ? t(
              "Unbekannt. Die Nachricht war älter als der Zwischenspeicher des Bots.",
            )
          : truncate(message.content, 1024),
      },
    )
    .setFooter({ text: t("Nachricht {id}", { id: message.id }) });
  const files = attachmentList(message);
  if (files) embed.addFields({ name: t("Anhänge"), value: files });
  if (automodDeleted.has(message.id))
    embed.setDescription(t("Von der Auto-Mod entfernt."));
  await send(db, message.guild, "messages", embed);
}

export async function onMessageBulkDelete(
  messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
  channel: GuildTextBasedChannel,
  db: Db,
) {
  const cfg = await loadLogging(db, channel.guild.id);
  if (!cfg.channels.has("messages") || isIgnored(cfg, channel)) return;

  const known = messages.filter(
    (m): m is Message => !m.partial && !m.author.bot,
  );
  const embed = new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle(
      t("{size} Nachrichten auf einmal gelöscht", { size: messages.size }),
    )
    .addFields({
      name: t("Kanal"),
      value: channelMention(channel.id),
      inline: true,
    })
    .setDescription(
      known.size
        ? t(
            "Der Inhalt von {size} Nachricht(en) ist in der angehängten Datei.",
            { size: known.size },
          )
        : t("Keine der Nachrichten war mehr im Zwischenspeicher des Bots."),
    );
  const files = known.size
    ? [
        new AttachmentBuilder(
          Buffer.from(
            formatTranscript(
              known.map((m) => ({
                createdAt: m.createdAt,
                authorTag: m.author.tag,
                authorId: m.author.id,
                content: m.content,
                attachments: m.attachments.map((a) => a.name),
              })),
            ),
            "utf8",
          ),
          { name: `geloescht-${channel.name}.txt` },
        ),
      ]
    : [];
  await send(db, channel.guild, "messages", embed, files);
}

export async function onMessageUpdate(
  before: Message | PartialMessage,
  after: Message | PartialMessage,
  db: Db,
) {
  // Ohne alten Inhalt lässt sich nicht sagen, ob sich der Text überhaupt geändert hat.
  if (
    !after.guild ||
    before.partial ||
    after.partial ||
    after.author.bot ||
    after.webhookId
  )
    return;
  if (before.content === after.content) return;
  const cfg = await loadLogging(db, after.guild.id);
  if (
    !cfg.channels.has("messages") ||
    isIgnored(cfg, after.channel as GuildTextBasedChannel)
  )
    return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(t("Nachricht bearbeitet"))
    .setURL(after.url)
    .addFields(
      { name: t("Von"), value: who(after.author), inline: true },
      {
        name: t("Kanal"),
        value: channelMention(after.channelId),
        inline: true,
      },
      { name: t("Vorher"), value: truncate(before.content, 1024) },
      { name: t("Nachher"), value: truncate(after.content, 1024) },
    )
    .setFooter({ text: t("Nachricht {id}", { id: after.id }) });
  await send(db, after.guild, "messages", embed);
}

// ---------- Beitritte und Austritte ----------

export async function onMemberJoin(member: GuildMember, db: Db) {
  const created = member.user.createdAt;
  const embed = new EmbedBuilder()
    .setColor(COLORS.green)
    .setTitle(
      member.user.bot ? t("Bot hinzugefügt") : t("Mitglied beigetreten"),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: t("Mitglied"), value: who(member.user) },
      {
        name: t("Konto erstellt"),
        value: `${time(created, "D")} (${time(created, "R")})`,
        inline: true,
      },
      {
        name: t("Mitglieder jetzt"),
        value: String(member.guild.memberCount),
        inline: true,
      },
    );
  if (isNewAccount(created))
    embed.setDescription(t("⚠️ Neues Konto: jünger als 7 Tage."));
  await send(db, member.guild, "members", embed);
}

export async function onMemberLeave(
  member: GuildMember | PartialGuildMember,
  db: Db,
) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.orange)
    .setTitle(t("Mitglied hat den Server verlassen"))
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .addFields({ name: t("Mitglied"), value: who(member.user) });
  if (member.joinedAt)
    embed.addFields({
      name: t("Beigetreten"),
      value: `${time(member.joinedAt, "D")} (${time(member.joinedAt, "R")})`,
      inline: true,
    });
  const roles = member.partial
    ? []
    : member.roles.cache
        .filter((r) => r.id !== member.guild.id)
        .map((r) => roleMention(r.id));
  if (roles.length)
    embed.addFields({
      name: t("Rollen"),
      value: truncate(roles.join(" "), 1024),
    });
  embed.addFields({
    name: t("Hinweis"),
    value: t("Kicks und Bans stehen zusätzlich im Mod-Log."),
  });
  await send(db, member.guild, "members", embed);
}

// ---------- Mitglieder-Änderungen ----------

export async function onMemberUpdate(
  before: GuildMember | PartialGuildMember,
  after: GuildMember,
  db: Db,
) {
  if (before.partial) return;
  const changes: { name: string; value: string }[] = [];

  if (before.nickname !== after.nickname) {
    changes.push({
      name: t("Spitzname"),
      value: `${before.nickname ? `\`${truncate(before.nickname, 100)}\`` : "keiner"} → ${after.nickname ? `\`${truncate(after.nickname, 100)}\`` : "keiner"}`,
    });
  }
  const { added, removed } = diffIds(
    before.roles.cache.keys(),
    after.roles.cache.keys(),
  );
  if (added.length)
    changes.push({
      name: t("Rollen hinzugefügt"),
      value: truncate(added.map(roleMention).join(" "), 1024),
    });
  if (removed.length)
    changes.push({
      name: t("Rollen entfernt"),
      value: truncate(removed.map(roleMention).join(" "), 1024),
    });
  if (!changes.length) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.violet)
    .setTitle(t("Mitglied geändert"))
    .setThumbnail(after.displayAvatarURL({ size: 128 }))
    .addFields({ name: t("Mitglied"), value: who(after.user) }, ...changes);
  await send(db, after.guild, "member_updates", embed);
}

export async function onUserUpdate(
  before: User | PartialUser,
  after: User,
  client: Client,
  db: Db,
) {
  if (before.partial) return;
  const changes: { name: string; value: string }[] = [];
  if (before.username !== after.username)
    changes.push({
      name: t("Benutzername"),
      value: `\`${before.username}\` → \`${after.username}\``,
    });
  if (before.globalName !== after.globalName) {
    changes.push({
      name: t("Anzeigename"),
      value: `${before.globalName ? `\`${before.globalName}\`` : "keiner"} → ${after.globalName ? `\`${after.globalName}\`` : "keiner"}`,
    });
  }
  if (!changes.length) return;

  const embed = () =>
    new EmbedBuilder()
      .setColor(COLORS.violet)
      .setTitle(t("Name geändert"))
      .setThumbnail(after.displayAvatarURL({ size: 128 }))
      .addFields({ name: t("Mitglied"), value: who(after) }, ...changes);
  for (const guild of client.guilds.cache.values()) {
    if (guild.members.cache.has(after.id))
      await send(db, guild, "member_updates", embed());
  }
}

// ---------- Server-Änderungen ----------

const CHANNEL_KIND: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: "Textkanal",
  [ChannelType.GuildVoice]: "Sprachkanal",
  [ChannelType.GuildCategory]: "Kategorie",
  [ChannelType.GuildAnnouncement]: "Ankündigungskanal",
  [ChannelType.GuildStageVoice]: "Bühne",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildMedia]: "Medienkanal",
};

const channelLabel = (c: GuildBasedChannel) =>
  `${CHANNEL_KIND[c.type] ?? "Kanal"} **${c.name}**`;

export async function onChannelCreate(
  channel: NonThreadGuildBasedChannel,
  db: Db,
) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.green)
    .setTitle(t("Kanal erstellt"))
    .setDescription(`${channelLabel(channel)} ${channelMention(channel.id)}`)
    .setFooter({ text: t("Kanal {id}", { id: channel.id }) });
  if (channel.parent)
    embed.addFields({
      name: t("Kategorie"),
      value: channel.parent.name,
      inline: true,
    });
  await send(db, channel.guild, "server", embed);
}

export async function onChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel,
  db: Db,
) {
  if (channel.isDMBased()) return;
  const embed = new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle(t("Kanal gelöscht"))
    .setDescription(channelLabel(channel))
    .setFooter({ text: t("Kanal {id}", { id: channel.id }) });
  if (channel.parent)
    embed.addFields({
      name: t("Kategorie"),
      value: channel.parent.name,
      inline: true,
    });
  await send(db, channel.guild, "server", embed);
}

export async function onChannelUpdate(
  before: DMChannel | NonThreadGuildBasedChannel,
  after: DMChannel | NonThreadGuildBasedChannel,
  db: Db,
) {
  if (before.isDMBased() || after.isDMBased()) return;
  const changes: { name: string; value: string }[] = [];
  if (before.name !== after.name)
    changes.push({
      name: t("Name"),
      value: `\`${before.name}\` → \`${after.name}\``,
    });
  if (before.parentId !== after.parentId) {
    changes.push({
      name: t("Kategorie"),
      value: `${before.parent?.name ?? "keine"} → ${after.parent?.name ?? "keine"}`,
    });
  }
  if ("topic" in before && "topic" in after && before.topic !== after.topic) {
    changes.push({
      name: t("Thema"),
      value: `${truncate(before.topic, 450, "keins")}\n→ ${truncate(after.topic, 450, "keins")}`,
    });
  }
  if ("nsfw" in before && "nsfw" in after && before.nsfw !== after.nsfw) {
    changes.push({
      name: "Ab 18",
      value: after.nsfw ? "eingeschaltet" : "ausgeschaltet",
    });
  }
  if (
    "rateLimitPerUser" in before &&
    "rateLimitPerUser" in after &&
    before.rateLimitPerUser !== after.rateLimitPerUser
  ) {
    changes.push({
      name: t("Langsamer Modus"),
      value: `${before.rateLimitPerUser ?? 0} s → ${after.rateLimitPerUser ?? 0} s`,
    });
  }
  const overwrites = (c: NonThreadGuildBasedChannel) =>
    JSON.stringify(
      [...c.permissionOverwrites.cache.values()]
        .map((o) => [
          o.id,
          o.allow.bitfield.toString(),
          o.deny.bitfield.toString(),
        ])
        .sort(),
    );
  if (overwrites(before) !== overwrites(after))
    changes.push({
      name: t("Berechtigungen"),
      value: t("Die Kanal-Berechtigungen wurden geändert."),
    });
  if (!changes.length) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(t("Kanal geändert"))
    .setDescription(`${channelLabel(after)} ${channelMention(after.id)}`)
    .addFields(changes)
    .setFooter({ text: t("Kanal {id}", { id: after.id }) });
  await send(db, after.guild, "server", embed);
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

export async function onRoleCreate(role: Role, db: Db) {
  const embed = new EmbedBuilder()
    .setColor(role.color || COLORS.green)
    .setTitle(t("Rolle erstellt"))
    .setDescription(`${roleMention(role.id)} **${role.name}**`)
    .setFooter({ text: t("Rolle {id}", { id: role.id }) });
  await send(db, role.guild, "server", embed);
}

export async function onRoleDelete(role: Role, db: Db) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.red)
    .setTitle(t("Rolle gelöscht"))
    .setDescription(`**${role.name}**`)
    .setFooter({ text: t("Rolle {id}", { id: role.id }) });
  await send(db, role.guild, "server", embed);
}

export async function onRoleUpdate(before: Role, after: Role, db: Db) {
  const changes: { name: string; value: string }[] = [];
  if (before.name !== after.name)
    changes.push({
      name: t("Name"),
      value: `\`${before.name}\` → \`${after.name}\``,
    });
  if (before.color !== after.color)
    changes.push({
      name: t("Farbe"),
      value: `${hex(before.color)} → ${hex(after.color)}`,
    });
  if (before.hoist !== after.hoist)
    changes.push({
      name: t("Getrennt anzeigen"),
      value: after.hoist ? "an" : "aus",
    });
  if (before.mentionable !== after.mentionable)
    changes.push({
      name: t("Erwähnbar"),
      value: after.mentionable ? "an" : "aus",
    });
  if (before.permissions.bitfield !== after.permissions.bitfield) {
    const { added, removed } = diffIds(
      before.permissions.toArray(),
      after.permissions.toArray(),
    );
    if (added.length)
      changes.push({
        name: t("Rechte dazu"),
        value: truncate(added.map((p) => `\`${p}\``).join(", "), 1024),
      });
    if (removed.length)
      changes.push({
        name: t("Rechte entzogen"),
        value: truncate(removed.map((p) => `\`${p}\``).join(", "), 1024),
      });
    if (
      after.permissions.has(PermissionsBitField.Flags.Administrator) &&
      !before.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      changes.unshift({
        name: t("Achtung"),
        value: t("Diese Rolle hat jetzt Administrator-Rechte."),
      });
    }
  }
  if (!changes.length) return;

  const embed = new EmbedBuilder()
    .setColor(after.color || COLORS.blue)
    .setTitle(t("Rolle geändert"))
    .setDescription(`${roleMention(after.id)} **${after.name}**`)
    .addFields(changes)
    .setFooter({ text: t("Rolle {id}", { id: after.id }) });
  await send(db, after.guild, "server", embed);
}

export async function onGuildUpdate(before: Guild, after: Guild, db: Db) {
  if (before.name === after.name) return;
  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(t("Server umbenannt"))
    .addFields({
      name: t("Name"),
      value: `\`${before.name}\` → \`${after.name}\``,
    });
  await send(db, after, "server", embed);
}

// ---------- Sprachkanäle ----------

export async function onVoiceStateUpdate(
  before: VoiceState,
  after: VoiceState,
  db: Db,
) {
  if (before.channelId === after.channelId) return; // Stummschalten usw. ignorieren
  const member = after.member ?? before.member;
  if (!member || member.user.bot) return;

  let embed: EmbedBuilder;
  if (!before.channelId) {
    embed = new EmbedBuilder()
      .setColor(COLORS.green)
      .setTitle(t("Sprachkanal betreten"))
      .addFields(
        { name: t("Mitglied"), value: who(member.user) },
        {
          name: t("Kanal"),
          value: channelMention(after.channelId!),
          inline: true,
        },
      );
  } else if (!after.channelId) {
    embed = new EmbedBuilder()
      .setColor(COLORS.orange)
      .setTitle(t("Sprachkanal verlassen"))
      .addFields(
        { name: t("Mitglied"), value: who(member.user) },
        {
          name: t("Kanal"),
          value: channelMention(before.channelId),
          inline: true,
        },
      );
  } else {
    embed = new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle(t("Sprachkanal gewechselt"))
      .addFields(
        { name: t("Mitglied"), value: who(member.user) },
        {
          name: t("Von"),
          value: channelMention(before.channelId),
          inline: true,
        },
        {
          name: t("Nach"),
          value: channelMention(after.channelId),
          inline: true,
        },
      );
  }
  await send(db, after.guild, "voice", embed);
}
