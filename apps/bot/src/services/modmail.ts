import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ThreadAutoArchiveDuration,
  time,
  userMention,
  type ButtonInteraction,
  type Client,
  type Guild,
  type Message,
  type StringSelectMenuInteraction,
  type ThreadChannel,
  type User,
} from "discord.js";
import { and, count, desc, eq, modCases, modmailSettings, modmailThreads, sql, type Db, type ModmailSettings } from "@libremod/db";
import { t } from "@libremod/shared";
import { logger } from "../logger.js";
import { inGuildLocale } from "../i18n.js";

/**
 * Modmail: Wer dem Bot eine Direktnachricht schreibt, landet in einem Thread im Modmail-Kanal des Servers.
 * Antworten aus dem Thread gehen per Direktnachricht zurück. Nachrichten im Thread, die mit „!“ oder „//“
 * beginnen, sind interne Notizen und werden nicht weitergeleitet.
 */

const PREFIX = "lmmm";
export const isModmailInteraction = (customId: string) => customId.startsWith(`${PREFIX}:`);

const BLUE = 0x5865f2;
const GREEN = 0x2e9e6a;
const isNote = (text: string) => text.startsWith("!") || text.startsWith("//");

/** Thread → Gespräch. null = kein Modmail-Thread (damit nicht jede Thread-Nachricht die Datenbank fragt). */
const threadCache = new Map<string, { id: number; guildId: string; userId: string } | null>();
/** Erste Nachricht, solange die Person noch den Server auswählt. */
const pending = new Map<string, { message: Message; at: number }>();
/** Hinweis „kein Server mit Modmail“ nur selten schicken. */
const hinted = new Map<string, number>();
const PENDING_MS = 5 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, p] of pending) if (now - p.at > PENDING_MS) pending.delete(k);
  for (const [k, at] of hinted) if (now - at > 10 * 60_000) hinted.delete(k);
  if (threadCache.size > 5000) threadCache.clear();
}, 60_000).unref();

async function settingsOf(db: Db, guildId: string): Promise<ModmailSettings | null> {
  const [row] = await db.select().from(modmailSettings).where(eq(modmailSettings.guildId, guildId));
  return row ?? null;
}

/** Server, auf denen die Person Mitglied ist und Modmail an ist. */
async function candidates(client: Client, db: Db, userId: string) {
  const rows = await db.select().from(modmailSettings).where(eq(modmailSettings.enabled, true));
  const out: { guild: Guild; settings: ModmailSettings }[] = [];
  for (const s of rows) {
    const guild = client.guilds.cache.get(s.guildId);
    if (!guild || !s.channelId || s.blockedUserIds.includes(userId)) continue;
    if (await guild.members.fetch(userId).catch(() => null)) out.push({ guild, settings: s });
  }
  return out;
}

function attachmentText(message: Message) {
  return [...message.attachments.values()].map((a) => `[${a.name}](${a.url})`).join("\n");
}

function body(message: Message) {
  const parts = [message.content, attachmentText(message)].filter(Boolean);
  return (parts.join("\n\n") || t("(kein Text)")).slice(0, 4000);
}

