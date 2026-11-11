import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import {
  and,
  count,
  eq,
  isNotNull,
  lte,
  sql,
  ticketCategories,
  ticketSettings,
  tickets,
  type Db,
  type Ticket,
  type TicketAnswer,
  type TicketCategory,
  type TicketSettings,
} from "@libremod/db";
import {
  ticketDuration,
  formatTranscriptHtml,
  parseTicketCustomId,
  ratingStars,
  renderTicketText,
  ticketChannelName,
  ticketCustomId,
  truncate,
  type TranscriptEntry,
} from "@libremod/shared";
import { logger } from "../logger.js";

const COLOR = 0x4cb4ff;
const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];
const STAFF_ALLOW = [...MEMBER_ALLOW, PermissionFlagsBits.ManageMessages];
const BOT_ALLOW = [...STAFF_ALLOW, PermissionFlagsBits.ManageChannels];
/** Höchstens so viele Nachrichten landen im Transkript. */
const TRANSCRIPT_LIMIT = 5000;

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export function isTicketInteraction(customId: string) {
  return parseTicketCustomId(customId) !== null;
}

// --- Laden und Hilfsfunktionen ---

async function getSettings(db: Db, guildId: string): Promise<TicketSettings> {
  const [s] = await db.select().from(ticketSettings).where(eq(ticketSettings.guildId, guildId));
  if (s) return s;
  const [created] = await db.insert(ticketSettings).values({ guildId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(ticketSettings).where(eq(ticketSettings.guildId, guildId)))[0]!;
}

async function getCategory(db: Db, guildId: string, id: number) {
  const [c] = await db.select().from(ticketCategories).where(and(eq(ticketCategories.id, id), eq(ticketCategories.guildId, guildId)));
  return c ?? null;
}

async function nextNumber(db: Db, guildId: string) {
  await getSettings(db, guildId);
  const [row] = await db
    .update(ticketSettings)
    .set({ nextNumber: sql`${ticketSettings.nextNumber} + 1` })
    .where(eq(ticketSettings.guildId, guildId))
    .returning({ n: ticketSettings.nextNumber });
  return row!.n - 1;
}

/** Team: Rollen der Ticket-Art, ohne eigene Rollen alle mit „Kanäle verwalten“. „Server verwalten“ darf immer. */
export function isStaff(member: GuildMember, category: Pick<TicketCategory, "staffRoleIds"> | null) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const roles = category?.staffRoleIds ?? [];
  if (roles.length) return roles.some((r) => member.roles.cache.has(r));
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

export async function ticketForChannel(db: Db, channelId: string) {
  const [t] = await db.select().from(tickets).where(and(eq(tickets.channelId, channelId), eq(tickets.status, "open")));
  return t ?? null;
}

async function logChannel(guild: Guild, settings: TicketSettings) {
  if (!settings.logChannelId) return null;
  const ch = await guild.channels.fetch(settings.logChannelId).catch(() => null);
  return ch?.isSendable() ? ch : null;
}

async function sendLog(guild: Guild, settings: TicketSettings, payload: Parameters<GuildTextBasedChannel["send"]>[0]) {
  const ch = await logChannel(guild, settings);
  if (ch) await ch.send(payload).catch((err) => logger.warn({ err, guildId: guild.id }, "Ticket-Log fehlgeschlagen"));
}

const privateReply = async (i: ComponentInteraction, content: string) => {
  if (i.deferred || i.replied) await i.editReply({ content, components: [] });
  else await i.reply({ content, flags: MessageFlags.Ephemeral });
};

// --- Öffnen ---

async function openCheck(db: Db, member: GuildMember, category: TicketCategory, settings: TicketSettings): Promise<string | null> {
  if (settings.blockedRoleIds.some((r) => member.roles.cache.has(r))) return "Du kannst auf diesem Server keine Tickets öffnen.";
  const open = await db
    .select({ channelId: tickets.channelId })
    .from(tickets)
    .where(and(eq(tickets.guildId, member.guild.id), eq(tickets.ownerId, member.id), eq(tickets.categoryId, category.id), eq(tickets.status, "open")));
  if (open.length >= category.maxOpen) {
    const links = open.filter((o) => o.channelId).map((o) => `<#${o.channelId}>`);
    return `Du hast schon ${category.maxOpen === 1 ? "ein offenes Ticket" : `${open.length} offene Tickets`} dieser Art${links.length ? `: ${links.join(", ")}` : ""}.`;
  }
  return null;
}

function questionModal(category: TicketCategory) {
  const modal = new ModalBuilder().setCustomId(ticketCustomId("form", category.id)).setTitle(truncate(category.name, 45));
  category.questions.slice(0, 5).forEach((q, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required)
      .setMaxLength(q.long ? 1500 : 200);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  });
  return modal;
}

