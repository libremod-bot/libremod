"use server";

import { isLocale } from "@libremod/shared/i18n";
import { redirect } from "next/navigation";
import {
  and,
  dashboardAudit,
  automodExemptions,
  automodFilter,
  automodRules,
  eq,
  guildSettings,
  logCategory,
  logChannels,
  logIgnoredChannels,
  modCases,
  autoRoles,
  rolePanels,
  welcomeSettings,
  levelNoXp,
  levelRewards,
  levelSettings,
  customCommands,
  scheduledMessages,
  counterChannels,
  tempVoiceHubs,
  notificationFeeds,
  highlightSettings,
  autoPurgeChannels,
  autoSlowmodeChannels,
  ticketSettings,
  ticketCategories,
  ticketPanels,
  economySettings,
  shopItems,
  giveaways,
  giveawayEntries,
  birthdaySettings,
  verificationSettings,
  channelLocks,
  memberNotes,
  suggestionSettings,
  suggestions,
  suggestionVotes,
  tempRoles,
  countingChannels,
  type SuggestionStatus,
  type TicketQuestion,
  count,
  warnEscalations,
  type AutomodAction,
  type AutomodFilter,
  type EscalationAction,
  type LogCategory,
  endLevelSeason,
  levelMultipliers,
  voiceRoles,
  wordChainChannels,
  wordChainWords,
  quotes,
  nameGuardSettings,
  appealSettings,
  banAppeals,
  guildEvents,
  ne,
  dashboardTeamAccess,
} from "@libremod/db";
import {
  buildPanelMessage,
  COMMAND_NAME,
  MAX_CUSTOM_COMMANDS,
  MAX_PANEL_ROLES,
  MAX_TEMPLATE_LENGTH,
  MAX_TIMEOUT_SECONDS,
  MIN_INTERVAL_MINUTES,
  nextRun,
  parseDuration,
  parseTimeOfDay,
  renderCounter,
  RESERVED_COMMANDS,
  splitResponses,
  toSchedule,
  credentialsFromEnv,
  MAX_FEEDS,
  NOTIFY_PLATFORMS,
  platformAvailable,
  PLATFORM_INFO,
  resolveSource,
  SourceError,
  type NotifyPlatform,
  parseEmojiInput,
  PURGE_INTERVALS,
  SLOWMODE_STEPS,
  AUTO_CLOSE_OPTIONS,
  buildTicketPanelMessage,
  cleanQuestions,
  MAX_TICKET_CATEGORIES,
  MAX_TICKET_PANELS,
  MAX_SHOP_ITEMS,
  buildGiveawayMessage,
  MAX_ACTIVE_GIVEAWAYS,
  MAX_GIVEAWAY_SECONDS,
  MAX_GIVEAWAY_WINNERS,
  MIN_GIVEAWAY_SECONDS,
  buildVerificationMessage,
  parseAnswers,
  buildSuggestionMessage,
  SUGGESTION_STATUS,
  MAX_XP_PERCENT,
  SEASON_MODES,
  seasonEndMessage,
  ANY_VOICE_CHANNEL,
  NAME_GUARD_ACTIONS,
  buildEventMessage,
  cleanEmbedDesign,
  type EmbedDesign,
  DEFAULT_EVENT_MINUTES,
  EVENT_REMINDERS,
  MAX_ACTIVE_EVENTS,
  MAX_EVENT_DESCRIPTION,
  MAX_EVENT_LOCATION,
  MAX_EVENT_SLOTS,
  MAX_EVENT_TITLE,
  parseEventStart,
  validateEventTime,
} from "@libremod/shared";
import { recordChange, requireGuildAccess } from "@/lib/access";
import { isTeamArea } from "@/lib/areas";
import { importSettings, MAX_BACKUP_BYTES, parseBackup, type BackupFile } from "@/lib/backup";
import { restoreSnapshot, snapshotArea, stillAsAfter, undoActionText } from "@/lib/undo";
import { database } from "@/lib/db";
import {
  CHANNEL_ANNOUNCEMENT,
  CHANNEL_TEXT,
  CHANNEL_CATEGORY,
  CHANNEL_VOICE,
  CHANNEL_STAGE,
  createGuildChannel,
  deleteGuildChannel,
  getGuildCounts,
  deleteBotMessage,
  DiscordError,
  editBotMessage,
  getBotTopPosition,
  getGuildChannels,
  getGuildRoles,
  getMembers,
  sendBotMessage,
  sendDirectMessage,
  unbanUser,
  getGuildInfo,
} from "@/lib/discord";
import { t } from "@/lib/i18n";

const SNOWFLAKE = /^\d{17,20}$/;
const AUTOMOD_ACTIONS: AutomodAction[] = ["delete", "warn", "timeout", "kick", "ban"];
const ESCALATION_ACTIONS: EscalationAction[] = ["timeout", "kick", "ban"];
const RAID_ACTIONS = ["alert", "timeout", "kick", "ban"];