/** Direktnachricht an den Bot. */
export async function handleDirectMessage(message: Message, db: Db) {
  if (message.inGuild() || message.author.bot || message.channel.type !== ChannelType.DM) return;
  const userId = message.author.id;

  // Läuft schon ein Gespräch? Dann dorthin.
  const [open] = await db
    .select()
    .from(modmailThreads)
    .where(and(eq(modmailThreads.userId, userId), eq(modmailThreads.open, true)))
    .orderBy(desc(modmailThreads.createdAt))
    .limit(1);
  if (open) {
    const thread = await fetchThread(message.client, open.threadId);
    if (thread && !thread.locked) {
      if (thread.archived) await thread.setArchived(false).catch(() => {});
      await inGuildLocale(open.guildId, () => relayToThread(thread, message));
      await db.update(modmailThreads).set({ messages: sql`${modmailThreads.messages} + 1` }).where(eq(modmailThreads.id, open.id));
      return;
    }
    // Thread wurde gelöscht oder gesperrt: Gespräch gilt als beendet.
    await db.update(modmailThreads).set({ open: false, closedAt: new Date() }).where(eq(modmailThreads.id, open.id));
  }

  const list = await candidates(message.client, db, userId);
  if (list.length === 0) {
    if (Date.now() - (hinted.get(userId) ?? 0) < 10 * 60_000) return;
    hinted.set(userId, Date.now());
    await message
      .reply(t("Hallo! Ich bin ein Moderations-Bot. Auf deinen Servern ist gerade keine Modmail eingerichtet, deshalb kann ich deine Nachricht nicht weitergeben."))
      .catch(() => {});
    return;
  }
  if (list.length === 1) {
    await inGuildLocale(list[0]!.guild.id, () => openConversation(db, list[0]!.guild, list[0]!.settings, message));
    return;
  }
  pending.set(userId, { message, at: Date.now() });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:pick`)
    .setPlaceholder(t("Server auswählen"))
    .addOptions(list.slice(0, 25).map(({ guild }) => ({ label: guild.name.slice(0, 100), value: guild.id })));
  await message
    .reply({
      content: t("An welches Team soll deine Nachricht gehen?"),
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    })
    .catch(() => {});
}

async function fetchThread(client: Client, threadId: string): Promise<ThreadChannel | null> {
  const channel = await client.channels.fetch(threadId).catch(() => null);
  return channel?.isThread() ? channel : null;
}

async function relayToThread(thread: ThreadChannel, message: Message) {
  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(body(message))
    .setTimestamp(message.createdAt);
  const sent = await thread.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  await message.react(sent ? "✅" : "❌").catch(() => {});
}

async function openConversation(db: Db, guild: Guild, settings: ModmailSettings, first: Message) {
  const user = first.author;
  const channel = settings.channelId ? await guild.channels.fetch(settings.channelId).catch(() => null) : null;
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    await first.reply(t("Die Modmail von {guild} ist gerade nicht erreichbar. Versuch es bitte später noch einmal.", { guild: guild.name })).catch(() => {});
    return;
  }
  const thread = await channel.threads.create({
    name: `${user.username}`.slice(0, 90),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: t("Modmail von {user}", { user: user.tag }),
  });
  const [row] = await db.insert(modmailThreads).values({ guildId: guild.id, userId: user.id, threadId: thread.id, messages: 1 }).returning();
  threadCache.set(thread.id, { id: row!.id, guildId: guild.id, userId: user.id });

  await thread.send({
    content: settings.pingRoleId ? `<@&${settings.pingRoleId}>` : undefined,
    embeds: [await headerEmbed(db, guild, user)],
    components: [controls(row!.id)],
    allowedMentions: { roles: settings.pingRoleId ? [settings.pingRoleId] : [] },
  });
  await relayToThread(thread, first);
  await first.author
    .send({
      embeds: [new EmbedBuilder().setColor(GREEN).setTitle(t("Nachricht an das Team von {guild}", { guild: guild.name })).setDescription(t(settings.greeting))],
    })
    .catch(() => {});
}

async function headerEmbed(db: Db, guild: Guild, user: User) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  const [[cases], [earlier]] = await Promise.all([
    db.select({ n: count() }).from(modCases).where(and(eq(modCases.guildId, guild.id), eq(modCases.targetId, user.id))),
    db.select({ n: count() }).from(modmailThreads).where(and(eq(modmailThreads.guildId, guild.id), eq(modmailThreads.userId, user.id))),
  ]);
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(t("Neue Modmail"))
    .setThumbnail(user.displayAvatarURL())
    .setDescription(t("Antworten in diesem Thread gehen per Direktnachricht an {user}. Nachrichten mit „!“ oder „//“ am Anfang bleiben intern.", { user: userMention(user.id) }))
    .addFields(
      { name: t("Person"), value: `${user.tag} (${user.id})`, inline: false },
      { name: t("Konto erstellt"), value: time(user.createdAt, "R"), inline: true },
      { name: t("Beigetreten"), value: member?.joinedAt ? time(member.joinedAt, "R") : "?", inline: true },
      { name: t("Fälle"), value: String(cases?.n ?? 0), inline: true },
      { name: t("Frühere Gespräche"), value: String(Math.max(0, (earlier?.n ?? 1) - 1)), inline: true },
    );
}

function controls(id: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}:close:${id}`).setLabel(t("Schließen")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX}:block:${id}`).setLabel(t("Schließen und Person sperren")).setStyle(ButtonStyle.Danger),
  );
}

async function conversationOf(db: Db, threadId: string) {
  if (threadCache.has(threadId)) return threadCache.get(threadId)!;
  const [row] = await db
    .select({ id: modmailThreads.id, guildId: modmailThreads.guildId, userId: modmailThreads.userId, open: modmailThreads.open })
    .from(modmailThreads)
    .where(eq(modmailThreads.threadId, threadId));
  const hit = row?.open ? { id: row.id, guildId: row.guildId, userId: row.userId } : null;
  threadCache.set(threadId, hit);
  return hit;
}

/** Nachricht des Teams im Modmail-Thread → Direktnachricht. */
export async function handleThreadMessage(message: Message, db: Db) {
  if (!message.inGuild() || message.author.bot || message.system || !message.channel.isThread()) return;
  const conv = await conversationOf(db, message.channelId);
  if (!conv || isNote(message.content)) return;
  const settings = await settingsOf(db, conv.guildId);
  const user = await message.client.users.fetch(conv.userId).catch(() => null);
  const name = settings?.showStaffNames ? (message.member?.displayName ?? message.author.username) : t("Team von {guild}", { guild: message.guild.name });
  const embed = new EmbedBuilder()
    .setColor(GREEN)
    .setAuthor({ name, iconURL: settings?.showStaffNames ? message.author.displayAvatarURL() : (message.guild.iconURL() ?? undefined) })
    .setDescription(body(message))
    .setTimestamp(message.createdAt);
  const sent = user ? await user.send({ embeds: [embed] }).catch(() => null) : null;
  await message.react(sent ? "✅" : "❌").catch(() => {});
  if (!sent) await message.reply(t("Konnte nicht zugestellt werden. Vielleicht hat die Person Direktnachrichten ausgeschaltet.")).catch(() => {});
  else await db.update(modmailThreads).set({ messages: sql`${modmailThreads.messages} + 1` }).where(eq(modmailThreads.id, conv.id));
}

/** Gespräch beenden. Gibt false zurück, wenn es schon zu war. */
export async function closeConversation(db: Db, client: Client, id: number, closedBy: string, block = false): Promise<boolean> {
  const [row] = await db
    .update(modmailThreads)
    .set({ open: false, closedAt: new Date(), closedBy })
    .where(and(eq(modmailThreads.id, id), eq(modmailThreads.open, true)))
    .returning();
  if (!row) return false;
  threadCache.set(row.threadId, null);
  const settings = await settingsOf(db, row.guildId);
  if (block && settings && !settings.blockedUserIds.includes(row.userId)) {
    await db
      .update(modmailSettings)
      .set({ blockedUserIds: [...settings.blockedUserIds, row.userId].slice(-1000) })
      .where(eq(modmailSettings.guildId, row.guildId));
  }
  const guild = client.guilds.cache.get(row.guildId);
  const user = await client.users.fetch(row.userId).catch(() => null);
  if (user && settings && !block)
    await user
      .send({ embeds: [new EmbedBuilder().setColor(0x8a8f98).setTitle(guild?.name ?? "Modmail").setDescription(t(settings.closing))] })
      .catch(() => {});
  const thread = await fetchThread(client, row.threadId);
  if (thread) {
    await thread.send(block ? t("Gespräch geschlossen, die Person ist für Modmail gesperrt.") : t("Gespräch geschlossen.")).catch(() => {});
    await thread.setLocked(true).catch(() => {});
    await thread.setArchived(true).catch(() => {});
  }
  return true;
}

export async function handleModmailInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction, db: Db) {
  const [, action, idText] = interaction.customId.split(":");
  try {
    if (action === "pick" && interaction.isStringSelectMenu()) {
      const p = pending.get(interaction.user.id);
      const guildId = interaction.values[0];
      const choice = (await candidates(interaction.client, db, interaction.user.id)).find((c) => c.guild.id === guildId);
      if (!p || !choice) return void (await interaction.update({ content: t("Das hat zu lange gedauert. Schreib mir bitte noch einmal."), components: [] }));
      pending.delete(interaction.user.id);
      await interaction.update({ content: t("Weitergeleitet an {guild}.", { guild: choice.guild.name }), components: [] });
      await inGuildLocale(choice.guild.id, () => openConversation(db, choice.guild, choice.settings, p.message));
      return;
    }
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages))
      return void (await interaction.reply({ content: t("Dafür fehlen dir die Rechte."), flags: MessageFlags.Ephemeral }));
    const id = Number(idText);
    if (!Number.isInteger(id)) return;
    await interaction.deferUpdate();
    const closed = await closeConversation(db, interaction.client, id, interaction.user.id, action === "block");
    await interaction.editReply({ components: [] }).catch(() => {});
    if (!closed) await interaction.followUp({ content: t("Das Gespräch ist schon geschlossen."), flags: MessageFlags.Ephemeral }).catch(() => {});
  } catch (err) {
    logger.error({ err }, "Modmail fehlgeschlagen");
    if (!interaction.replied && !interaction.deferred)
      await interaction.reply({ content: t("Da ist leider etwas schiefgelaufen."), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}