async function startTicket(i: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">, db: Db, categoryId: number) {
  const category = await getCategory(db, i.guildId, categoryId);
  if (!category) return privateReply(i, "Diese Ticket-Art gibt es nicht mehr. Bitte sag dem Team Bescheid.");
  const settings = await getSettings(db, i.guildId);
  const problem = await openCheck(db, i.member, category, settings);
  if (problem) return privateReply(i, problem);
  if (category.questions.length) return void (await i.showModal(questionModal(category)));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await createTicket(i, db, category, settings, []);
}

/** Legt Kanal bzw. Thread an und begrüßt. Die Interaktion muss bereits zurückgestellt (deferred) sein. */
export async function createTicket(
  i: ComponentInteraction & { guild: Guild; member: GuildMember },
  db: Db,
  category: TicketCategory,
  settings: TicketSettings,
  answers: TicketAnswer[],
) {
  const { guild, member } = i;
  const me = guild.members.me!;
  const number = await nextNumber(db, guild.id);
  const [ticket] = await db
    .insert(tickets)
    .values({ guildId: guild.id, number, categoryId: category.id, categoryName: category.name, ownerId: member.id, answers })
    .returning();
  const name = ticketChannelName(category.nameTemplate, { number, username: member.user.username, category: category.name });
  const staffRoles = category.staffRoleIds.filter((r) => guild.roles.cache.has(r));

  let channel: GuildTextBasedChannel;
  try {
    if (category.mode === "thread") {
      const parent = category.parentId ? guild.channels.cache.get(category.parentId) : null;
      if (!parent || parent.type !== ChannelType.GuildText) throw new Error("Thread-Kanal fehlt");
      const thread = await parent.threads.create({
        name,
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Ticket #${number} von ${member.user.tag}`,
      });
      await thread.members.add(member.id);
      channel = thread;
    } else {
      const parent = category.parentId ? guild.channels.cache.get(category.parentId) : null;
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
        topic: truncate(`Ticket #${number} · ${category.name} · geöffnet von ${member.user.tag}`, 1024),
        reason: `Ticket #${number} von ${member.user.tag}`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
          { id: me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
          { id: member.id, type: OverwriteType.Member, allow: MEMBER_ALLOW },
          ...staffRoles.map((id) => ({ id, type: OverwriteType.Role, allow: STAFF_ALLOW })),
        ],
      });
    }
  } catch (err) {
    await db.delete(tickets).where(eq(tickets.id, ticket!.id));
    logger.warn({ err, guildId: guild.id, category: category.id }, "Ticket konnte nicht erstellt werden");
    return privateReply(
      i,
      category.mode === "thread"
        ? "Das Ticket konnte nicht erstellt werden. Mir fehlen vermutlich Rechte für private Threads, oder der Kanal für Ticket-Threads fehlt. Bitte sag dem Team Bescheid."
        : "Das Ticket konnte nicht erstellt werden. Mir fehlt vermutlich das Recht „Kanäle verwalten“. Bitte sag dem Team Bescheid.",
    );
  }
  await db.update(tickets).set({ channelId: channel.id }).where(eq(tickets.id, ticket!.id));
  openChannels.add(channel.id);

  const text = renderTicketText(category.welcomeMessage, {
    userId: member.id,
    username: member.displayName,
    server: guild.name,
    number,
    category: category.name,
  });
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(truncate(`${category.name} · Ticket #${number}`, 256))
    .setDescription(truncate(text, 4000))
    .setFooter({ text: "Schließen über den Button oder mit /ticket close" });
  for (const a of answers.slice(0, 5)) embed.addFields({ name: truncate(a.question, 256), value: truncate(a.answer || "–", 1024) });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ticketCustomId("close", ticket!.id)).setLabel("Schließen").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(ticketCustomId("claim", ticket!.id)).setLabel("Übernehmen").setEmoji("🙋").setStyle(ButtonStyle.Secondary),
  );
  // In Threads kommen erwähnte Rollen automatisch hinzu; ohne „Team erwähnen“ passiert das lautlos.
  const mentionStaff = category.pingStaff || category.mode === "thread";
  const content = [`<@${member.id}>`, ...(mentionStaff ? staffRoles.map((r) => `<@&${r}>`) : [])].join(" ");
  const welcome = await channel.send({
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [member.id], roles: mentionStaff ? staffRoles : [] },
    flags: category.pingStaff ? undefined : MessageFlags.SuppressNotifications,
  });
  await welcome.pin().catch(() => {});

  await i.editReply({ content: `Dein Ticket ist offen: ${channel.toString()}`, components: [] });
  await sendLog(guild, settings, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2f9e6a)
        .setTitle(`Ticket #${number} geöffnet`)
        .setDescription(`${member.toString()} · ${category.name} · ${channel.toString()}`)
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  });
}