function back(path: string, error?: string): never {
  // Ein Sprungziel wie #sprachrollen muss hinter die Parameter.
  const [base, anchor] = path.split("#");
  const query = error ? `?fehler=${encodeURIComponent(error)}` : "?gespeichert=1";
  if (!error) recordChange();
  redirect(`${base}${query}${anchor ? `#${anchor}` : ""}`);
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Karten-Gestaltung aus dem Embed-Editor. Leer = null. */
function design(path: string, form: FormData, key: string): EmbedDesign | null {
  const d = cleanEmbedDesign(text(form, key));
  if (typeof d === "string") back(path, d);
  return Object.keys(d as object).length ? (d as EmbedDesign) : null;
}

function list(form: FormData, key: string) {
  return text(form, key)
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function int(form: FormData, key: string, min: number, max: number): number | null {
  const raw = text(form, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}

async function ensureSettings(guildId: string) {
  const { db } = database();
  await db.insert(guildSettings).values({ guildId }).onConflictDoNothing();
}

// --- Sprache ---

export async function saveBotLanguage(guildId: string, form: FormData) {
  const { access } = await requireGuildAccess(guildId, "moderation", "Sprache des Bots geändert");
  const path = `/servers/${guildId}`;
  if (!access.full) back(path, t("Die Sprache dürfen nur Personen mit „Server verwalten“ ändern."));
  const locale = form.get("locale");
  if (!isLocale(locale)) back(path, t("Diese Sprache gibt es nicht."));
  const { db, notifySettingsChanged } = database();
  await ensureSettings(guildId);
  await db.update(guildSettings).set({ locale, updatedAt: new Date() }).where(eq(guildSettings.guildId, guildId));
  await notifySettingsChanged(guildId);
  back(path);
}

// --- Moderation ---

export async function saveModeration(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "moderation", "Moderation gespeichert");
  const path = `/servers/${guildId}/moderation`;
  const channel = text(form, "modLogChannelId");
  if (channel && !SNOWFLAKE.test(channel)) back(path, t("Ungültiger Kanal."));

  const { db, notifySettingsChanged } = database();
  await ensureSettings(guildId);
  await db
    .update(guildSettings)
    .set({ modLogChannelId: channel || null, dmOnAction: form.get("dmOnAction") === "on", updatedAt: new Date() })
    .where(eq(guildSettings.guildId, guildId));
  await notifySettingsChanged(guildId);
  back(path);
}

export async function addEscalation(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "moderation", "Verwarn-Stufe hinzugefügt");
  const path = `/servers/${guildId}/moderation`;
  const warnCount = int(form, "warnCount", 1, 100);
  const action = text(form, "action") as EscalationAction;
  const durationInput = text(form, "duration");
  const seconds = durationInput ? parseDuration(durationInput) : null;

  if (!warnCount) back(path, t("Bitte eine Anzahl Verwarnungen zwischen 1 und 100 angeben."));
  if (!ESCALATION_ACTIONS.includes(action)) back(path, t("Unbekannte Aktion."));
  if (durationInput && !seconds) back(path, t("Diese Dauer verstehe ich nicht. Beispiele: 1h, 7d."));
  if (action === "timeout" && !seconds) back(path, t("Für einen Timeout brauche ich eine Dauer."));
  if (action === "timeout" && seconds! > MAX_TIMEOUT_SECONDS) back(path, t("Timeouts dürfen höchstens 28 Tage dauern."));

  const durationSeconds = action === "kick" ? null : seconds;
  const { db, notifySettingsChanged } = database();
  await db
    .insert(warnEscalations)
    .values({ guildId, warnCount, action, durationSeconds })
    .onConflictDoUpdate({ target: [warnEscalations.guildId, warnEscalations.warnCount], set: { action, durationSeconds } });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function removeEscalation(guildId: string, warnCount: number) {
  await requireGuildAccess(guildId, "moderation", "Verwarn-Stufe entfernt");
  const { db, notifySettingsChanged } = database();
  await db.delete(warnEscalations).where(and(eq(warnEscalations.guildId, guildId), eq(warnEscalations.warnCount, warnCount)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/moderation`);
}

// --- Auto-Mod ---

export async function saveAutomod(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "automod", "Auto-Mod gespeichert");
  const path = `/servers/${guildId}/automod`;
  const { db, notifySettingsChanged } = database();
  await ensureSettings(guildId);

  const rules: (typeof automodRules.$inferInsert)[] = [];
  for (const filter of automodFilter.enumValues as readonly AutomodFilter[]) {
    const action = text(form, `${filter}.action`) as AutomodAction;
    if (!AUTOMOD_ACTIONS.includes(action)) back(path, t("Unbekannte Aktion."));
    const durationInput = text(form, `${filter}.duration`);
    const durationSeconds = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && !durationSeconds) back(path, t("Die Dauer „{durationInput}“ verstehe ich nicht. Beispiele: 10m, 1h, 1d.", { durationInput }));
    if (action === "timeout" && durationSeconds && durationSeconds > MAX_TIMEOUT_SECONDS) back(path, t("Timeouts dürfen höchstens 28 Tage dauern."));

    const threshold = int(form, `${filter}.threshold`, filter === "caps" ? 50 : 2, 100);
    if (Number.isNaN(threshold)) back(path, t("Ungültige Schwelle beim Filter „{filter}“.", { filter }));

    const config: Record<string, unknown> = {};
    if (threshold) config.threshold = threshold;
    const notice = text(form, `${filter}.notice`);
    if (notice.length > 500) back(path, t("Der Hinweistext darf höchstens 500 Zeichen lang sein."));
    if (notice) config.notice = notice;
    if (filter === "words") {
      const words = list(form, "words.list");
      if (words.length > 1000) back(path, t("Die Wortliste kann höchstens 1000 Einträge haben."));
      config.words = [...new Set(words)];
    }
    if (filter === "phishing") {
      const domains = list(form, "phishing.blockedDomains").map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
      if (domains.length > 500) back(path, t("Höchstens 500 gesperrte Domains."));
      config.blockedDomains = [...new Set(domains.filter((d) => /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d)))];
      const allowed = list(form, "phishing.allowedDomains").map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
      if (allowed.length > 500) back(path, t("Höchstens 500 freigegebene Domains."));
      config.allowedDomains = [...new Set(allowed.filter((d) => /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d)))];
      config.externalLists = form.get("phishing.externalLists") === "on";
    }
    if (filter === "links") {
      config.allowedDomains = [
        ...new Set(list(form, "links.allowedDomains").map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))),
      ];
    }

    rules.push({ guildId, filter, enabled: form.get(`${filter}.enabled`) === "on", action, durationSeconds, config });
  }

  const roles = form.getAll("exemptRoles").filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v));
  const channels = form.getAll("exemptChannels").filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v));

  const raidJoinThreshold = int(form, "raidJoinThreshold", 3, 100) ?? 10;
  const raidWindowSeconds = int(form, "raidWindowSeconds", 5, 600) ?? 10;
  const raidAction = text(form, "raidAction");
  if (Number.isNaN(raidJoinThreshold) || Number.isNaN(raidWindowSeconds)) back(path, t("Ungültige Werte beim Raid-Schutz."));
  if (!RAID_ACTIONS.includes(raidAction)) back(path, t("Unbekannte Raid-Aktion."));

  await db.transaction(async (tx) => {
    await tx
      .update(guildSettings)
      .set({
        automodEnabled: form.get("automodEnabled") === "on",
        raidEnabled: form.get("raidEnabled") === "on",
        raidJoinThreshold,
        raidWindowSeconds,
        raidAction,
        updatedAt: new Date(),
      })
      .where(eq(guildSettings.guildId, guildId));

    for (const rule of rules) {
      await tx
        .insert(automodRules)
        .values(rule)
        .onConflictDoUpdate({
          target: [automodRules.guildId, automodRules.filter],
          set: { enabled: rule.enabled, action: rule.action, durationSeconds: rule.durationSeconds, config: rule.config },
        });
    }

    await tx.delete(automodExemptions).where(eq(automodExemptions.guildId, guildId));
    const exemptions = [
      ...roles.map((targetId) => ({ guildId, kind: "role" as const, targetId })),
      ...channels.map((targetId) => ({ guildId, kind: "channel" as const, targetId })),
    ];
    if (exemptions.length) await tx.insert(automodExemptions).values(exemptions).onConflictDoNothing();
  });

  await notifySettingsChanged(guildId);
  back(path);
}

// --- Logging ---

async function textChannelIds(guildId: string) {
  const channels = await getGuildChannels(guildId);
  return {
    all: new Set(channels.map((c) => c.id)),
    text: new Set(channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT).map((c) => c.id)),
  };
}

export async function saveLogging(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "logging", "Logging gespeichert");
  const path = `/servers/${guildId}/logging`;
  const { db, notifySettingsChanged } = database();
  const known = await textChannelIds(guildId);
  const current = new Map(
    (await db.select().from(logChannels).where(eq(logChannels.guildId, guildId))).map((r) => [r.category, r.channelId]),
  );

  const chosen: { category: LogCategory; channelId: string }[] = [];
  for (const category of logCategory.enumValues as readonly LogCategory[]) {
    const channelId = text(form, `${category}.channel`);
    if (!channelId) continue;
    // Ein inzwischen gelöschter Kanal darf stehen bleiben, neue Kanäle müssen Textkanäle dieses Servers sein.
    if (!known.text.has(channelId) && current.get(category) !== channelId) back(path, t("Bitte nur Textkanäle dieses Servers wählen."));
    chosen.push({ category, channelId });
  }
  const ignored = [
    ...new Set(form.getAll("ignoredChannels").filter((v): v is string => typeof v === "string" && known.all.has(v))),
  ];

  await db.transaction(async (tx) => {
    await tx.delete(logChannels).where(eq(logChannels.guildId, guildId));
    if (chosen.length) await tx.insert(logChannels).values(chosen.map((c) => ({ guildId, ...c })));
    await tx.delete(logIgnoredChannels).where(eq(logIgnoredChannels.guildId, guildId));
    if (ignored.length) await tx.insert(logIgnoredChannels).values(ignored.map((channelId) => ({ guildId, channelId })));
  });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function quickLogging(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "logging", "Logging schnell eingerichtet");
  const path = `/servers/${guildId}/logging`;
  const channelId = text(form, "channelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));

  const { db, notifySettingsChanged } = database();
  await db
    .insert(logChannels)
    .values((logCategory.enumValues as readonly LogCategory[]).map((category) => ({ guildId, category, channelId })))
    .onConflictDoUpdate({ target: [logChannels.guildId, logChannels.category], set: { channelId } });
  await notifySettingsChanged(guildId);
  back(path);
}

// --- Begrüßung ---

export async function saveWelcome(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "welcome", "Begrüßung gespeichert");
  const path = `/servers/${guildId}/welcome`;
  const known = await textChannelIds(guildId);

  const values = {
    welcomeEnabled: form.get("welcomeEnabled") === "on",
    welcomeChannelId: text(form, "welcomeChannelId") || null,
    welcomeMessage: text(form, "welcomeMessage"),
    welcomeEmbed: form.get("welcomeEmbed") === "on",
    welcomeDesign: design(path, form, "welcomeDesign"),
    dmEnabled: form.get("dmEnabled") === "on",
    dmMessage: text(form, "dmMessage"),
    goodbyeEnabled: form.get("goodbyeEnabled") === "on",
    goodbyeChannelId: text(form, "goodbyeChannelId") || null,
    goodbyeMessage: text(form, "goodbyeMessage"),
    goodbyeEmbed: form.get("goodbyeEmbed") === "on",
    goodbyeDesign: design(path, form, "goodbyeDesign"),
    welcomeImage: form.get("welcomeImage") === "on",
    welcomeImageTitle: text(form, "welcomeImageTitle").slice(0, 40) || t("Willkommen!"),
    welcomeImageColor: /^#[0-9a-f]{6}$/i.test(text(form, "welcomeImageColor")) ? parseInt(text(form, "welcomeImageColor").slice(1), 16) : 0x4cb4ff,
  };
  for (const id of [values.welcomeChannelId, values.goodbyeChannelId]) {
    if (id && !known.text.has(id)) back(path, t("Bitte nur Textkanäle dieses Servers wählen."));
  }
  if (values.welcomeEnabled && !values.welcomeChannelId) back(path, t("Für die Willkommensnachricht fehlt noch der Kanal."));
  if (values.goodbyeEnabled && !values.goodbyeChannelId) back(path, t("Für die Abschiedsnachricht fehlt noch der Kanal."));
  for (const [key, label] of [
    ["welcomeMessage", "Willkommensnachricht"],
    ["dmMessage", "Direktnachricht"],
    ["goodbyeMessage", "Abschiedsnachricht"],
  ] as const) {
    if (!values[key]) back(path, t("Der Text der {label} ist leer.", { label }));
    if (values[key].length > MAX_TEMPLATE_LENGTH) back(path, t("Der Text der {label} ist zu lang (höchstens {MAX_TEMPLATE_LENGTH} Zeichen).", { label, MAX_TEMPLATE_LENGTH }));
  }

  const { db, notifySettingsChanged } = database();
  await db.insert(welcomeSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: welcomeSettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

// --- Rollen ---

/** Rollen-IDs aus dem Formular, die es gibt und die der Bot vergeben kann. */
async function assignableRoles(guildId: string, form: FormData, key: string) {
  const [roles, botTop] = await Promise.all([getGuildRoles(guildId), getBotTopPosition(guildId)]);
  const ok = new Map(roles.filter((r) => r.position < botTop).map((r) => [r.id, r]));
  const picked = [...new Set(form.getAll(key).filter((v): v is string => typeof v === "string"))];
  return { valid: picked.filter((id) => ok.has(id)), invalid: picked.filter((id) => !ok.has(id)), roles: ok };
}

export async function saveAutoRoles(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "roles", "Automatische Rollen gespeichert");
  const path = `/servers/${guildId}/roles`;
  const humans = await assignableRoles(guildId, form, "humanRoles");
  const bots = await assignableRoles(guildId, form, "botRoles");
  if (humans.invalid.length || bots.invalid.length) back(path, t("Mindestens eine Rolle kann Libremod nicht vergeben."));

  const { db, notifySettingsChanged } = database();
  await db.transaction(async (tx) => {
    await tx.delete(autoRoles).where(eq(autoRoles.guildId, guildId));
    const rows = [
      ...humans.valid.map((roleId) => ({ guildId, roleId, target: "humans" as const })),
      ...bots.valid.map((roleId) => ({ guildId, roleId, target: "bots" as const })),
    ];
    if (rows.length) await tx.insert(autoRoles).values(rows);
  });
  await notifySettingsChanged(guildId);
  back(path);
}

async function readPanelForm(guildId: string, form: FormData, path: string) {
  const title = text(form, "title");
  const description = text(form, "description");
  const channelId = text(form, "channelId");
  const style = text(form, "style") === "select" ? ("select" as const) : ("buttons" as const);
  const single = form.get("single") === "on";
  const known = await textChannelIds(guildId);
  const { valid, invalid, roles } = await assignableRoles(guildId, form, "roleIds");

  if (!title || title.length > 256) back(path, t("Bitte eine Überschrift mit höchstens 256 Zeichen angeben."));
  if (description.length > 2000) back(path, t("Die Beschreibung darf höchstens 2000 Zeichen lang sein."));
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  if (invalid.length) back(path, t("Mindestens eine Rolle kann Libremod nicht vergeben."));
  if (!valid.length) back(path, t("Bitte mindestens eine Rolle auswählen."));
  if (valid.length > MAX_PANEL_ROLES) back(path, t("Ein Panel kann höchstens {MAX_PANEL_ROLES} Rollen haben.", { MAX_PANEL_ROLES }));

  // In der Reihenfolge der Rollenliste des Servers, höchste zuerst.
  const roleIds = [...roles.keys()].filter((id) => valid.includes(id));
  return { title, description, channelId, style, single, roleIds, roleNames: roleIds.map((id) => ({ id, name: roles.get(id)!.name })) };
}

const postError = (err: unknown) =>
  err instanceof DiscordError && (err.status === 403 || err.status === 404)
    ? t("Gespeichert, aber Libremod konnte im Kanal nicht posten. Prüfe dort die Rechte „Nachrichten senden“ und „Links einbetten“.")
    : t("Gespeichert, aber die Nachricht konnte nicht gepostet werden. Bitte später nochmal speichern.");

export async function createPanel(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "roles", "Rollen-Auswahl erstellt");
  const path = `/servers/${guildId}/roles`;
  const { roleNames, ...values } = await readPanelForm(guildId, form, path);
  const { db } = database();
  const [panel] = await db.insert(rolePanels).values({ guildId, ...values }).returning();

  let error: string | undefined;
  try {
    const msg = await sendBotMessage(values.channelId, buildPanelMessage({ ...values, id: panel!.id, roles: roleNames }));
    await db.update(rolePanels).set({ messageId: msg.id }).where(eq(rolePanels.id, panel!.id));
  } catch (err) {
    error = postError(err);
  }
  back(path, error);
}

export async function updatePanel(guildId: string, panelId: number, form: FormData) {
  await requireGuildAccess(guildId, "roles", "Rollen-Auswahl geändert");
  const path = `/servers/${guildId}/roles/${panelId}`;
  const { db } = database();
  const [old] = await db.select().from(rolePanels).where(and(eq(rolePanels.id, panelId), eq(rolePanels.guildId, guildId)));
  if (!old) back(`/servers/${guildId}/roles`, t("Dieses Panel gibt es nicht mehr."));
  const { roleNames, ...values } = await readPanelForm(guildId, form, path);
  const body = buildPanelMessage({ ...values, id: panelId, roles: roleNames });

  let messageId = old.messageId;
  let error: string | undefined;
  try {
    if (messageId && old.channelId === values.channelId) {
      try {
        await editBotMessage(values.channelId, messageId, body);
      } catch (err) {
        if (!(err instanceof DiscordError && err.status === 404)) throw err;
        messageId = null; // Nachricht wurde in Discord gelöscht: neu posten
      }
    } else if (messageId) {
      await deleteBotMessage(old.channelId, messageId).catch(() => {});
      messageId = null;
    }
    if (!messageId) messageId = (await sendBotMessage(values.channelId, body)).id;
  } catch (err) {
    error = postError(err);
  }
  await db.update(rolePanels).set({ ...values, messageId }).where(eq(rolePanels.id, panelId));
  back(path, error);
}

export async function deletePanel(guildId: string, panelId: number) {
  await requireGuildAccess(guildId, "roles", "Rollen-Auswahl gelöscht");
  const { db } = database();
  const [panel] = await db.delete(rolePanels).where(and(eq(rolePanels.id, panelId), eq(rolePanels.guildId, guildId))).returning();
  if (panel?.messageId) await deleteBotMessage(panel.channelId, panel.messageId).catch(() => {});
  back(`/servers/${guildId}/roles`);
}

// --- Level ---

const ANNOUNCE = ["off", "same", "channel", "dm"] as const;

export async function saveLevels(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "levels", "Level-Einstellungen gespeichert");
  const path = `/servers/${guildId}/levels`;
  const textXpMin = int(form, "textXpMin", 0, 1000) ?? 15;
  const textXpMax = int(form, "textXpMax", 0, 1000) ?? 25;
  const cooldownSeconds = int(form, "cooldownSeconds", 0, 3600) ?? 60;
  const voiceXpPerMinute = int(form, "voiceXpPerMinute", 0, 1000) ?? 10;
  const weekendPercent = int(form, "weekendPercent", 0, MAX_XP_PERCENT) ?? 100;
  const levelUpCoins = int(form, "levelUpCoins", 0, 1_000_000) ?? 0;
  if ([textXpMin, textXpMax, cooldownSeconds, voiceXpPerMinute, weekendPercent, levelUpCoins].some(Number.isNaN)) {
    back(path, t("Bitte nur ganze Zahlen im erlaubten Bereich."));
  }
  const color = /^#[0-9a-f]{6}$/i.test(text(form, "cardColor")) ? parseInt(text(form, "cardColor").slice(1), 16) : 0x4cb4ff;
  const seasonMode = text(form, "seasonMode") || "off";
  if (!SEASON_MODES.some((m) => m.value === seasonMode)) back(path, t("Unbekannte Einstellung für Saisons."));
  if (textXpMin > textXpMax) back(path, t("Die Mindest-XP dürfen nicht größer als die Höchst-XP sein."));

  const announce = text(form, "announce") as (typeof ANNOUNCE)[number];
  if (!ANNOUNCE.includes(announce)) back(path, t("Unbekannte Einstellung für die Verkündung."));
  const announceChannelId = text(form, "announceChannelId") || null;
  const known = await textChannelIds(guildId);
  if (announceChannelId && !known.text.has(announceChannelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  if (announce === "channel" && !announceChannelId) back(path, t("Für „In einem festen Kanal“ fehlt noch der Kanal."));
  const announceMessage = text(form, "announceMessage") || t("Glückwunsch {user}, du bist jetzt **Level {level}**!");
  if (announceMessage.length > 500) back(path, t("Der Text für den Level-Aufstieg darf höchstens 500 Zeichen lang sein."));

  const roles = new Set((await getGuildRoles(guildId)).map((r) => r.id));
  const noRoles = [...new Set(form.getAll("noXpRoles").filter((v): v is string => typeof v === "string" && roles.has(v)))];
  const noChannels = [...new Set(form.getAll("noXpChannels").filter((v): v is string => typeof v === "string" && known.all.has(v)))];

  const values = {
    enabled: form.get("enabled") === "on",
    textXpMin,
    textXpMax,
    cooldownSeconds,
    voiceXpPerMinute,
    announce,
    announceChannelId,
    announceMessage,
    stackRewards: form.get("stackRewards") === "on",
    weekendPercent,
    levelUpCoins,
    cardColor: color,
    seasonMode,
  };
  const { db, notifySettingsChanged } = database();
  await db.transaction(async (tx) => {
    const [old] = await tx.select({ seasonMode: levelSettings.seasonMode }).from(levelSettings).where(eq(levelSettings.guildId, guildId));
    // Wer Saisons neu einschaltet, startet die erste Saison jetzt und nicht rückwirkend.
    const set = old && old.seasonMode === "off" && seasonMode !== "off" ? { ...values, seasonStartedAt: new Date() } : values;
    await tx.insert(levelSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: levelSettings.guildId, set });
    await tx.delete(levelNoXp).where(eq(levelNoXp.guildId, guildId));
    const rows = [
      ...noRoles.map((targetId) => ({ guildId, kind: "role" as const, targetId })),
      ...noChannels.map((targetId) => ({ guildId, kind: "channel" as const, targetId })),
    ];
    if (rows.length) await tx.insert(levelNoXp).values(rows);
  });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function addLevelMultiplier(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "levels", "XP-Bonus hinzugefügt");
  const path = `/servers/${guildId}/levels`;
  const percent = int(form, "percent", 0, MAX_XP_PERCENT);
  if (percent === null || Number.isNaN(percent)) back(path, t("Bitte einen Wert zwischen 0 und {MAX_XP_PERCENT} % angeben.", { MAX_XP_PERCENT }));
  const roleId = text(form, "roleId");
  const roles = await getGuildRoles(guildId);
  if (!roles.some((r) => r.id === roleId) || roleId === guildId) back(path, t("Bitte eine Rolle dieses Servers wählen."));
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(levelMultipliers).where(eq(levelMultipliers.guildId, guildId));
  if (n >= 25) back(path, t("Mehr als 25 Bonus-Rollen gehen nicht."));
  await db
    .insert(levelMultipliers)
    .values({ guildId, roleId, percent: percent! })
    .onConflictDoUpdate({ target: [levelMultipliers.guildId, levelMultipliers.roleId], set: { percent: percent! } });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function removeLevelMultiplier(guildId: string, roleId: string) {
  await requireGuildAccess(guildId, "levels", "XP-Bonus entfernt");
  const { db, notifySettingsChanged } = database();
  await db.delete(levelMultipliers).where(and(eq(levelMultipliers.guildId, guildId), eq(levelMultipliers.roleId, roleId)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/levels`);
}

export async function endSeasonNow(guildId: string, number: number) {
  await requireGuildAccess(guildId, "levels", "Saison beendet");
  const path = `/servers/${guildId}/levels`;
  const { db, notifySettingsChanged } = database();
  const season = await endLevelSeason(db, guildId, new Date(), number);
  if (!season) back(path, t("Diese Saison ist schon beendet."));
  await notifySettingsChanged(guildId);
  const [s] = await db.select({ channelId: levelSettings.announceChannelId }).from(levelSettings).where(eq(levelSettings.guildId, guildId));
  if (s?.channelId && season!.top.length) await sendBotMessage(s.channelId, seasonEndMessage(season!)).catch(() => {});
  back(path);
}

export async function addLevelReward(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "levels", "Level-Belohnung hinzugefügt");
  const path = `/servers/${guildId}/levels`;
  const level = int(form, "level", 1, 500);
  if (!level) back(path, t("Bitte ein Level zwischen 1 und 500 angeben."));
  const { valid } = await assignableRoles(guildId, form, "roleId");
  if (valid.length !== 1) back(path, t("Diese Rolle kann Libremod nicht vergeben."));
  const { db, notifySettingsChanged } = database();
  await db
    .insert(levelRewards)
    .values({ guildId, level, roleId: valid[0]! })
    .onConflictDoUpdate({ target: [levelRewards.guildId, levelRewards.level], set: { roleId: valid[0]! } });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function removeLevelReward(guildId: string, level: number) {
  await requireGuildAccess(guildId, "levels", "Level-Belohnung entfernt");
  const { db, notifySettingsChanged } = database();
  await db.delete(levelRewards).where(and(eq(levelRewards.guildId, guildId), eq(levelRewards.level, level)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/levels`);
}

// --- Eigene Befehle ---

function readCommandForm(form: FormData, path: string) {
  const name = text(form, "name").toLowerCase();
  const description = text(form, "description");
  const responses = splitResponses(text(form, "responses"));
  const embed = form.get("embed") === "on";
  const cardDesign = design(path, form, "design");
  const embedTitle = cardDesign?.title ?? null;
  if (!COMMAND_NAME.test(name)) back(path, t("Der Name darf nur Kleinbuchstaben, Zahlen, - und _ enthalten (höchstens 32 Zeichen)."));
  if (RESERVED_COMMANDS.includes(name)) back(path, t("/{name} ist ein eingebauter Befehl von Libremod. Bitte einen anderen Namen wählen.", { name }));
  if (!description || description.length > 100) back(path, t("Bitte eine Beschreibung mit höchstens 100 Zeichen angeben."));
  if (!responses.length) back(path, t("Bitte mindestens eine Antwort eingeben."));
  if (responses.length > 20) back(path, t("Höchstens 20 Antworten pro Befehl."));
  const max = embed ? 4000 : 2000;
  if (responses.some((r) => r.length > max)) back(path, t("Eine Antwort ist zu lang (höchstens {max} Zeichen).", { max }));
  if (embedTitle && embedTitle.length > 256) back(path, t("Die Embed-Überschrift darf höchstens 256 Zeichen lang sein."));
  return {
    name,
    description,
    responses,
    embed,
    embedTitle,
    embedColor: cardDesign?.color ?? null,
    design: cardDesign,
    ephemeral: form.get("ephemeral") === "on",
  };
}

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && ("code" in err ? err.code : (err as { cause?: { code?: string } }).cause?.code) === "23505";

export async function createCommand(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "commands", "Eigener Befehl erstellt");
  const path = `/servers/${guildId}/commands`;
  const values = readCommandForm(form, path);
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customCommands).where(eq(customCommands.guildId, guildId));
  if (n >= MAX_CUSTOM_COMMANDS) back(path, t("Ein Server kann höchstens {MAX_CUSTOM_COMMANDS} eigene Befehle haben.", { MAX_CUSTOM_COMMANDS }));
  try {
    await db.insert(customCommands).values({ guildId, ...values });
  } catch (err) {
    if (isUniqueViolation(err)) back(path, t("Den Befehl /{name} gibt es schon.", { name: values.name }));
    throw err;
  }
  await notifySettingsChanged(guildId);
  back(path);
}

export async function updateCommand(guildId: string, id: number, form: FormData) {
  await requireGuildAccess(guildId, "commands", "Eigener Befehl geändert");
  const path = `/servers/${guildId}/commands/${id}`;
  const values = readCommandForm(form, path);
  const { db, notifySettingsChanged } = database();
  try {
    await db.update(customCommands).set(values).where(and(eq(customCommands.id, id), eq(customCommands.guildId, guildId)));
  } catch (err) {
    if (isUniqueViolation(err)) back(path, t("Den Befehl /{name} gibt es schon.", { name: values.name }));
    throw err;
  }
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteCommand(guildId: string, id: number) {
  await requireGuildAccess(guildId, "commands", "Eigener Befehl gelöscht");
  const { db, notifySettingsChanged } = database();
  await db.delete(customCommands).where(and(eq(customCommands.id, id), eq(customCommands.guildId, guildId)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/commands`);
}

// --- Geplante Nachrichten ---

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;

export async function createScheduled(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "schedule", "Geplante Nachricht erstellt");
  const path = `/servers/${guildId}/schedule`;
  const channelId = text(form, "channelId");
  const content = text(form, "content");
  const embed = form.get("embed") === "on";
  const cardDesign = embed ? design(path, form, "design") : null;
  const embedTitle = cardDesign?.title ?? null;
  const kind = text(form, "kind");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  if (!content) back(path, t("Die Nachricht ist leer."));
  if (content.length > (embed ? 4000 : 2000)) back(path, t("Die Nachricht ist zu lang."));

  let row: { kind: "interval" | "daily" | "weekly"; intervalMinutes: number | null; timeOfDay: string | null; weekday: number | null };
  if (kind === "interval") {
    const value = int(form, "intervalValue", 1, 1000);
    const unit = text(form, "intervalUnit") as keyof typeof UNIT_MINUTES;
    if (!value || !(unit in UNIT_MINUTES)) back(path, t("Bitte einen gültigen Abstand angeben."));
    const minutes = value * UNIT_MINUTES[unit];
    if (minutes < MIN_INTERVAL_MINUTES) back(path, t("Der Abstand muss mindestens {MIN_INTERVAL_MINUTES} Minuten betragen.", { MIN_INTERVAL_MINUTES }));
    if (minutes > 60 * 24 * 90) back(path, t("Der Abstand darf höchstens 90 Tage betragen."));
    row = { kind: "interval", intervalMinutes: minutes, timeOfDay: null, weekday: null };
  } else if (kind === "daily" || kind === "weekly") {
    const time = parseTimeOfDay(text(form, "timeOfDay"));
    if (!time) back(path, t("Bitte eine Uhrzeit wie 18:00 angeben."));
    const timeOfDay = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
    const weekday = kind === "weekly" ? int(form, "weekday", 1, 7) : null;
    if (kind === "weekly" && !weekday) back(path, t("Bitte einen Wochentag wählen."));
    row = { kind, intervalMinutes: null, timeOfDay, weekday };
  } else {
    back(path, t("Unbekannte Art des Zeitplans."));
  }

  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(scheduledMessages).where(eq(scheduledMessages.guildId, guildId));
  if (n >= 25) back(path, t("Ein Server kann höchstens 25 geplante Nachrichten haben."));
  await db.insert(scheduledMessages).values({
    guildId,
    channelId,
    content,
    embed,
    embedTitle,
    design: cardDesign,
    ...row,
    nextRunAt: nextRun(toSchedule(row), new Date()),
  });
  back(path);
}

export async function toggleScheduled(guildId: string, id: number) {
  await requireGuildAccess(guildId, "schedule", "Geplante Nachricht an/aus");
  const { db } = database();
  const [m] = await db.select().from(scheduledMessages).where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.guildId, guildId)));
  if (m) {
    // Beim Fortsetzen ab jetzt neu planen, damit nicht sofort nachgeholt wird.
    const enabled = !m.enabled;
    await db
      .update(scheduledMessages)
      .set({ enabled, ...(enabled ? { nextRunAt: nextRun(toSchedule(m), new Date()) } : {}) })
      .where(eq(scheduledMessages.id, id));
  }
  back(`/servers/${guildId}/schedule`);
}

export async function deleteScheduled(guildId: string, id: number) {
  await requireGuildAccess(guildId, "schedule", "Geplante Nachricht gelöscht");
  const { db } = database();
  await db.delete(scheduledMessages).where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.guildId, guildId)));
  back(`/servers/${guildId}/schedule`);
}

// --- Temporäre Sprachkanäle und Zähler ---

const CONNECT = String(1 << 20);

async function categoryOrNull(guildId: string, form: FormData, path: string) {
  const parentId = text(form, "parentId");
  if (!parentId) return null;
  const channels = await getGuildChannels(guildId);
  if (!channels.some((c) => c.id === parentId && c.type === CHANNEL_CATEGORY)) back(path, t("Unbekannte Kategorie."));
  return parentId;
}

const channelError = (err: unknown) =>
  err instanceof DiscordError && err.status === 403
    ? t("Libremod fehlt das Recht „Kanäle verwalten“. Bitte in den Servereinstellungen bei der Libremod-Rolle einschalten.")
    : t("Der Kanal konnte nicht erstellt werden. Bitte später nochmal versuchen.");

function readHubSettings(form: FormData, path: string) {
  const nameTemplate = text(form, "nameTemplate") || t("Kanal von {username}");
  const userLimit = int(form, "userLimit", 0, 99) ?? 0;
  if (nameTemplate.length > 100) back(path, t("Der Name darf höchstens 100 Zeichen lang sein."));
  if (Number.isNaN(userLimit)) back(path, t("Max. Personen muss zwischen 0 und 99 liegen."));
  return { nameTemplate, userLimit };
}