// --- Schließen ---

async function collectMessages(channel: GuildTextBasedChannel) {
  const all: Message[] = [];
  let before: string | undefined;
  while (all.length < TRANSCRIPT_LIMIT) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last()!.id;
    if (batch.size < 100) break;
  }
  return all;
}

/**
 * Schließt ein Ticket: Transkript speichern und verschicken, Bewertung anfragen, Kanal löschen bzw. Thread archivieren.
 * Gibt false zurück, wenn das Ticket schon geschlossen wurde.
 */
export async function closeTicket(client: Client, db: Db, ticket: Ticket, closer: User, reason: string | null): Promise<boolean> {
  const now = new Date();
  const [claimed] = await db
    .update(tickets)
    .set({ status: "closed", closedAt: now, closedBy: closer.id, closeReason: reason?.slice(0, 500) ?? null })
    .where(and(eq(tickets.id, ticket.id), eq(tickets.status, "open")))
    .returning();
  if (!claimed) return false;
  if (ticket.channelId) openChannels.delete(ticket.channelId);

  const guild = client.guilds.cache.get(ticket.guildId);
  if (!guild) return true;
  const settings = await getSettings(db, guild.id);
  const category = ticket.categoryId ? await getCategory(db, guild.id, ticket.categoryId) : null;
  const channel = ticket.channelId ? await guild.channels.fetch(ticket.channelId).catch(() => null) : null;
  const owner = await client.users.fetch(ticket.ownerId).catch(() => null);

  let html: string | null = null;
  let messageCount = 0;
  if (channel?.isTextBased()) {
    const messages = await collectMessages(channel).catch((err) => (logger.warn({ err }, "Transkript: Nachrichten nicht lesbar"), [] as Message[]));
    messageCount = messages.filter((m) => !m.author.bot).length;
    const entries: TranscriptEntry[] = messages
      .filter((m) => !m.system)
      .map((m) => ({
        id: m.id,
        authorId: m.author.id,
        authorName: m.member?.displayName ?? m.author.displayName,
        authorAvatar: m.author.displayAvatarURL({ size: 64, extension: "png" }),
        bot: m.author.bot,
        staff: !m.author.bot && !!m.member && m.author.id !== ticket.ownerId && isStaff(m.member, category),
        content: m.content,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        attachments: m.attachments.map((a) => ({ name: a.name, url: a.url, image: !!a.contentType?.startsWith("image/") })),
        embeds: m.embeds.map((e) => ({ title: e.title ?? undefined, description: e.description ?? undefined })),
      }));
    html = formatTranscriptHtml(
      {
        server: guild.name,
        number: ticket.number,
        category: ticket.categoryName,
        ownerName: owner?.username ?? ticket.ownerId,
        openedAt: ticket.createdAt,
        closedAt: now,
        closedByName: closer.username,
        reason,
        answers: ticket.answers,
      },
      entries,
    );
    // Sehr lange Transkripte nicht in der Datenbank speichern, sie gehen trotzdem als Datei raus.
    await db
      .update(tickets)
      .set({ transcript: html.length <= 3_000_000 ? html : null, messageCount })
      .where(eq(tickets.id, ticket.id));
  }

  const file = () => (html ? [new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `ticket-${ticket.number}.html` })] : []);
  const summary = new EmbedBuilder()
    .setColor(0xe5534b)
    .setTitle(`Ticket #${ticket.number} geschlossen`)
    .addFields(
      { name: "Art", value: truncate(ticket.categoryName, 1024), inline: true },
      { name: "Geöffnet von", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Geschlossen von", value: `<@${closer.id}>`, inline: true },
      { name: "Übernommen von", value: claimed.claimedBy ? `<@${claimed.claimedBy}>` : "–", inline: true },
      { name: "Dauer", value: ticketDuration(now.getTime() - ticket.createdAt.getTime()), inline: true },
      { name: "Nachrichten", value: String(messageCount), inline: true },
    )
    .setTimestamp(now);
  if (reason) summary.addFields({ name: "Grund", value: truncate(reason, 1024) });
  await sendLog(guild, settings, { embeds: [summary], files: file(), allowedMentions: { parse: [] } });

  if (owner && (settings.transcriptDm || settings.ratingEnabled)) {
    const dm = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`Dein Ticket #${ticket.number} auf ${truncate(guild.name, 100)} wurde geschlossen`)
      .setDescription(
        [reason ? `Grund: ${truncate(reason, 1000)}` : "", settings.ratingEnabled ? "Wie zufrieden warst du? Eine kurze Bewertung hilft dem Team." : ""]
          .filter(Boolean)
          .join("\n\n") || null,
      );
    const rateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      [1, 2, 3, 4, 5].map((n) =>
        new ButtonBuilder()
          .setCustomId(ticketCustomId("rate", ticket.id, n))
          .setLabel(`${n} ★`)
          .setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
    );
    await owner
      .send({
        embeds: [dm],
        files: settings.transcriptDm ? file() : [],
        components: settings.ratingEnabled ? [rateRow] : [],
      })
      .catch(() => logger.debug({ user: owner.id }, "Ticket: Direktnachricht nicht möglich"));
  }

  if (channel?.isThread()) {
    await channel.send({ content: `🔒 Ticket geschlossen von ${closer.toString()}.`, allowedMentions: { parse: [] } }).catch(() => {});
    await channel.setLocked(true).catch(() => {});
    await channel.setArchived(true).catch(() => {});
  } else if (channel?.isTextBased()) {
    await channel.send({ content: `🔒 Ticket geschlossen von ${closer.toString()}. Der Kanal wird in 5 Sekunden gelöscht.`, allowedMentions: { parse: [] } }).catch(() => {});
    setTimeout(() => void channel.delete(`Ticket #${ticket.number} geschlossen`).catch((err) => logger.warn({ err }, "Ticket-Kanal nicht löschbar")), 5000);
  }
  return true;
}