export async function createTempHub(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "channels", "Sprachkanal-Generator erstellt");
  const path = `/servers/${guildId}/channels`;
  const hubName = text(form, "hubName") || t("➕ Kanal erstellen");
  if (hubName.length > 100) back(path, t("Der Kanalname darf höchstens 100 Zeichen lang sein."));
  const settings = readHubSettings(form, path);
  const parentId = await categoryOrNull(guildId, form, path);
  const { db, notifySettingsChanged } = database();
  let channelId: string;
  try {
    channelId = (await createGuildChannel(guildId, { name: hubName, type: CHANNEL_VOICE, parent_id: parentId })).id;
  } catch (err) {
    back(path, channelError(err));
  }
  await db.insert(tempVoiceHubs).values({ channelId, guildId, ...settings });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function updateTempHub(guildId: string, channelId: string, form: FormData) {
  await requireGuildAccess(guildId, "channels", "Sprachkanal-Generator geändert");
  const path = `/servers/${guildId}/channels`;
  const settings = readHubSettings(form, path);
  const { db, notifySettingsChanged } = database();
  await db.update(tempVoiceHubs).set(settings).where(and(eq(tempVoiceHubs.channelId, channelId), eq(tempVoiceHubs.guildId, guildId)));
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteTempHub(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "channels", "Sprachkanal-Generator gelöscht");
  const { db, notifySettingsChanged } = database();
  const [hub] = await db.delete(tempVoiceHubs).where(and(eq(tempVoiceHubs.channelId, channelId), eq(tempVoiceHubs.guildId, guildId))).returning();
  if (hub) await deleteGuildChannel(guildId, channelId).catch(() => {});
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/channels`);
}

export async function createCounter(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "channels", "Zähler-Kanal erstellt");
  const path = `/servers/${guildId}/channels`;
  const template = text(form, "template");
  if (!template || template.length > 90) back(path, t("Bitte einen Namen mit höchstens 90 Zeichen angeben."));
  if (!/\{(members|boosts|channels|roles)\}/i.test(template)) back(path, t("Der Name braucht einen Platzhalter, z. B. {members}."));
  const parentId = await categoryOrNull(guildId, form, path);
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(counterChannels).where(eq(counterChannels.guildId, guildId));
  if (n >= 10) back(path, t("Ein Server kann höchstens 10 Zähler haben."));

  let channelId: string;
  try {
    const name = renderCounter(template, await getGuildCounts(guildId));
    channelId = (
      await createGuildChannel(guildId, {
        name,
        type: CHANNEL_VOICE,
        parent_id: parentId,
        // Niemand kann beitreten, der Kanal dient nur der Anzeige.
        permission_overwrites: [{ id: guildId, type: 0, deny: CONNECT }],
      })
    ).id;
  } catch (err) {
    back(path, channelError(err));
  }
  await db.insert(counterChannels).values({ channelId, guildId, template });
  back(path);
}

export async function deleteCounter(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "channels", "Zähler-Kanal gelöscht");
  const { db } = database();
  const [row] = await db.delete(counterChannels).where(and(eq(counterChannels.channelId, channelId), eq(counterChannels.guildId, guildId))).returning();
  if (row) await deleteGuildChannel(guildId, channelId).catch(() => {});
  back(`/servers/${guildId}/channels`);
}

// --- Fallakte ---

export async function revokeWarning(guildId: string, caseNumber: number) {
  await requireGuildAccess(guildId, "cases", "Verwarnung zurückgenommen");
  const { db } = database();
  await db
    .update(modCases)
    .set({ active: false })
    .where(and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber), eq(modCases.type, "warn")));
  back(`/servers/${guildId}/cases`);
}

// --- Benachrichtigungen ---

async function readFeedForm(guildId: string, form: FormData, path: string) {
  const channelId = text(form, "channelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const mention = text(form, "mentionRoleId");
  let mentionRoleId: string | null = null;
  if (mention) {
    const roles = await getGuildRoles(guildId);
    if (mention !== guildId && !roles.some((r) => r.id === mention)) back(path, t("Diese Rolle gibt es nicht."));
    mentionRoleId = mention;
  }
  const message = text(form, "message").replace(/\r\n/g, "\n");
  if (message.length > 1500) back(path, t("Der Text ist zu lang (höchstens 1500 Zeichen)."));
  return { channelId, mentionRoleId, message };
}

export async function createFeed(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "notifications", "Benachrichtigung erstellt");
  const path = `/servers/${guildId}/notifications`;
  const platform = text(form, "platform") as NotifyPlatform;
  if (!NOTIFY_PLATFORMS.includes(platform)) back(path, t("Bitte eine Plattform wählen."));
  const creds = credentialsFromEnv();
  if (!platformAvailable(platform, creds)) back(path, t("{label} ist auf dieser Libremod-Instanz nicht eingerichtet.", { label: t(PLATFORM_INFO[platform].label) }));
  const { channelId, mentionRoleId, message } = await readFeedForm(guildId, form, path);

  const { db } = database();
  const existing = await db.select().from(notificationFeeds).where(eq(notificationFeeds.guildId, guildId));
  if (existing.length >= MAX_FEEDS) back(path, t("Ein Server kann höchstens {MAX_FEEDS} Benachrichtigungen haben.", { MAX_FEEDS }));

  let source: { sourceId: string; name: string };
  try {
    source = await resolveSource(platform, text(form, "source"), creds);
  } catch (err) {
    const msg = err instanceof SourceError ? err.message : t("Unbekannter Fehler");
    back(path, msg.startsWith("Bitte") ? msg : t("{label}: {n1}. Bitte die Angabe prüfen.", { label: t(PLATFORM_INFO[platform].label), n1: msg.replace(/\.$/, "") }));
  }
  if (existing.some((f) => f.platform === platform && f.sourceId === source.sourceId && f.channelId === channelId))
    back(path, t("Diese Quelle wird in diesem Kanal schon gemeldet."));

  await db.insert(notificationFeeds).values({
    guildId,
    channelId,
    platform,
    sourceId: source.sourceId,
    name: source.name.slice(0, 200),
    message: message || PLATFORM_INFO[platform].defaultMessage,
    mentionRoleId,
  });
  back(path);
}

export async function updateFeed(guildId: string, id: number, form: FormData) {
  await requireGuildAccess(guildId, "notifications", "Benachrichtigung geändert");
  const path = `/servers/${guildId}/notifications/${id}`;
  const { channelId, mentionRoleId, message } = await readFeedForm(guildId, form, path);
  const { db } = database();
  const [f] = await db.select().from(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  if (!f) back(`/servers/${guildId}/notifications`, t("Diese Benachrichtigung gibt es nicht mehr."));
  await db
    .update(notificationFeeds)
    .set({ channelId, mentionRoleId, message: message || PLATFORM_INFO[f.platform].defaultMessage })
    .where(eq(notificationFeeds.id, id));
  back(path);
}

export async function toggleFeed(guildId: string, id: number) {
  await requireGuildAccess(guildId, "notifications", "Benachrichtigung an/aus");
  const { db } = database();
  const [f] = await db.select().from(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  // Beim Einschalten Fehlerzähler zurücksetzen; gesehene Einträge bleiben, damit nichts Altes nachkommt.
  if (f) await db.update(notificationFeeds).set({ enabled: !f.enabled, failures: 0, lastError: null }).where(eq(notificationFeeds.id, id));
  back(`/servers/${guildId}/notifications`);
}

export async function deleteFeed(guildId: string, id: number) {
  await requireGuildAccess(guildId, "notifications", "Benachrichtigung gelöscht");
  const { db } = database();
  await db.delete(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  back(`/servers/${guildId}/notifications`);
}

// --- Highlights und Kanal-Pflege ---

export async function saveHighlights(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tools", "Highlights gespeichert");
  const path = `/servers/${guildId}/tools`;
  const enabled = form.get("enabled") === "on";
  const channelId = text(form, "channelId") || null;
  const known = await textChannelIds(guildId);
  if (channelId && !known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  if (enabled && !channelId) back(path, t("Für den Highlight-Kanal fehlt noch der Kanal."));
  const emoji = parseEmojiInput(text(form, "emoji") || "⭐");
  if (!emoji) back(path, t("Bitte genau ein Emoji angeben, z. B. ⭐ oder ein Server-Emoji wie <:name:123…>."));
  const threshold = int(form, "threshold", 1, 100) ?? 5;
  if (Number.isNaN(threshold)) back(path, t("Die Anzahl muss zwischen 1 und 100 liegen."));
  const values = { enabled, channelId, emoji, threshold, countSelf: form.get("countSelf") === "on", allowNsfw: form.get("allowNsfw") === "on" };
  const { db, notifySettingsChanged } = database();
  await db.insert(highlightSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: highlightSettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function createPurge(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tools", "Auto-Aufräumen hinzugefügt");
  const path = `/servers/${guildId}/tools`;
  const channelId = text(form, "purgeChannelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const intervalHours = Number(text(form, "intervalHours"));
  if (!PURGE_INTERVALS.some((i) => i.hours === intervalHours)) back(path, t("Bitte einen Abstand aus der Liste wählen."));
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(autoPurgeChannels).where(eq(autoPurgeChannels.guildId, guildId));
  if (n >= 10) back(path, t("Ein Server kann höchstens 10 Kanäle automatisch leeren lassen."));
  const values = { intervalHours, keepPinned: form.get("keepPinned") === "on", nextRunAt: new Date(Date.now() + intervalHours * 3600_000) };
  await db.insert(autoPurgeChannels).values({ channelId, guildId, ...values }).onConflictDoUpdate({ target: autoPurgeChannels.channelId, set: values });
  back(path);
}

export async function deletePurge(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "tools", "Auto-Aufräumen entfernt");
  const { db } = database();
  await db.delete(autoPurgeChannels).where(and(eq(autoPurgeChannels.channelId, channelId), eq(autoPurgeChannels.guildId, guildId)));
  back(`/servers/${guildId}/tools`);
}

export async function createSlowmode(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tools", "Auto-Slowmode hinzugefügt");
  const path = `/servers/${guildId}/tools`;
  const channelId = text(form, "slowChannelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const messagesPerMinute = int(form, "messagesPerMinute", 2, 1000);
  if (!messagesPerMinute) back(path, t("Die Schwelle muss zwischen 2 und 1000 Nachrichten pro Minute liegen."));
  const steps: readonly number[] = SLOWMODE_STEPS;
  const minSeconds = Number(text(form, "minSeconds"));
  const maxSeconds = Number(text(form, "maxSeconds"));
  if (!steps.includes(minSeconds) || !steps.includes(maxSeconds)) back(path, t("Bitte Werte aus der Liste wählen."));
  if (minSeconds >= maxSeconds) back(path, t("Das Maximum muss größer als das Minimum sein."));
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(autoSlowmodeChannels).where(eq(autoSlowmodeChannels.guildId, guildId));
  if (n >= 20) back(path, t("Ein Server kann höchstens 20 Kanäle mit automatischem Langsam-Modus haben."));
  const values = { messagesPerMinute, minSeconds, maxSeconds };
  await db.insert(autoSlowmodeChannels).values({ channelId, guildId, ...values }).onConflictDoUpdate({ target: autoSlowmodeChannels.channelId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteSlowmode(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "tools", "Auto-Slowmode entfernt");
  const { db } = database();
  await db.delete(autoSlowmodeChannels).where(and(eq(autoSlowmodeChannels.channelId, channelId), eq(autoSlowmodeChannels.guildId, guildId)));
  back(`/servers/${guildId}/tools`);
}

// --- Tickets ---

const TICKETS = (guildId: string) => `/servers/${guildId}/tickets`;

export async function saveTicketSettings(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Einstellungen gespeichert");
  const path = TICKETS(guildId);
  const logChannelId = text(form, "logChannelId") || null;
  const known = await textChannelIds(guildId);
  if (logChannelId && !known.text.has(logChannelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const autoCloseHours = Number(text(form, "autoCloseHours") || 0);
  if (!(AUTO_CLOSE_OPTIONS as readonly number[]).includes(autoCloseHours)) back(path, t("Bitte einen Wert aus der Liste wählen."));
  const roles = new Set((await getGuildRoles(guildId)).map((r) => r.id));
  const blockedRoleIds = [...new Set(form.getAll("blockedRoleIds").filter((v): v is string => typeof v === "string" && roles.has(v)))];
  const values = {
    logChannelId,
    autoCloseHours,
    blockedRoleIds,
    transcriptDm: form.get("transcriptDm") === "on",
    ratingEnabled: form.get("ratingEnabled") === "on",
    ownerCanClose: form.get("ownerCanClose") === "on",
  };
  const { db } = database();
  await db.insert(ticketSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: ticketSettings.guildId, set: values });
  back(path);
}

async function readCategoryForm(guildId: string, form: FormData, path: string) {
  const name = text(form, "name");
  if (!name || name.length > 80) back(path, t("Bitte einen Namen mit höchstens 80 Zeichen angeben."));
  const rawEmoji = text(form, "emoji");
  const emoji = rawEmoji ? parseEmojiInput(rawEmoji) : null;
  if (rawEmoji && !emoji) back(path, t("Bitte genau ein Emoji angeben oder das Feld leer lassen."));
  const description = text(form, "description");
  if (description.length > 100) back(path, t("Die Kurzbeschreibung darf höchstens 100 Zeichen lang sein."));
  const mode = text(form, "mode") === "thread" ? "thread" : "channel";
  const channels = await getGuildChannels(guildId);
  const parentId = text(form, mode === "thread" ? "threadParentId" : "categoryParentId") || null;
  if (mode === "thread") {
    if (!parentId || !channels.some((c) => c.id === parentId && c.type === CHANNEL_TEXT)) back(path, t("Für Threads bitte einen Textkanal wählen, in dem sie entstehen."));
  } else if (parentId && !channels.some((c) => c.id === parentId && c.type === CHANNEL_CATEGORY)) {
    back(path, t("Bitte eine Kategorie dieses Servers wählen."));
  }
  const roles = new Set((await getGuildRoles(guildId)).map((r) => r.id));
  const staffRoleIds = [...new Set(form.getAll("staffRoleIds").filter((v): v is string => typeof v === "string" && roles.has(v)))].slice(0, 10);
  const welcomeMessage = text(form, "welcomeMessage").replace(/\r\n/g, "\n") || t("Hallo {user}, danke für dein Ticket! Das Team meldet sich so schnell wie möglich.");
  if (welcomeMessage.length > 2000) back(path, t("Die Begrüßung darf höchstens 2000 Zeichen lang sein."));
  const maxOpen = int(form, "maxOpen", 1, 10) ?? 1;
  if (Number.isNaN(maxOpen)) back(path, t("Offene Tickets pro Person: 1 bis 10."));
  const nameTemplate = text(form, "nameTemplate") || "ticket-{number}";
  if (nameTemplate.length > 90) back(path, t("Die Namensvorlage ist zu lang."));
  const questions: TicketQuestion[] = cleanQuestions(
    [0, 1, 2, 3, 4].map((n) => ({
      label: text(form, `q${n}label`),
      placeholder: text(form, `q${n}placeholder`),
      long: form.get(`q${n}long`) === "on",
      required: form.get(`q${n}required`) === "on",
    })),
  );
  return { name, emoji, description, mode: mode as "channel" | "thread", parentId, staffRoleIds, pingStaff: form.get("pingStaff") === "on", welcomeMessage, maxOpen, nameTemplate, questions };
}

/** Alle Panels neu zeichnen, z. B. nachdem sich der Name einer Ticket-Art geändert hat. */
async function refreshTicketPanels(guildId: string) {
  const { db } = database();
  const [panels, cats] = await Promise.all([
    db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId)),
    db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId)),
  ]);
  for (const p of panels) {
    if (!p.messageId) continue;
    const list = p.categoryIds.map((id) => cats.find((c) => c.id === id)).filter((c) => !!c);
    if (!list.length) continue;
    await editBotMessage(p.channelId, p.messageId, buildTicketPanelMessage(p, list)).catch(() => {});
  }
}

export async function createTicketCategory(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Kategorie erstellt");
  const path = `${TICKETS(guildId)}/categories/new`;
  const values = await readCategoryForm(guildId, form, path);
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(ticketCategories).where(eq(ticketCategories.guildId, guildId));
  if (n >= MAX_TICKET_CATEGORIES) back(path, t("Ein Server kann höchstens {MAX_TICKET_CATEGORIES} Ticket-Arten haben.", { MAX_TICKET_CATEGORIES }));
  await db.insert(ticketCategories).values({ guildId, ...values, position: n });
  back(TICKETS(guildId));
}

export async function updateTicketCategory(guildId: string, id: number, form: FormData) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Kategorie geändert");
  const path = `${TICKETS(guildId)}/categories/${id}`;
  const values = await readCategoryForm(guildId, form, path);
  const { db } = database();
  const updated = await db.update(ticketCategories).set(values).where(and(eq(ticketCategories.id, id), eq(ticketCategories.guildId, guildId))).returning();
  if (!updated.length) back(TICKETS(guildId), t("Diese Ticket-Art gibt es nicht mehr."));
  await refreshTicketPanels(guildId);
  back(path);
}

export async function deleteTicketCategory(guildId: string, id: number) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Kategorie gelöscht");
  const { db } = database();
  await db.delete(ticketCategories).where(and(eq(ticketCategories.id, id), eq(ticketCategories.guildId, guildId)));
  // Aus Panels austragen; leere Panels bleiben, bis sie bearbeitet oder gelöscht werden.
  const panels = await db.select().from(ticketPanels).where(eq(ticketPanels.guildId, guildId));
  for (const p of panels) {
    if (p.categoryIds.includes(id)) await db.update(ticketPanels).set({ categoryIds: p.categoryIds.filter((c) => c !== id) }).where(eq(ticketPanels.id, p.id));
  }
  await refreshTicketPanels(guildId);
  back(TICKETS(guildId));
}

async function readTicketPanelForm(guildId: string, form: FormData, path: string) {
  const title = text(form, "title");
  if (!title || title.length > 256) back(path, t("Bitte eine Überschrift mit höchstens 256 Zeichen angeben."));
  const description = text(form, "description").replace(/\r\n/g, "\n");
  if (description.length > 2000) back(path, t("Die Beschreibung ist zu lang."));
  const channelId = text(form, "channelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const color = /^#[0-9a-f]{6}$/i.test(text(form, "color")) ? parseInt(text(form, "color").slice(1), 16) : 0x4cb4ff;
  const style = text(form, "style") === "select" ? "select" : "buttons";
  const { db } = database();
  const cats = await db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId));
  const picked = new Set(form.getAll("categoryIds").map(Number));
  const categories = cats.filter((c) => picked.has(c.id)).sort((a, b) => a.position - b.position || a.id - b.id);
  if (!categories.length) back(path, t("Bitte mindestens eine Ticket-Art auswählen."));
  return { values: { title, description, channelId, color, style: style as "buttons" | "select", categoryIds: categories.map((c) => c.id) }, categories };
}

export async function createTicketPanel(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Panel erstellt");
  const path = `${TICKETS(guildId)}/panels/new`;
  const { values, categories } = await readTicketPanelForm(guildId, form, path);
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(ticketPanels).where(eq(ticketPanels.guildId, guildId));
  if (n >= MAX_TICKET_PANELS) back(path, t("Ein Server kann höchstens {MAX_TICKET_PANELS} Ticket-Panels haben.", { MAX_TICKET_PANELS }));
  const [panel] = await db.insert(ticketPanels).values({ guildId, ...values }).returning();
  let error: string | undefined;
  try {
    const msg = await sendBotMessage(values.channelId, buildTicketPanelMessage({ ...values, id: panel!.id }, categories));
    await db.update(ticketPanels).set({ messageId: msg.id }).where(eq(ticketPanels.id, panel!.id));
  } catch (err) {
    error = postError(err);
  }
  back(TICKETS(guildId), error);
}

export async function updateTicketPanel(guildId: string, panelId: number, form: FormData) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Panel geändert");
  const path = `${TICKETS(guildId)}/panels/${panelId}`;
  const { db } = database();
  const [old] = await db.select().from(ticketPanels).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId)));
  if (!old) back(TICKETS(guildId), t("Dieses Panel gibt es nicht mehr."));
  const { values, categories } = await readTicketPanelForm(guildId, form, path);
  const body = buildTicketPanelMessage({ ...values, id: panelId }, categories);
  let messageId = old.messageId;
  let error: string | undefined;
  try {
    if (messageId && old.channelId === values.channelId) {
      try {
        await editBotMessage(values.channelId, messageId, body);
      } catch (err) {
        if (!(err instanceof DiscordError && err.status === 404)) throw err;
        messageId = null;
      }
    } else if (messageId) {
      await deleteBotMessage(old.channelId, messageId).catch(() => {});
      messageId = null;
    }
    if (!messageId) messageId = (await sendBotMessage(values.channelId, body)).id;
  } catch (err) {
    error = postError(err);
  }
  await db.update(ticketPanels).set({ ...values, messageId }).where(eq(ticketPanels.id, panelId));
  back(path, error);
}

export async function deleteTicketPanel(guildId: string, panelId: number) {
  await requireGuildAccess(guildId, "tickets", "Ticket-Panel gelöscht");
  const { db } = database();
  const [panel] = await db.delete(ticketPanels).where(and(eq(ticketPanels.id, panelId), eq(ticketPanels.guildId, guildId))).returning();
  if (panel?.messageId) await deleteBotMessage(panel.channelId, panel.messageId).catch(() => {});
  back(TICKETS(guildId));
}

// --- Server-Währung ---

const ECONOMY = (guildId: string) => `/servers/${guildId}/economy`;

export async function saveEconomy(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "economy", "Währung gespeichert");
  const path = ECONOMY(guildId);
  const currencyName = text(form, "currencyName") || t("Münzen");
  if (currencyName.length > 32) back(path, t("Der Name der Währung darf höchstens 32 Zeichen lang sein."));
  const rawSymbol = text(form, "currencySymbol") || "🪙";
  const currencySymbol = parseEmojiInput(rawSymbol) ?? (rawSymbol.length <= 4 && !/[<>@#]/.test(rawSymbol) ? rawSymbol : null);
  if (!currencySymbol) back(path, t("Als Symbol bitte ein Emoji oder bis zu 4 Zeichen wie €."));
  const n = (key: string, min: number, max: number, fallback: number) => {
    const v = int(form, key, min, max);
    if (Number.isNaN(v)) back(path, t("Bitte nur ganze Zahlen im erlaubten Bereich."));
    return v ?? fallback;
  };
  const values = {
    enabled: form.get("enabled") === "on",
    currencyName,
    currencySymbol,
    startBalance: n("startBalance", 0, 1_000_000, 0),
    dailyAmount: n("dailyAmount", 0, 1_000_000, 100),
    dailyStreakBonus: n("dailyStreakBonus", 0, 100_000, 10),
    workMin: n("workMin", 0, 1_000_000, 20),
    workMax: n("workMax", 0, 1_000_000, 60),
    workCooldownMinutes: n("workCooldownMinutes", 5, 24 * 60, 60),
    chatReward: n("chatReward", 0, 1000, 0),
    allowPay: form.get("allowPay") === "on",
  };
  if (values.workMin > values.workMax) back(path, t("Der Mindestlohn darf nicht größer als der Höchstlohn sein."));
  const { db, notifySettingsChanged } = database();
  await db.insert(economySettings).values({ guildId, ...values }).onConflictDoUpdate({ target: economySettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

async function readShopItem(guildId: string, form: FormData, path: string) {
  const name = text(form, "name");
  if (!name || name.length > 60) back(path, t("Bitte einen Namen mit höchstens 60 Zeichen angeben."));
  const description = text(form, "description");
  if (description.length > 200) back(path, t("Die Beschreibung darf höchstens 200 Zeichen lang sein."));
  const price = int(form, "price", 1, 1_000_000_000);
  if (!price) back(path, t("Bitte einen Preis ab 1 angeben."));
  const stock = int(form, "stock", 0, 1_000_000);
  if (Number.isNaN(stock)) back(path, t("Der Bestand muss eine ganze Zahl sein (leer = unbegrenzt)."));
  const roleId = text(form, "roleId") || null;
  if (roleId) {
    const one = new FormData();
    one.set("r", roleId);
    const { valid } = await assignableRoles(guildId, one, "r");
    if (!valid.length) back(path, t("Diese Rolle kann Libremod nicht vergeben. Schiebe die Libremod-Rolle darüber."));
  }
  const replyMessage = text(form, "replyMessage");
  if (replyMessage.length > 500) back(path, t("Der Text nach dem Kauf ist zu lang."));
  const roleDays = int(form, "roleDays", 1, 366);
  if (Number.isNaN(roleDays)) back(path, t("Die Tage für die Rolle müssen zwischen 1 und 366 liegen."));
  if (roleDays && !roleId) back(path, t("Tage gelten nur für Artikel mit Rolle."));
  return { name, description, price, stock, roleId, roleDays, replyMessage, enabled: form.get("enabled") !== "off" };
}

export async function createShopItem(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "economy", "Shop-Artikel erstellt");
  const path = ECONOMY(guildId);
  const values = await readShopItem(guildId, form, path);
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(shopItems).where(eq(shopItems.guildId, guildId));
  if (n >= MAX_SHOP_ITEMS) back(path, t("Ein Shop kann höchstens {MAX_SHOP_ITEMS} Artikel haben.", { MAX_SHOP_ITEMS }));
  await db.insert(shopItems).values({ guildId, ...values });
  back(path);
}

export async function updateShopItem(guildId: string, id: number, form: FormData) {
  await requireGuildAccess(guildId, "economy", "Shop-Artikel geändert");
  const path = `${ECONOMY(guildId)}/items/${id}`;
  const values = await readShopItem(guildId, form, path);
  const { db } = database();
  const done = await db.update(shopItems).set(values).where(and(eq(shopItems.id, id), eq(shopItems.guildId, guildId))).returning();
  if (!done.length) back(ECONOMY(guildId), t("Diesen Artikel gibt es nicht mehr."));
  back(path);
}

export async function toggleShopItem(guildId: string, id: number) {
  await requireGuildAccess(guildId, "economy", "Shop-Artikel an/aus");
  const { db } = database();
  const [item] = await db.select().from(shopItems).where(and(eq(shopItems.id, id), eq(shopItems.guildId, guildId)));
  if (item) await db.update(shopItems).set({ enabled: !item.enabled }).where(eq(shopItems.id, id));
  back(ECONOMY(guildId));
}

export async function deleteShopItem(guildId: string, id: number) {
  await requireGuildAccess(guildId, "economy", "Shop-Artikel gelöscht");
  const { db } = database();
  await db.delete(shopItems).where(and(eq(shopItems.id, id), eq(shopItems.guildId, guildId)));
  back(ECONOMY(guildId));
}

// --- Gewinnspiele ---

const GIVEAWAYS = (guildId: string) => `/servers/${guildId}/giveaways`;

export async function createGiveaway(guildId: string, form: FormData) {
  const { user } = await requireGuildAccess(guildId, "giveaways", "Gewinnspiel gestartet");
  const path = GIVEAWAYS(guildId);
  const prize = text(form, "prize");
  if (!prize || prize.length > 200) back(path, t("Bitte einen Preis mit höchstens 200 Zeichen angeben."));
  const description = text(form, "description");
  if (description.length > 1000) back(path, t("Die Beschreibung darf höchstens 1000 Zeichen lang sein."));
  const winners = int(form, "winners", 1, MAX_GIVEAWAY_WINNERS);
  if (!winners) back(path, t("Bitte 1 bis {MAX_GIVEAWAY_WINNERS} Gewinner angeben.", { MAX_GIVEAWAY_WINNERS }));
  const seconds = parseDuration(text(form, "duration"));
  if (!seconds || seconds < MIN_GIVEAWAY_SECONDS || seconds > MAX_GIVEAWAY_SECONDS) back(path, t("Bitte eine Dauer zwischen 1 Minute und 60 Tagen angeben, z. B. 2h oder 3d."));
  const minLevel = int(form, "minLevel", 0, 1000);
  if (Number.isNaN(minLevel)) back(path, t("Das Mindest-Level muss zwischen 0 und 1000 liegen."));
  const channelId = text(form, "channelId");
  if (!(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const roleId = text(form, "requiredRoleId");
  if (roleId && !(await getGuildRoles(guildId)).some((r) => r.id === roleId)) back(path, t("Diese Rolle gibt es nicht."));

  const { db } = database();
  const [active] = await db.select({ n: count() }).from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false)));
  if ((active?.n ?? 0) >= MAX_ACTIVE_GIVEAWAYS) back(path, t("Es laufen schon {MAX_ACTIVE_GIVEAWAYS} Gewinnspiele. Beende erst eins.", { MAX_ACTIVE_GIVEAWAYS }));

  const [g] = await db
    .insert(giveaways)
    .values({ guildId, channelId, prize, description, winners: winners!, hostId: user.id, requiredRoleId: roleId || null, minLevel: minLevel ?? 0, endsAt: new Date(Date.now() + seconds! * 1000) })
    .returning();
  try {
    const msg = await sendBotMessage(channelId, buildGiveawayMessage(g!, 0));
    await db.update(giveaways).set({ messageId: msg.id }).where(eq(giveaways.id, g!.id));
  } catch (err) {
    // Ohne Nachricht kann niemand mitmachen, also wieder entfernen.
    await db.delete(giveaways).where(eq(giveaways.id, g!.id));
    back(
      path,
      err instanceof DiscordError && (err.status === 403 || err.status === 404)
        ? t("Libremod konnte im Kanal nicht posten. Prüfe dort die Rechte „Nachrichten senden“ und „Links einbetten“.")
        : t("Die Nachricht konnte nicht gepostet werden. Bitte später nochmal versuchen."),
    );
  }
  back(path);
}

/** Setzt das Ende auf jetzt. Der Bot lost innerhalb weniger Sekunden aus. */
export async function endGiveawayNow(guildId: string, giveawayId: number) {
  await requireGuildAccess(guildId, "giveaways", "Gewinnspiel vorzeitig ausgelost");
  const { db } = database();
  await db
    .update(giveaways)
    .set({ endsAt: new Date() })
    .where(and(eq(giveaways.id, giveawayId), eq(giveaways.guildId, guildId), eq(giveaways.ended, false)));
  back(GIVEAWAYS(guildId));
}

export async function deleteGiveaway(guildId: string, giveawayId: number) {
  await requireGuildAccess(guildId, "giveaways", "Gewinnspiel gelöscht");
  const { db } = database();
  const [g] = await db.delete(giveaways).where(and(eq(giveaways.id, giveawayId), eq(giveaways.guildId, guildId))).returning();
  if (g) {
    await db.delete(giveawayEntries).where(eq(giveawayEntries.giveawayId, g.id));
    if (g.messageId && !g.ended) await deleteBotMessage(g.channelId, g.messageId).catch(() => {});
  }
  back(GIVEAWAYS(guildId));
}

// --- Events ---

const EVENTS = (guildId: string) => `/servers/${guildId}/events`;

export async function createEvent(guildId: string, form: FormData) {
  const { user } = await requireGuildAccess(guildId, "events", "Event geplant");
  const path = EVENTS(guildId);
  const title = text(form, "title");
  if (!title || title.length > MAX_EVENT_TITLE) back(path, t("Bitte einen Titel mit höchstens {MAX_EVENT_TITLE} Zeichen angeben.", { MAX_EVENT_TITLE }));
  const description = text(form, "description");
  if (description.length > MAX_EVENT_DESCRIPTION) back(path, t("Die Beschreibung darf höchstens {MAX_EVENT_DESCRIPTION} Zeichen lang sein.", { MAX_EVENT_DESCRIPTION }));
  const location = text(form, "location");
  if (location.length > MAX_EVENT_LOCATION) back(path, t("Der Ort darf höchstens {MAX_EVENT_LOCATION} Zeichen lang sein.", { MAX_EVENT_LOCATION }));
  const startsAt = parseEventStart(text(form, "startsAt").replace("T", " "));
  if (!startsAt) back(path, t("Bitte Datum und Uhrzeit für den Start angeben."));
  const durationText = text(form, "duration");
  const seconds = durationText ? parseDuration(durationText) : DEFAULT_EVENT_MINUTES * 60;
  if (!seconds) back(path, t("Die Dauer wurde nicht verstanden. Beispiele: 90m, 3h, 2d."));
  const minutes = Math.round(seconds! / 60);
  const invalid = validateEventTime(startsAt!, minutes);
  if (invalid) back(path, invalid);
  const slots = int(form, "slots", 0, MAX_EVENT_SLOTS);
  if (Number.isNaN(slots)) back(path, t("Die Plätze müssen zwischen 0 und {MAX_EVENT_SLOTS} liegen (0 = unbegrenzt).", { MAX_EVENT_SLOTS }));
  const remindMinutes = Number(text(form, "remindMinutes") || 30);
  if (!EVENT_REMINDERS.some((r) => r.value === remindMinutes)) back(path, t("Bitte eine Erinnerung aus der Liste wählen."));
  const channelId = text(form, "channelId");
  if (!(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const roleId = text(form, "roleId") || null;
  if (roleId) {
    const { invalid: badRole } = await assignableRoles(guildId, form, "roleId");
    if (badRole.length) back(path, t("Diese Rolle kann Libremod nicht vergeben. Sie muss unter der Rolle von Libremod stehen."));
  }

  const { db } = database();
  const [active] = await db.select({ n: count() }).from(guildEvents).where(and(eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open")));
  if ((active?.n ?? 0) >= MAX_ACTIVE_EVENTS) back(path, t("Es sind schon {MAX_ACTIVE_EVENTS} Events geplant. Sag erst eins ab.", { MAX_ACTIVE_EVENTS }));

  const [e] = await db
    .insert(guildEvents)
    .values({
      guildId,
      channelId,
      title,
      description,
      location,
      startsAt: startsAt!,
      endsAt: new Date(startsAt!.getTime() + minutes * 60_000),
      slots: slots ?? 0,
      hostId: user.id,
      roleId,
      remindMinutes,
    })
    .returning();
  try {
    const msg = await sendBotMessage(channelId, buildEventMessage(e!, { yes: [], maybe: [], no: [], waitlist: [] }));
    await db.update(guildEvents).set({ messageId: msg.id }).where(eq(guildEvents.id, e!.id));
  } catch (err) {
    await db.delete(guildEvents).where(eq(guildEvents.id, e!.id));
    back(
      path,
      err instanceof DiscordError && (err.status === 403 || err.status === 404)
        ? t("Libremod konnte im Kanal nicht posten. Prüfe dort die Rechte „Nachrichten senden“ und „Links einbetten“.")
        : t("Die Nachricht konnte nicht gepostet werden. Bitte später nochmal versuchen."),
    );
  }
  back(path);
}

/** Markiert das Event als abgesagt. Der Bot passt die Nachricht an, entfernt Rollen und schreibt allen. */
export async function cancelEventRequest(guildId: string, eventId: number) {
  await requireGuildAccess(guildId, "events", "Event abgesagt");
  const { db } = database();
  await db
    .update(guildEvents)
    .set({ cancelRequested: true })
    .where(and(eq(guildEvents.id, eventId), eq(guildEvents.guildId, guildId), eq(guildEvents.state, "open")));
  back(EVENTS(guildId));
}

/** Entfernt ein vergangenes oder abgesagtes Event aus der Liste (die Discord-Nachricht bleibt). */
export async function deleteEvent(guildId: string, eventId: number) {
  await requireGuildAccess(guildId, "events", "Event entfernt");
  const { db } = database();
  await db.delete(guildEvents).where(and(eq(guildEvents.id, eventId), eq(guildEvents.guildId, guildId), ne(guildEvents.state, "open")));
  back(EVENTS(guildId));
}

// --- Geburtstage ---

export async function saveBirthdays(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "birthdays", "Geburtstage gespeichert");
  const path = `/servers/${guildId}/birthdays`;
  const enabled = form.get("enabled") === "on";
  const channelId = text(form, "channelId") || null;
  const { db } = database();
  const [old] = await db.select().from(birthdaySettings).where(eq(birthdaySettings.guildId, guildId));
  if (channelId && channelId !== old?.channelId && !(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const roleId = text(form, "roleId") || null;
  if (roleId && roleId !== old?.roleId) {
    const { invalid } = await assignableRoles(guildId, form, "roleId");
    if (invalid.length) back(path, t("Diese Rolle kann Libremod nicht vergeben. Sie muss unter der Rolle von Libremod stehen."));
  }
  if (enabled && !channelId && !roleId) back(path, t("Bitte einen Kanal für Glückwünsche oder eine Geburtstagsrolle wählen."));
  const message = text(form, "message") || t("🎉 Alles Gute zum Geburtstag, {user}!");
  if (message.length > 1000) back(path, t("Die Nachricht darf höchstens 1000 Zeichen lang sein."));
  const hour = int(form, "hour", 0, 23);
  if (hour === null || Number.isNaN(hour)) back(path, t("Bitte eine Uhrzeit wählen."));
  const values = { enabled, channelId, roleId, message, hour: hour! };
  await db.insert(birthdaySettings).values({ guildId, ...values }).onConflictDoUpdate({ target: birthdaySettings.guildId, set: values });
  back(path);
}

// --- Verifizierung ---

const VERIFY_MODES = ["button", "code", "question"] as const;

export async function saveVerification(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "verification", "Verifizierung gespeichert");
  const path = `/servers/${guildId}/verification`;
  const { db, notifySettingsChanged } = database();
  const [old] = await db.select().from(verificationSettings).where(eq(verificationSettings.guildId, guildId));

  const enabled = form.get("enabled") === "on";
  const mode = text(form, "mode") as (typeof VERIFY_MODES)[number];
  if (!VERIFY_MODES.includes(mode)) back(path, t("Bitte eine Art der Verifizierung wählen."));
  const known = await textChannelIds(guildId);
  const channelId = text(form, "channelId") || null;
  if (channelId && channelId !== old?.channelId && !known.text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const logChannelId = text(form, "logChannelId") || null;
  if (logChannelId && logChannelId !== old?.logChannelId && !known.text.has(logChannelId)) back(path, t("Bitte einen Textkanal dieses Servers als Log wählen."));

  const roleId = text(form, "roleId") || null;
  const unverifiedRoleId = text(form, "unverifiedRoleId") || null;
  if (roleId && roleId === unverifiedRoleId) back(path, t("Die beiden Rollen müssen verschieden sein."));
  for (const key of ["roleId", "unverifiedRoleId"] as const) {
    const id = key === "roleId" ? roleId : unverifiedRoleId;
    if (id && id !== old?.[key] && (await assignableRoles(guildId, form, key)).invalid.length) {
      back(path, t("Mindestens eine Rolle kann Libremod nicht vergeben. Sie muss unter der Rolle von Libremod stehen."));
    }
  }
  if (enabled && (!roleId || !channelId)) back(path, t("Zum Einschalten braucht es einen Kanal und eine Rolle für Verifizierte."));

  const title = text(form, "title") || t("Willkommen! Bitte kurz bestätigen");
  if (title.length > 256) back(path, t("Der Titel darf höchstens 256 Zeichen lang sein."));
  const description = text(form, "description");
  if (description.length > 2000) back(path, t("Der Text darf höchstens 2000 Zeichen lang sein."));
  const question = text(form, "question");
  if (question.length > 45) back(path, t("Die Frage darf höchstens 45 Zeichen lang sein (eine Grenze von Discord)."));
  const answers = parseAnswers(text(form, "answers"));
  if (mode === "question" && (!question || !answers.length)) back(path, t("Bitte eine Frage und mindestens eine richtige Antwort angeben."));
  const minAccountAgeDays = int(form, "minAccountAgeDays", 0, 365);
  const kickAfterHours = int(form, "kickAfterHours", 0, 24 * 30);
  if (Number.isNaN(minAccountAgeDays) || Number.isNaN(kickAfterHours)) back(path, t("Bitte nur ganze Zahlen im erlaubten Bereich."));

  const values = {
    enabled, mode, roleId, unverifiedRoleId, channelId, logChannelId, title, description, question, answers,
    minAccountAgeDays: minAccountAgeDays ?? 0, kickAfterHours: kickAfterHours ?? 0,
  };
  await db.insert(verificationSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: verificationSettings.guildId, set: values });
  await notifySettingsChanged(guildId);

  // Nachricht mit dem Knopf posten oder aktualisieren.
  let error: string | undefined;
  if (channelId) {
    const body = buildVerificationMessage(values);
    let messageId = old?.messageId ?? null;
    try {
      if (messageId && old?.channelId === channelId) {
        try {
          await editBotMessage(channelId, messageId, body);
        } catch (err) {
          if (!(err instanceof DiscordError && err.status === 404)) throw err;
          messageId = null;
        }
      } else if (messageId && old?.channelId) {
        await deleteBotMessage(old.channelId, messageId).catch(() => {});
        messageId = null;
      }
      if (!messageId) messageId = (await sendBotMessage(channelId, body)).id;
    } catch (err) {
      error = postError(err);
    }
    await db.update(verificationSettings).set({ messageId }).where(eq(verificationSettings.guildId, guildId));
  } else if (old?.messageId && old.channelId) {
    await deleteBotMessage(old.channelId, old.messageId).catch(() => {});
    await db.update(verificationSettings).set({ messageId: null }).where(eq(verificationSettings.guildId, guildId));
  }
  back(path, error);
}

// --- Lockdown ---

/** Setzt das Ende auf jetzt. Der Bot öffnet den Kanal innerhalb weniger Sekunden. */
export async function unlockFromDashboard(guildId: string, channelId: string | null) {
  await requireGuildAccess(guildId, "verification", "Kanal entsperrt");
  const { db } = database();
  await db
    .update(channelLocks)
    .set({ until: new Date() })
    .where(channelId ? and(eq(channelLocks.guildId, guildId), eq(channelLocks.channelId, channelId)) : eq(channelLocks.guildId, guildId));
  back(`/servers/${guildId}/moderation`);
}

// --- Team-Notizen ---

export async function addMemberNote(guildId: string, userId: string, form: FormData) {
  const { user } = await requireGuildAccess(guildId, "cases", "Notiz hinzugefügt");
  const path = `/servers/${guildId}/cases`;
  if (!SNOWFLAKE.test(userId)) back(path, t("Ungültige Nutzer-ID."));
  const back2 = (e?: string) => {
    if (!e) recordChange();
    return redirect(`${path}?nutzer=${userId}&${e ? `fehler=${encodeURIComponent(e)}` : "gespeichert=1"}`);
  };
  const note = text(form, "note");
  if (!note || note.length > 1000) back2(t("Bitte eine Notiz mit höchstens 1000 Zeichen schreiben."));
  const { db } = database();
  const [n] = await db.select({ n: count() }).from(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.userId, userId)));
  if ((n?.n ?? 0) >= 50) back2(t("Zu dieser Person gibt es schon 50 Notizen. Lösche erst alte."));
  await db.insert(memberNotes).values({ guildId, userId, authorId: user.id, text: note });
  back2();
}

export async function deleteMemberNote(guildId: string, noteId: number) {
  await requireGuildAccess(guildId, "cases", "Notiz gelöscht");
  const { db } = database();
  const [gone] = await db.delete(memberNotes).where(and(eq(memberNotes.guildId, guildId), eq(memberNotes.id, noteId))).returning();
  recordChange();
  redirect(`/servers/${guildId}/cases?${gone ? `nutzer=${gone.userId}&` : ""}gespeichert=1`);
}

// --- Vorschläge ---

const SUGGESTIONS = (guildId: string) => `/servers/${guildId}/suggestions`;

export async function saveSuggestions(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "suggestions", "Vorschläge gespeichert");
  const path = SUGGESTIONS(guildId);
  const { db, notifySettingsChanged } = database();
  const [old] = await db.select().from(suggestionSettings).where(eq(suggestionSettings.guildId, guildId));
  const channelId = text(form, "channelId") || null;
  if (channelId && channelId !== old?.channelId && !(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const enabled = form.get("enabled") === "on";
  if (enabled && !channelId) back(path, t("Bitte einen Kanal für Vorschläge wählen."));
  const values = {
    enabled,
    channelId,
    autoConvert: form.get("autoConvert") === "on",
    threads: form.get("threads") === "on",
    anonymous: form.get("anonymous") === "on",
    dmAuthor: form.get("dmAuthor") === "on",
  };
  await db.insert(suggestionSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: suggestionSettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function setSuggestionStatusFromDashboard(guildId: string, suggestionId: number, form: FormData) {
  const { user } = await requireGuildAccess(guildId, "suggestions", "Vorschlag entschieden");
  const path = SUGGESTIONS(guildId);
  const status = text(form, "status") as SuggestionStatus;
  if (!(status in SUGGESTION_STATUS)) back(path, t("Unbekannter Status."));
  const reason = text(form, "reason") || null;
  if (reason && reason.length > 500) back(path, t("Die Begründung darf höchstens 500 Zeichen lang sein."));
  const { db } = database();
  const [row] = await db
    .update(suggestions)
    .set({ status, statusReason: reason, statusBy: user.id })
    .where(and(eq(suggestions.id, suggestionId), eq(suggestions.guildId, guildId)))
    .returning();
  if (!row) back(path, t("Diesen Vorschlag gibt es nicht mehr."));
  const [settings] = await db.select().from(suggestionSettings).where(eq(suggestionSettings.guildId, guildId));
  let error: string | undefined;
  if (row.messageId) {
    const [author] = await getMembers(guildId, [row.authorId]);
    const body = buildSuggestionMessage(
      { ...row, authorName: author && author.name !== row.authorId ? author.name : undefined, authorAvatar: author?.avatar || undefined },
      settings?.anonymous ?? false,
    );
    try {
      await editBotMessage(row.channelId, row.messageId, body);
    } catch (err) {
      if (!(err instanceof DiscordError && err.status === 404)) error = t("Gespeichert, aber die Nachricht im Kanal konnte nicht aktualisiert werden.");
    }
  }
  back(path, error);
}

export async function deleteSuggestion(guildId: string, suggestionId: number) {
  await requireGuildAccess(guildId, "suggestions", "Vorschlag gelöscht");
  const { db } = database();
  const [gone] = await db.delete(suggestions).where(and(eq(suggestions.id, suggestionId), eq(suggestions.guildId, guildId))).returning();
  if (gone) {
    await db.delete(suggestionVotes).where(eq(suggestionVotes.suggestionId, gone.id));
    if (gone.messageId) await deleteBotMessage(gone.channelId, gone.messageId).catch(() => {});
  }
  back(SUGGESTIONS(guildId));
}

// --- Rollen auf Zeit ---

/** Setzt das Ende auf jetzt. Der Bot nimmt die Rolle innerhalb einer Minute weg. */
export async function endTempRole(guildId: string, userId: string, roleId: string) {
  await requireGuildAccess(guildId, "roles", "Zeitrolle beendet");
  const { db } = database();
  await db
    .update(tempRoles)
    .set({ expiresAt: new Date() })
    .where(and(eq(tempRoles.guildId, guildId), eq(tempRoles.userId, userId), eq(tempRoles.roleId, roleId)));
  back(`/servers/${guildId}/roles`);
}

// --- Zähl-Kanal ---

const COUNTING = (guildId: string) => `/servers/${guildId}/counting`;

function countingOptions(form: FormData) {
  return {
    allowSameUser: form.get("allowSameUser") === "on",
    resetOnFail: form.get("resetOnFail") === "on",
    onlyNumbers: form.get("onlyNumbers") === "on",
  };
}

export async function addCountingChannel(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "counting", "Zähl-Kanal hinzugefügt");
  const path = COUNTING(guildId);
  const channelId = text(form, "channelId");
  if (!(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(countingChannels).where(eq(countingChannels.guildId, guildId));
  if (n >= 5) back(path, t("Ein Server kann höchstens 5 Zähl-Kanäle haben."));
  const [chain] = await db.select().from(wordChainChannels).where(eq(wordChainChannels.channelId, channelId));
  if (chain) back(path, t("Dieser Kanal ist schon eine Wortkette."));
  const added = await db.insert(countingChannels).values({ guildId, channelId, ...countingOptions(form) }).onConflictDoNothing().returning();
  if (!added.length) back(path, t("Dieser Kanal ist schon ein Zähl-Kanal."));
  await notifySettingsChanged(guildId);
  back(path);
}

export async function updateCountingChannel(guildId: string, channelId: string, form: FormData) {
  await requireGuildAccess(guildId, "counting", "Zähl-Kanal geändert");
  const { db } = database();
  await db.update(countingChannels).set(countingOptions(form)).where(and(eq(countingChannels.guildId, guildId), eq(countingChannels.channelId, channelId)));
  back(COUNTING(guildId));
}

export async function resetCountingChannel(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "counting", "Zähl-Kanal zurückgesetzt");
  const { db } = database();
  await db.update(countingChannels).set({ current: 0, lastUserId: null }).where(and(eq(countingChannels.guildId, guildId), eq(countingChannels.channelId, channelId)));
  back(COUNTING(guildId));
}

export async function deleteCountingChannel(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "counting", "Zähl-Kanal entfernt");
  const { db, notifySettingsChanged } = database();
  await db.delete(countingChannels).where(and(eq(countingChannels.guildId, guildId), eq(countingChannels.channelId, channelId)));
  await notifySettingsChanged(guildId);
  back(COUNTING(guildId));
}

// --- Sprachkanal-Rollen ---

export async function addVoiceRole(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "roles", "Sprachkanal-Rolle hinzugefügt");
  const path = `/servers/${guildId}/roles`;
  const channelId = text(form, "voiceChannelId");
  const channels = await getGuildChannels(guildId);
  if (channelId !== ANY_VOICE_CHANNEL && !channels.some((c) => c.id === channelId && (c.type === CHANNEL_VOICE || c.type === CHANNEL_STAGE))) {
    back(path, t("Bitte einen Sprachkanal dieses Servers wählen."));
  }
  const { valid } = await assignableRoles(guildId, form, "voiceRoleId");
  if (valid.length !== 1) back(path, t("Diese Rolle kann Libremod nicht vergeben."));
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(voiceRoles).where(eq(voiceRoles.guildId, guildId));
  if (n >= 25) back(path, t("Mehr als 25 Sprachkanal-Rollen gehen nicht."));
  await db.insert(voiceRoles).values({ guildId, channelId, roleId: valid[0]! }).onConflictDoNothing();
  await notifySettingsChanged(guildId);
  back(path);
}

export async function removeVoiceRole(guildId: string, channelId: string, roleId: string) {
  await requireGuildAccess(guildId, "roles", "Sprachkanal-Rolle entfernt");
  const { db, notifySettingsChanged } = database();
  await db.delete(voiceRoles).where(and(eq(voiceRoles.guildId, guildId), eq(voiceRoles.channelId, channelId), eq(voiceRoles.roleId, roleId)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/roles`);
}

// --- Wortkette ---

const WORDCHAIN = (g: string) => `/servers/${g}/wordchain`;

export async function addWordChain(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "wordchain", "Wortkette hinzugefügt");
  const path = WORDCHAIN(guildId);
  const channelId = text(form, "channelId");
  if (!(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(wordChainChannels).where(eq(wordChainChannels.guildId, guildId));
  if (n >= 5) back(path, t("Ein Server kann höchstens 5 Wortketten haben."));
  const [counting] = await db.select().from(countingChannels).where(eq(countingChannels.channelId, channelId));
  if (counting) back(path, t("Dieser Kanal ist schon ein Zähl-Kanal."));
  const added = await db
    .insert(wordChainChannels)
    .values({ guildId, channelId, allowSameUser: form.get("allowSameUser") === "on" })
    .onConflictDoNothing()
    .returning();
  if (!added.length) back(path, t("Dieser Kanal ist schon eine Wortkette."));
  await db.delete(wordChainWords).where(eq(wordChainWords.channelId, channelId));
  await notifySettingsChanged(guildId);
  back(path);
}

export async function updateWordChain(guildId: string, channelId: string, form: FormData) {
  await requireGuildAccess(guildId, "wordchain", "Wortkette geändert");
  const { db } = database();
  await db
    .update(wordChainChannels)
    .set({ allowSameUser: form.get("allowSameUser") === "on" })
    .where(and(eq(wordChainChannels.guildId, guildId), eq(wordChainChannels.channelId, channelId)));
  back(WORDCHAIN(guildId));
}

export async function resetWordChain(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "wordchain", "Wortkette zurückgesetzt");
  const { db } = database();
  await db.transaction(async (tx) => {
    const done = await tx
      .update(wordChainChannels)
      .set({ lastWord: null, lastUserId: null, length: 0 })
      .where(and(eq(wordChainChannels.guildId, guildId), eq(wordChainChannels.channelId, channelId)))
      .returning();
    if (done.length) await tx.delete(wordChainWords).where(eq(wordChainWords.channelId, channelId));
  });
  back(WORDCHAIN(guildId));
}