// --- Interaktionen ---

export async function handleTicketInteraction(i: ComponentInteraction, db: Db) {
  const parsed = parseTicketCustomId(i.customId);
  if (!parsed) return;
  const { action, args } = parsed;

  if (action === "rate") return rate(i as ButtonInteraction, db, args[0]!, args[1]!);
  if (!i.inCachedGuild()) return;

  switch (action) {
    case "open":
      if (i.isButton()) await startTicket(i, db, args[0]!);
      return;
    case "pick":
      if (i.isStringSelectMenu()) {
        // Auswahl zurücksetzen, damit dieselbe Art wieder wählbar ist.
        await startTicket(i, db, Number(i.values[0]));
        await i.message.edit({ components: i.message.components }).catch(() => {});
      }
      return;
    case "form": {
      if (!i.isModalSubmit()) return;
      const category = await getCategory(db, i.guildId, args[0]!);
      if (!category) return privateReply(i, "Diese Ticket-Art gibt es nicht mehr.");
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const settings = await getSettings(db, i.guildId);
      const problem = await openCheck(db, i.member, category, settings);
      if (problem) return privateReply(i, problem);
      const answers = category.questions.slice(0, 5).map((q, n) => ({ question: q.label, answer: i.fields.getTextInputValue(`q${n}`).trim() }));
      return createTicket(i, db, category, settings, answers);
    }
  }

  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, args[0]!), eq(tickets.guildId, i.guildId)));
  if (!ticket || ticket.status !== "open") return privateReply(i, "Dieses Ticket ist bereits geschlossen.");
  const category = ticket.categoryId ? await getCategory(db, i.guildId, ticket.categoryId) : null;
  const staff = isStaff(i.member, category);

  switch (action) {
    case "close": {
      const settings = await getSettings(db, i.guildId);
      if (!staff && !(settings.ownerCanClose && i.user.id === ticket.ownerId)) return privateReply(i, "Nur das Team kann dieses Ticket schließen.");
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ticketCustomId("closeyes", ticket.id)).setLabel("Ja, schließen").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(ticketCustomId("closereason", ticket.id)).setLabel("Mit Grund schließen").setStyle(ButtonStyle.Secondary),
      );
      return void (await i.reply({ content: "Ticket wirklich schließen? Ein Transkript wird gespeichert.", components: [row], flags: MessageFlags.Ephemeral }));
    }
    case "closereason": {
      const modal = new ModalBuilder()
        .setCustomId(ticketCustomId("closemodal", ticket.id))
        .setTitle("Ticket schließen")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("reason").setLabel("Grund").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true),
          ),
        );
      return void (await (i as ButtonInteraction).showModal(modal));
    }
    case "closeyes":
    case "closemodal": {
      const settings = await getSettings(db, i.guildId);
      if (!staff && !(settings.ownerCanClose && i.user.id === ticket.ownerId)) return privateReply(i, "Nur das Team kann dieses Ticket schließen.");
      const reason = i.isModalSubmit() ? i.fields.getTextInputValue("reason").trim() : null;
      if (i.isButton()) await i.update({ content: "Ticket wird geschlossen …", components: [] });
      else await i.deferReply({ flags: MessageFlags.Ephemeral });
      const ok = await closeTicket(i.client, db, ticket, i.user, reason);
      if (i.isModalSubmit()) await i.editReply(ok ? "Ticket wird geschlossen …" : "Dieses Ticket ist bereits geschlossen.").catch(() => {});
      return;
    }
    case "claim":
      return claim(i as ButtonInteraction<"cached">, db, ticket, staff);
  }
}