export async function deleteWordChain(guildId: string, channelId: string) {
  await requireGuildAccess(guildId, "wordchain", "Wortkette entfernt");
  const { db, notifySettingsChanged } = database();
  const gone = await db.delete(wordChainChannels).where(and(eq(wordChainChannels.guildId, guildId), eq(wordChainChannels.channelId, channelId))).returning();
  if (gone.length) await db.delete(wordChainWords).where(eq(wordChainWords.channelId, channelId));
  await notifySettingsChanged(guildId);
  back(WORDCHAIN(guildId));
}

// --- Zitate ---

export async function deleteQuote(guildId: string, id: number) {
  await requireGuildAccess(guildId, "quotes", "Zitat gelöscht");
  const { db } = database();
  await db.delete(quotes).where(and(eq(quotes.guildId, guildId), eq(quotes.id, id)));
  back(`/servers/${guildId}/quotes`);
}

// --- Namensschutz ---

export async function saveNameGuard(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "automod", "Namensschutz gespeichert");
  const path = `/servers/${guildId}/automod`;
  const action = text(form, "nameGuard.action");
  if (!NAME_GUARD_ACTIONS.some((a) => a.value === action)) back(path, t("Unbekannte Aktion beim Namensschutz."));
  const roles = new Set((await getGuildRoles(guildId)).map((r) => r.id));
  const roleIds = [...new Set(form.getAll("nameGuard.roles").filter((v): v is string => typeof v === "string" && roles.has(v) && v !== guildId))];
  const names = [...new Set(text(form, "nameGuard.names").split(/[,\n]/).map((n) => n.trim().slice(0, 64)).filter(Boolean))];
  if (names.length > 50) back(path, t("Höchstens 50 zusätzliche Namen."));
  const values = { enabled: form.get("nameGuard.enabled") === "on", action, roleIds, names };
  const { db, notifySettingsChanged } = database();
  await db.insert(nameGuardSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: nameGuardSettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

// --- Einsprüche ---

const APPEALS = (g: string) => `/servers/${g}/appeals`;

export async function saveAppealSettings(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "appeals", "Einspruch-Einstellungen gespeichert");
  const path = APPEALS(guildId);
  const channelId = text(form, "channelId") || null;
  if (channelId && !(await textChannelIds(guildId)).text.has(channelId)) back(path, t("Bitte einen Textkanal dieses Servers wählen."));
  const question = text(form, "question") || t("Warum sollten wir deinen Ban aufheben?");
  if (question.length > 300) back(path, t("Die Frage darf höchstens 300 Zeichen lang sein."));
  const cooldownDays = int(form, "cooldownDays", 0, 365) ?? 30;
  if (Number.isNaN(cooldownDays)) back(path, t("Wartezeit bitte zwischen 0 und 365 Tagen."));
  const values = { enabled: form.get("enabled") === "on", channelId, question, cooldownDays };
  const { db } = database();
  await db.insert(appealSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: appealSettings.guildId, set: values });
  back(path);
}

export async function decideAppeal(guildId: string, id: number, accept: boolean, form: FormData) {
  const { user } = await requireGuildAccess(guildId, "appeals", "Einspruch entschieden");
  const path = APPEALS(guildId);
  const reason = text(form, "reason").slice(0, 500) || null;
  const { db } = database();
  // Nur offene Einsprüche entscheiden, auch wenn zwei aus dem Team gleichzeitig klicken.
  const [row] = await db
    .update(banAppeals)
    .set({ status: accept ? "accepted" : "denied", reviewerId: user.id, reviewReason: reason, reviewedAt: new Date() })
    .where(and(eq(banAppeals.guildId, guildId), eq(banAppeals.id, id), eq(banAppeals.status, "open")))
    .returning();
  if (!row) back(path, t("Über diesen Einspruch wurde schon entschieden."));
  const guild = await getGuildInfo(guildId).catch(() => ({ name: t("dem Server") }));
  if (accept) {
    try {
      await unbanUser(guildId, row!.userId, t("Einspruch angenommen von {username}{n1}", { username: user.username, n1: reason ? `: ${reason}` : "" }));
    } catch {
      await db.update(banAppeals).set({ status: "open", reviewerId: null, reviewReason: null, reviewedAt: null }).where(eq(banAppeals.id, id));
      back(path, t("Der Ban konnte nicht aufgehoben werden. Hat Libremod das Recht „Mitglieder bannen“?"));
    }
    await db
      .update(modCases)
      .set({ active: false })
      .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, row!.userId), eq(modCases.type, "ban")));
  }
  const message = accept
    ? t("Dein Einspruch auf **{name}** wurde angenommen, dein Ban ist aufgehoben. Du kannst wieder beitreten.", { name: guild.name })
    : t("Dein Einspruch auf **{name}** wurde abgelehnt.", { name: guild.name });
  await sendDirectMessage(row!.userId, { content: `${message}${reason ? t("\nBegründung: {reason}", { reason }) : ""}`.slice(0, 2000), allowed_mentions: { parse: [] } });
  back(path);
}