async function claim(i: ButtonInteraction<"cached"> | import("discord.js").ChatInputCommandInteraction<"cached">, db: Db, ticket: Ticket, staff: boolean) {
  if (!staff) return void (await i.reply({ content: "Nur das Team kann Tickets übernehmen.", flags: MessageFlags.Ephemeral }));
  const [updated] = await db
    .update(tickets)
    .set({ claimedBy: i.user.id })
    .where(and(eq(tickets.id, ticket.id), sql`${tickets.claimedBy} is null`))
    .returning();
  if (!updated) {
    const [current] = await db.select({ by: tickets.claimedBy }).from(tickets).where(eq(tickets.id, ticket.id));
    return void (await i.reply({ content: `<@${current?.by}> kümmert sich bereits um dieses Ticket.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }));
  }
  await i.reply({ content: `🙋 ${i.user.toString()} kümmert sich jetzt um dieses Ticket.`, allowedMentions: { parse: [] } });
}

export { claim as claimTicket };

async function rate(i: ButtonInteraction, db: Db, ticketId: number, stars: number) {
  if (stars < 1 || stars > 5) return;
  const [t] = await db
    .update(tickets)
    .set({ rating: stars })
    .where(and(eq(tickets.id, ticketId), eq(tickets.ownerId, i.user.id), sql`${tickets.rating} is null`))
    .returning();
  if (!t) return void (await i.reply({ content: "Diese Bewertung ist nicht (mehr) möglich.", flags: MessageFlags.Ephemeral }));
  await i.update({ components: [], content: `Danke für deine Bewertung: ${ratingStars(stars)}` });
  const guild = i.client.guilds.cache.get(t.guildId);
  if (guild) {
    const settings = await getSettings(db, guild.id);
    await sendLog(guild, settings, {
      embeds: [new EmbedBuilder().setColor(0xffc83d).setDescription(`Ticket #${t.number} wurde von <@${t.ownerId}> mit ${ratingStars(stars)} bewertet.`)],
      allowedMentions: { parse: [] },
    });
  }
}

// --- Aktivität, automatisches Schließen, gelöschte Kanäle ---

const openChannels = new Set<string>();
const lastTouch = new Map<string, number>();

export async function loadOpenTickets(db: Db) {
  const rows = await db.select({ channelId: tickets.channelId }).from(tickets).where(and(eq(tickets.status, "open"), isNotNull(tickets.channelId)));
  openChannels.clear();
  for (const r of rows) openChannels.add(r.channelId!);
}

/** Merkt sich die letzte Nachricht in einem Ticket (höchstens einmal pro Minute in die Datenbank). */
export async function trackTicketMessage(message: Message, db: Db) {
  if (message.author.bot || !openChannels.has(message.channelId)) return;
  const now = Date.now();
  if (now - (lastTouch.get(message.channelId) ?? 0) < 60_000) return;
  lastTouch.set(message.channelId, now);
  await db.update(tickets).set({ lastActivityAt: new Date(now) }).where(and(eq(tickets.channelId, message.channelId), eq(tickets.status, "open")));
}

/** Kanal oder Thread wurde von Hand gelöscht: Ticket als geschlossen markieren. */
export async function onTicketChannelDeleted(channelId: string, db: Db) {
  if (!openChannels.delete(channelId)) return;
  await db
    .update(tickets)
    .set({ status: "closed", closedAt: new Date(), closeReason: "Kanal wurde gelöscht" })
    .where(and(eq(tickets.channelId, channelId), eq(tickets.status, "open")));
}

export async function autoCloseTickets(client: Client, db: Db, now = new Date()) {
  const rows = await db
    .select({ ticket: tickets, hours: ticketSettings.autoCloseHours })
    .from(tickets)
    .innerJoin(ticketSettings, eq(ticketSettings.guildId, tickets.guildId))
    .where(
      and(
        eq(tickets.status, "open"),
        sql`${ticketSettings.autoCloseHours} > 0`,
        lte(tickets.lastActivityAt, sql`${now.toISOString()}::timestamptz - make_interval(hours => ${ticketSettings.autoCloseHours})`),
      ),
    )
    .limit(20);
  for (const { ticket, hours } of rows) {
    if (!client.guilds.cache.has(ticket.guildId) || !client.user) continue;
    await closeTicket(client, db, ticket, client.user, `Keine Aktivität seit ${hours} Stunden`).catch((err) =>
      logger.warn({ err, ticket: ticket.id }, "Ticket konnte nicht automatisch geschlossen werden"),
    );
  }
}

export function startTicketJobs(client: Client, db: Db): NodeJS.Timeout {
  void loadOpenTickets(db).catch((err) => logger.error({ err }, "Offene Tickets konnten nicht geladen werden"));
  return setInterval(() => void autoCloseTickets(client, db).catch((err) => logger.error({ err }, "Tickets automatisch schließen fehlgeschlagen")), 10 * 60_000);
}

export async function openTicketCount(db: Db, guildId: string) {
  const [r] = await db.select({ n: count() }).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.status, "open")));
  return r?.n ?? 0;
}