// --- Team-Zugänge ---

const TEAM = (guildId: string) => `/servers/${guildId}/team`;
const MAX_TEAM_RULES = 25;

export async function saveTeamAccess(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "team", "Team-Zugang gespeichert");
  const path = TEAM(guildId);
  const roleId = text(form, "roleId");
  const roles = await getGuildRoles(guildId);
  const role = roles.find((r) => r.id === roleId);
  if (!role || role.id === guildId || role.managed) back(path, t("Bitte eine normale Rolle dieses Servers wählen (nicht @everyone und keine Bot-Rolle)."));
  const areas = [...new Set(form.getAll("areas").filter((v): v is string => typeof v === "string" && isTeamArea(v)))];
  const { db } = database();
  if (!areas.length) {
    await db.delete(dashboardTeamAccess).where(and(eq(dashboardTeamAccess.guildId, guildId), eq(dashboardTeamAccess.roleId, roleId)));
    back(path);
  }
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(dashboardTeamAccess).where(eq(dashboardTeamAccess.guildId, guildId));
  const [existing] = await db.select().from(dashboardTeamAccess).where(and(eq(dashboardTeamAccess.guildId, guildId), eq(dashboardTeamAccess.roleId, roleId)));
  if (!existing && n >= MAX_TEAM_RULES) back(path, t("Höchstens {MAX_TEAM_RULES} Rollen mit Team-Zugang.", { MAX_TEAM_RULES }));
  await db
    .insert(dashboardTeamAccess)
    .values({ guildId, roleId, areas })
    .onConflictDoUpdate({ target: [dashboardTeamAccess.guildId, dashboardTeamAccess.roleId], set: { areas, updatedAt: new Date() } });
  back(path);
}

export async function deleteTeamAccess(guildId: string, roleId: string) {
  await requireGuildAccess(guildId, "team", "Team-Zugang entfernt");
  const { db } = database();
  await db.delete(dashboardTeamAccess).where(and(eq(dashboardTeamAccess.guildId, guildId), eq(dashboardTeamAccess.roleId, roleId)));
  back(TEAM(guildId));
}

// --- Export & Import ---

export async function importSettingsFile(guildId: string, form: FormData) {
  await requireGuildAccess(guildId, "backup", "Einstellungen importiert");
  const path = `/servers/${guildId}/backup`;
  if (form.get("confirm") !== "on") back(path, t("Bitte bestätige, dass die bisherigen Einstellungen ersetzt werden."));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, t("Bitte eine Einstellungsdatei auswählen."));
  if ((file as File).size > MAX_BACKUP_BYTES) back(path, t("Die Datei ist zu groß (höchstens 2 MB)."));
  const parsed = parseBackup(await (file as File).text());
  if (typeof parsed === "string") back(path, parsed);
  const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
  const known = new Set([...channels.map((c) => c.id), ...roles.map((r) => r.id)]);
  const { db, notifySettingsChanged } = database();
  let result: Awaited<ReturnType<typeof importSettings>>;
  try {
    result = await importSettings(db, guildId, parsed as BackupFile, known);
  } catch (err) {
    console.error("Import fehlgeschlagen", err);
    back(path, t("Der Import ist fehlgeschlagen. Es wurde nichts geändert."));
  }
  await notifySettingsChanged(guildId);
  const notes = [t("{rows} Einträge übernommen", { rows: result!.rows })];
  if (result!.cleared) notes.push(t("{cleared} unbekannte Kanäle oder Rollen entfernt", { cleared: result!.cleared }));
  if (result!.dropped) notes.push(t("{dropped} Einträge ohne passenden Kanal übersprungen", { dropped: result!.dropped }));
  recordChange(t("aus „{n0}“, {n1}", { n0: (parsed as BackupFile).guild?.name ?? "unbekannt", n1: notes.join(", ") }));
  redirect(`${path}?importiert=${encodeURIComponent(notes.join(" · "))}`);
}

// --- Rückgängig aus dem Änderungsprotokoll ---

export async function undoChange(guildId: string, entryId: number) {
  const { user } = await requireGuildAccess(guildId, "audit");
  const path = `/servers/${guildId}/audit`;
  const { db, notifySettingsChanged } = database();
  const [entry] = await db
    .select()
    .from(dashboardAudit)
    .where(and(eq(dashboardAudit.id, entryId), eq(dashboardAudit.guildId, guildId)))
    .limit(1);
  if (!entry?.before || !entry.after) back(path, t("Diese Änderung lässt sich nicht rückgängig machen."));
  if (entry!.undoneAt) back(path, t("Diese Änderung wurde schon rückgängig gemacht."));
  const current = await snapshotArea(db, guildId, entry!.area);
  if (!current || !stillAsAfter(current, entry!.after!)) {
    back(path, t("Seitdem wurde in diesem Bereich noch etwas geändert. Mach zuerst die neueren Änderungen rückgängig."));
  }
  try {
    await restoreSnapshot(db, guildId, entry!.before!);
  } catch (err) {
    console.error("Rückgängig fehlgeschlagen", err);
    back(path, t("Das hat nicht geklappt. Es wurde nichts geändert."));
  }
  await notifySettingsChanged(guildId);
  await db.update(dashboardAudit).set({ undoneAt: new Date(), undoneBy: user.username.slice(0, 100) }).where(eq(dashboardAudit.id, entry!.id));
  // Das Rückgängigmachen ist selbst wieder ein Eintrag, den man rückgängig machen kann.
  await db.insert(dashboardAudit).values({
    guildId,
    userId: user.id,
    userName: user.username.slice(0, 100),
    area: entry!.area,
    action: undoActionText(entry!.action).slice(0, 200),
    before: entry!.after,
    after: entry!.before,
  });
  redirect(`${path}?rueckgaengig=1`);
}
