"use server";

import { redirect } from "next/navigation";
import {
  and,
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
  count,
  warnEscalations,
  type AutomodAction,
  type AutomodFilter,
  type EscalationAction,
  type LogCategory,
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
} from "@libremod/shared";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import {
  CHANNEL_ANNOUNCEMENT,
  CHANNEL_TEXT,
  CHANNEL_CATEGORY,
  CHANNEL_VOICE,
  createGuildChannel,
  deleteGuildChannel,
  getGuildCounts,
  deleteBotMessage,
  DiscordError,
  editBotMessage,
  getBotTopPosition,
  getGuildChannels,
  getGuildRoles,
  sendBotMessage,
} from "@/lib/discord";

const SNOWFLAKE = /^\d{17,20}$/;
const AUTOMOD_ACTIONS: AutomodAction[] = ["delete", "warn", "timeout", "kick", "ban"];
const ESCALATION_ACTIONS: EscalationAction[] = ["timeout", "kick", "ban"];
const RAID_ACTIONS = ["alert", "timeout", "kick", "ban"];

function back(path: string, error?: string): never {
  redirect(error ? `${path}?fehler=${encodeURIComponent(error)}` : `${path}?gespeichert=1`);
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
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

// --- Moderation ---

export async function saveModeration(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/moderation`;
  const channel = text(form, "modLogChannelId");
  if (channel && !SNOWFLAKE.test(channel)) back(path, "Ungültiger Kanal.");

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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/moderation`;
  const warnCount = int(form, "warnCount", 1, 100);
  const action = text(form, "action") as EscalationAction;
  const durationInput = text(form, "duration");
  const seconds = durationInput ? parseDuration(durationInput) : null;

  if (!warnCount) back(path, "Bitte eine Anzahl Verwarnungen zwischen 1 und 100 angeben.");
  if (!ESCALATION_ACTIONS.includes(action)) back(path, "Unbekannte Aktion.");
  if (durationInput && !seconds) back(path, "Diese Dauer verstehe ich nicht. Beispiele: 1h, 7d.");
  if (action === "timeout" && !seconds) back(path, "Für einen Timeout brauche ich eine Dauer.");
  if (action === "timeout" && seconds! > MAX_TIMEOUT_SECONDS) back(path, "Timeouts dürfen höchstens 28 Tage dauern.");

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
  await requireGuildAccess(guildId);
  const { db, notifySettingsChanged } = database();
  await db.delete(warnEscalations).where(and(eq(warnEscalations.guildId, guildId), eq(warnEscalations.warnCount, warnCount)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/moderation`);
}

// --- Auto-Mod ---

export async function saveAutomod(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/automod`;
  const { db, notifySettingsChanged } = database();
  await ensureSettings(guildId);

  const rules: (typeof automodRules.$inferInsert)[] = [];
  for (const filter of automodFilter.enumValues as readonly AutomodFilter[]) {
    const action = text(form, `${filter}.action`) as AutomodAction;
    if (!AUTOMOD_ACTIONS.includes(action)) back(path, "Unbekannte Aktion.");
    const durationInput = text(form, `${filter}.duration`);
    const durationSeconds = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && !durationSeconds) back(path, `Die Dauer „${durationInput}“ verstehe ich nicht. Beispiele: 10m, 1h, 1d.`);
    if (action === "timeout" && durationSeconds && durationSeconds > MAX_TIMEOUT_SECONDS) back(path, "Timeouts dürfen höchstens 28 Tage dauern.");

    const threshold = int(form, `${filter}.threshold`, filter === "caps" ? 50 : 2, 100);
    if (Number.isNaN(threshold)) back(path, `Ungültige Schwelle beim Filter „${filter}“.`);

    const config: Record<string, unknown> = {};
    if (threshold) config.threshold = threshold;
    const notice = text(form, `${filter}.notice`);
    if (notice.length > 500) back(path, "Der Hinweistext darf höchstens 500 Zeichen lang sein.");
    if (notice) config.notice = notice;
    if (filter === "words") {
      const words = list(form, "words.list");
      if (words.length > 1000) back(path, "Die Wortliste kann höchstens 1000 Einträge haben.");
      config.words = [...new Set(words)];
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
  if (Number.isNaN(raidJoinThreshold) || Number.isNaN(raidWindowSeconds)) back(path, "Ungültige Werte beim Raid-Schutz.");
  if (!RAID_ACTIONS.includes(raidAction)) back(path, "Unbekannte Raid-Aktion.");

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
  await requireGuildAccess(guildId);
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
    if (!known.text.has(channelId) && current.get(category) !== channelId) back(path, "Bitte nur Textkanäle dieses Servers wählen.");
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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/logging`;
  const channelId = text(form, "channelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");

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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/welcome`;
  const known = await textChannelIds(guildId);

  const values = {
    welcomeEnabled: form.get("welcomeEnabled") === "on",
    welcomeChannelId: text(form, "welcomeChannelId") || null,
    welcomeMessage: text(form, "welcomeMessage"),
    welcomeEmbed: form.get("welcomeEmbed") === "on",
    dmEnabled: form.get("dmEnabled") === "on",
    dmMessage: text(form, "dmMessage"),
    goodbyeEnabled: form.get("goodbyeEnabled") === "on",
    goodbyeChannelId: text(form, "goodbyeChannelId") || null,
    goodbyeMessage: text(form, "goodbyeMessage"),
    goodbyeEmbed: form.get("goodbyeEmbed") === "on",
  };
  for (const id of [values.welcomeChannelId, values.goodbyeChannelId]) {
    if (id && !known.text.has(id)) back(path, "Bitte nur Textkanäle dieses Servers wählen.");
  }
  if (values.welcomeEnabled && !values.welcomeChannelId) back(path, "Für die Willkommensnachricht fehlt noch der Kanal.");
  if (values.goodbyeEnabled && !values.goodbyeChannelId) back(path, "Für die Abschiedsnachricht fehlt noch der Kanal.");
  for (const [key, label] of [
    ["welcomeMessage", "Willkommensnachricht"],
    ["dmMessage", "Direktnachricht"],
    ["goodbyeMessage", "Abschiedsnachricht"],
  ] as const) {
    if (!values[key]) back(path, `Der Text der ${label} ist leer.`);
    if (values[key].length > MAX_TEMPLATE_LENGTH) back(path, `Der Text der ${label} ist zu lang (höchstens ${MAX_TEMPLATE_LENGTH} Zeichen).`);
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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/roles`;
  const humans = await assignableRoles(guildId, form, "humanRoles");
  const bots = await assignableRoles(guildId, form, "botRoles");
  if (humans.invalid.length || bots.invalid.length) back(path, "Mindestens eine Rolle kann Libremod nicht vergeben.");

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

  if (!title || title.length > 256) back(path, "Bitte eine Überschrift mit höchstens 256 Zeichen angeben.");
  if (description.length > 2000) back(path, "Die Beschreibung darf höchstens 2000 Zeichen lang sein.");
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  if (invalid.length) back(path, "Mindestens eine Rolle kann Libremod nicht vergeben.");
  if (!valid.length) back(path, "Bitte mindestens eine Rolle auswählen.");
  if (valid.length > MAX_PANEL_ROLES) back(path, `Ein Panel kann höchstens ${MAX_PANEL_ROLES} Rollen haben.`);

  // In der Reihenfolge der Rollenliste des Servers, höchste zuerst.
  const roleIds = [...roles.keys()].filter((id) => valid.includes(id));
  return { title, description, channelId, style, single, roleIds, roleNames: roleIds.map((id) => ({ id, name: roles.get(id)!.name })) };
}

const postError = (err: unknown) =>
  err instanceof DiscordError && (err.status === 403 || err.status === 404)
    ? "Gespeichert, aber Libremod konnte im Kanal nicht posten. Prüfe dort die Rechte „Nachrichten senden“ und „Links einbetten“."
    : "Gespeichert, aber die Nachricht konnte nicht gepostet werden. Bitte später nochmal speichern.";

export async function createPanel(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/roles/${panelId}`;
  const { db } = database();
  const [old] = await db.select().from(rolePanels).where(and(eq(rolePanels.id, panelId), eq(rolePanels.guildId, guildId)));
  if (!old) back(`/servers/${guildId}/roles`, "Dieses Panel gibt es nicht mehr.");
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
  await requireGuildAccess(guildId);
  const { db } = database();
  const [panel] = await db.delete(rolePanels).where(and(eq(rolePanels.id, panelId), eq(rolePanels.guildId, guildId))).returning();
  if (panel?.messageId) await deleteBotMessage(panel.channelId, panel.messageId).catch(() => {});
  back(`/servers/${guildId}/roles`);
}

// --- Level ---

const ANNOUNCE = ["off", "same", "channel", "dm"] as const;

export async function saveLevels(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/levels`;
  const textXpMin = int(form, "textXpMin", 0, 1000) ?? 15;
  const textXpMax = int(form, "textXpMax", 0, 1000) ?? 25;
  const cooldownSeconds = int(form, "cooldownSeconds", 0, 3600) ?? 60;
  const voiceXpPerMinute = int(form, "voiceXpPerMinute", 0, 1000) ?? 10;
  if ([textXpMin, textXpMax, cooldownSeconds, voiceXpPerMinute].some(Number.isNaN)) back(path, "Bitte nur ganze Zahlen im erlaubten Bereich.");
  if (textXpMin > textXpMax) back(path, "Die Mindest-XP dürfen nicht größer als die Höchst-XP sein.");

  const announce = text(form, "announce") as (typeof ANNOUNCE)[number];
  if (!ANNOUNCE.includes(announce)) back(path, "Unbekannte Einstellung für die Verkündung.");
  const announceChannelId = text(form, "announceChannelId") || null;
  const known = await textChannelIds(guildId);
  if (announceChannelId && !known.text.has(announceChannelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  if (announce === "channel" && !announceChannelId) back(path, "Für „In einem festen Kanal“ fehlt noch der Kanal.");
  const announceMessage = text(form, "announceMessage") || "Glückwunsch {user}, du bist jetzt **Level {level}**!";
  if (announceMessage.length > 500) back(path, "Der Text für den Level-Aufstieg darf höchstens 500 Zeichen lang sein.");

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
  };
  const { db, notifySettingsChanged } = database();
  await db.transaction(async (tx) => {
    await tx.insert(levelSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: levelSettings.guildId, set: values });
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

export async function addLevelReward(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/levels`;
  const level = int(form, "level", 1, 500);
  if (!level) back(path, "Bitte ein Level zwischen 1 und 500 angeben.");
  const { valid } = await assignableRoles(guildId, form, "roleId");
  if (valid.length !== 1) back(path, "Diese Rolle kann Libremod nicht vergeben.");
  const { db, notifySettingsChanged } = database();
  await db
    .insert(levelRewards)
    .values({ guildId, level, roleId: valid[0]! })
    .onConflictDoUpdate({ target: [levelRewards.guildId, levelRewards.level], set: { roleId: valid[0]! } });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function removeLevelReward(guildId: string, level: number) {
  await requireGuildAccess(guildId);
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
  const embedTitle = text(form, "embedTitle") || null;
  const color = /^#[0-9a-f]{6}$/i.exec(text(form, "embedColor"));
  if (!COMMAND_NAME.test(name)) back(path, "Der Name darf nur Kleinbuchstaben, Zahlen, - und _ enthalten (höchstens 32 Zeichen).");
  if (RESERVED_COMMANDS.includes(name)) back(path, `/${name} ist ein eingebauter Befehl von Libremod. Bitte einen anderen Namen wählen.`);
  if (!description || description.length > 100) back(path, "Bitte eine Beschreibung mit höchstens 100 Zeichen angeben.");
  if (!responses.length) back(path, "Bitte mindestens eine Antwort eingeben.");
  if (responses.length > 20) back(path, "Höchstens 20 Antworten pro Befehl.");
  const max = embed ? 4000 : 2000;
  if (responses.some((r) => r.length > max)) back(path, `Eine Antwort ist zu lang (höchstens ${max} Zeichen).`);
  if (embedTitle && embedTitle.length > 256) back(path, "Die Embed-Überschrift darf höchstens 256 Zeichen lang sein.");
  return {
    name,
    description,
    responses,
    embed,
    embedTitle,
    embedColor: color ? parseInt(color[0].slice(1), 16) : null,
    ephemeral: form.get("ephemeral") === "on",
  };
}

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && ("code" in err ? err.code : (err as { cause?: { code?: string } }).cause?.code) === "23505";

export async function createCommand(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/commands`;
  const values = readCommandForm(form, path);
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customCommands).where(eq(customCommands.guildId, guildId));
  if (n >= MAX_CUSTOM_COMMANDS) back(path, `Ein Server kann höchstens ${MAX_CUSTOM_COMMANDS} eigene Befehle haben.`);
  try {
    await db.insert(customCommands).values({ guildId, ...values });
  } catch (err) {
    if (isUniqueViolation(err)) back(path, `Den Befehl /${values.name} gibt es schon.`);
    throw err;
  }
  await notifySettingsChanged(guildId);
  back(path);
}

export async function updateCommand(guildId: string, id: number, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/commands/${id}`;
  const values = readCommandForm(form, path);
  const { db, notifySettingsChanged } = database();
  try {
    await db.update(customCommands).set(values).where(and(eq(customCommands.id, id), eq(customCommands.guildId, guildId)));
  } catch (err) {
    if (isUniqueViolation(err)) back(path, `Den Befehl /${values.name} gibt es schon.`);
    throw err;
  }
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteCommand(guildId: string, id: number) {
  await requireGuildAccess(guildId);
  const { db, notifySettingsChanged } = database();
  await db.delete(customCommands).where(and(eq(customCommands.id, id), eq(customCommands.guildId, guildId)));
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/commands`);
}

// --- Geplante Nachrichten ---

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;

export async function createScheduled(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/schedule`;
  const channelId = text(form, "channelId");
  const content = text(form, "content");
  const embed = form.get("embed") === "on";
  const embedTitle = text(form, "embedTitle") || null;
  const kind = text(form, "kind");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  if (!content) back(path, "Die Nachricht ist leer.");
  if (content.length > (embed ? 4000 : 2000)) back(path, "Die Nachricht ist zu lang.");

  let row: { kind: "interval" | "daily" | "weekly"; intervalMinutes: number | null; timeOfDay: string | null; weekday: number | null };
  if (kind === "interval") {
    const value = int(form, "intervalValue", 1, 1000);
    const unit = text(form, "intervalUnit") as keyof typeof UNIT_MINUTES;
    if (!value || !(unit in UNIT_MINUTES)) back(path, "Bitte einen gültigen Abstand angeben.");
    const minutes = value * UNIT_MINUTES[unit];
    if (minutes < MIN_INTERVAL_MINUTES) back(path, `Der Abstand muss mindestens ${MIN_INTERVAL_MINUTES} Minuten betragen.`);
    if (minutes > 60 * 24 * 90) back(path, "Der Abstand darf höchstens 90 Tage betragen.");
    row = { kind: "interval", intervalMinutes: minutes, timeOfDay: null, weekday: null };
  } else if (kind === "daily" || kind === "weekly") {
    const time = parseTimeOfDay(text(form, "timeOfDay"));
    if (!time) back(path, "Bitte eine Uhrzeit wie 18:00 angeben.");
    const timeOfDay = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
    const weekday = kind === "weekly" ? int(form, "weekday", 1, 7) : null;
    if (kind === "weekly" && !weekday) back(path, "Bitte einen Wochentag wählen.");
    row = { kind, intervalMinutes: null, timeOfDay, weekday };
  } else {
    back(path, "Unbekannte Art des Zeitplans.");
  }

  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(scheduledMessages).where(eq(scheduledMessages.guildId, guildId));
  if (n >= 25) back(path, "Ein Server kann höchstens 25 geplante Nachrichten haben.");
  await db.insert(scheduledMessages).values({
    guildId,
    channelId,
    content,
    embed,
    embedTitle,
    ...row,
    nextRunAt: nextRun(toSchedule(row), new Date()),
  });
  back(path);
}

export async function toggleScheduled(guildId: string, id: number) {
  await requireGuildAccess(guildId);
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
  await requireGuildAccess(guildId);
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
  if (!channels.some((c) => c.id === parentId && c.type === CHANNEL_CATEGORY)) back(path, "Unbekannte Kategorie.");
  return parentId;
}

const channelError = (err: unknown) =>
  err instanceof DiscordError && err.status === 403
    ? "Libremod fehlt das Recht „Kanäle verwalten“. Bitte in den Servereinstellungen bei der Libremod-Rolle einschalten."
    : "Der Kanal konnte nicht erstellt werden. Bitte später nochmal versuchen.";

function readHubSettings(form: FormData, path: string) {
  const nameTemplate = text(form, "nameTemplate") || "Kanal von {username}";
  const userLimit = int(form, "userLimit", 0, 99) ?? 0;
  if (nameTemplate.length > 100) back(path, "Der Name darf höchstens 100 Zeichen lang sein.");
  if (Number.isNaN(userLimit)) back(path, "Max. Personen muss zwischen 0 und 99 liegen.");
  return { nameTemplate, userLimit };
}

export async function createTempHub(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/channels`;
  const hubName = text(form, "hubName") || "➕ Kanal erstellen";
  if (hubName.length > 100) back(path, "Der Kanalname darf höchstens 100 Zeichen lang sein.");
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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/channels`;
  const settings = readHubSettings(form, path);
  const { db, notifySettingsChanged } = database();
  await db.update(tempVoiceHubs).set(settings).where(and(eq(tempVoiceHubs.channelId, channelId), eq(tempVoiceHubs.guildId, guildId)));
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteTempHub(guildId: string, channelId: string) {
  await requireGuildAccess(guildId);
  const { db, notifySettingsChanged } = database();
  const [hub] = await db.delete(tempVoiceHubs).where(and(eq(tempVoiceHubs.channelId, channelId), eq(tempVoiceHubs.guildId, guildId))).returning();
  if (hub) await deleteGuildChannel(guildId, channelId).catch(() => {});
  await notifySettingsChanged(guildId);
  back(`/servers/${guildId}/channels`);
}

export async function createCounter(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/channels`;
  const template = text(form, "template");
  if (!template || template.length > 90) back(path, "Bitte einen Namen mit höchstens 90 Zeichen angeben.");
  if (!/\{(members|boosts|channels|roles)\}/i.test(template)) back(path, "Der Name braucht einen Platzhalter, z. B. {members}.");
  const parentId = await categoryOrNull(guildId, form, path);
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(counterChannels).where(eq(counterChannels.guildId, guildId));
  if (n >= 10) back(path, "Ein Server kann höchstens 10 Zähler haben.");

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
  await requireGuildAccess(guildId);
  const { db } = database();
  const [row] = await db.delete(counterChannels).where(and(eq(counterChannels.channelId, channelId), eq(counterChannels.guildId, guildId))).returning();
  if (row) await deleteGuildChannel(guildId, channelId).catch(() => {});
  back(`/servers/${guildId}/channels`);
}

// --- Fallakte ---

export async function revokeWarning(guildId: string, caseNumber: number) {
  await requireGuildAccess(guildId);
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
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  const mention = text(form, "mentionRoleId");
  let mentionRoleId: string | null = null;
  if (mention) {
    const roles = await getGuildRoles(guildId);
    if (mention !== guildId && !roles.some((r) => r.id === mention)) back(path, "Diese Rolle gibt es nicht.");
    mentionRoleId = mention;
  }
  const message = text(form, "message").replace(/\r\n/g, "\n");
  if (message.length > 1500) back(path, "Der Text ist zu lang (höchstens 1500 Zeichen).");
  return { channelId, mentionRoleId, message };
}

export async function createFeed(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/notifications`;
  const platform = text(form, "platform") as NotifyPlatform;
  if (!NOTIFY_PLATFORMS.includes(platform)) back(path, "Bitte eine Plattform wählen.");
  const creds = credentialsFromEnv();
  if (!platformAvailable(platform, creds)) back(path, `${PLATFORM_INFO[platform].label} ist auf dieser Libremod-Instanz nicht eingerichtet.`);
  const { channelId, mentionRoleId, message } = await readFeedForm(guildId, form, path);

  const { db } = database();
  const existing = await db.select().from(notificationFeeds).where(eq(notificationFeeds.guildId, guildId));
  if (existing.length >= MAX_FEEDS) back(path, `Ein Server kann höchstens ${MAX_FEEDS} Benachrichtigungen haben.`);

  let source: { sourceId: string; name: string };
  try {
    source = await resolveSource(platform, text(form, "source"), creds);
  } catch (err) {
    const msg = err instanceof SourceError ? err.message : "Unbekannter Fehler";
    back(path, msg.startsWith("Bitte") ? msg : `${PLATFORM_INFO[platform].label}: ${msg.replace(/\.$/, "")}. Bitte die Angabe prüfen.`);
  }
  if (existing.some((f) => f.platform === platform && f.sourceId === source.sourceId && f.channelId === channelId))
    back(path, "Diese Quelle wird in diesem Kanal schon gemeldet.");

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
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/notifications/${id}`;
  const { channelId, mentionRoleId, message } = await readFeedForm(guildId, form, path);
  const { db } = database();
  const [f] = await db.select().from(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  if (!f) back(`/servers/${guildId}/notifications`, "Diese Benachrichtigung gibt es nicht mehr.");
  await db
    .update(notificationFeeds)
    .set({ channelId, mentionRoleId, message: message || PLATFORM_INFO[f.platform].defaultMessage })
    .where(eq(notificationFeeds.id, id));
  back(path);
}

export async function toggleFeed(guildId: string, id: number) {
  await requireGuildAccess(guildId);
  const { db } = database();
  const [f] = await db.select().from(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  // Beim Einschalten Fehlerzähler zurücksetzen; gesehene Einträge bleiben, damit nichts Altes nachkommt.
  if (f) await db.update(notificationFeeds).set({ enabled: !f.enabled, failures: 0, lastError: null }).where(eq(notificationFeeds.id, id));
  back(`/servers/${guildId}/notifications`);
}

export async function deleteFeed(guildId: string, id: number) {
  await requireGuildAccess(guildId);
  const { db } = database();
  await db.delete(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId)));
  back(`/servers/${guildId}/notifications`);
}

// --- Highlights und Kanal-Pflege ---

export async function saveHighlights(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/tools`;
  const enabled = form.get("enabled") === "on";
  const channelId = text(form, "channelId") || null;
  const known = await textChannelIds(guildId);
  if (channelId && !known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  if (enabled && !channelId) back(path, "Für den Highlight-Kanal fehlt noch der Kanal.");
  const emoji = parseEmojiInput(text(form, "emoji") || "⭐");
  if (!emoji) back(path, "Bitte genau ein Emoji angeben, z. B. ⭐ oder ein Server-Emoji wie <:name:123…>.");
  const threshold = int(form, "threshold", 1, 100) ?? 5;
  if (Number.isNaN(threshold)) back(path, "Die Anzahl muss zwischen 1 und 100 liegen.");
  const values = { enabled, channelId, emoji, threshold, countSelf: form.get("countSelf") === "on", allowNsfw: form.get("allowNsfw") === "on" };
  const { db, notifySettingsChanged } = database();
  await db.insert(highlightSettings).values({ guildId, ...values }).onConflictDoUpdate({ target: highlightSettings.guildId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function createPurge(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/tools`;
  const channelId = text(form, "purgeChannelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  const intervalHours = Number(text(form, "intervalHours"));
  if (!PURGE_INTERVALS.some((i) => i.hours === intervalHours)) back(path, "Bitte einen Abstand aus der Liste wählen.");
  const { db } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(autoPurgeChannels).where(eq(autoPurgeChannels.guildId, guildId));
  if (n >= 10) back(path, "Ein Server kann höchstens 10 Kanäle automatisch leeren lassen.");
  const values = { intervalHours, keepPinned: form.get("keepPinned") === "on", nextRunAt: new Date(Date.now() + intervalHours * 3600_000) };
  await db.insert(autoPurgeChannels).values({ channelId, guildId, ...values }).onConflictDoUpdate({ target: autoPurgeChannels.channelId, set: values });
  back(path);
}

export async function deletePurge(guildId: string, channelId: string) {
  await requireGuildAccess(guildId);
  const { db } = database();
  await db.delete(autoPurgeChannels).where(and(eq(autoPurgeChannels.channelId, channelId), eq(autoPurgeChannels.guildId, guildId)));
  back(`/servers/${guildId}/tools`);
}

export async function createSlowmode(guildId: string, form: FormData) {
  await requireGuildAccess(guildId);
  const path = `/servers/${guildId}/tools`;
  const channelId = text(form, "slowChannelId");
  const known = await textChannelIds(guildId);
  if (!known.text.has(channelId)) back(path, "Bitte einen Textkanal dieses Servers wählen.");
  const messagesPerMinute = int(form, "messagesPerMinute", 2, 1000);
  if (!messagesPerMinute) back(path, "Die Schwelle muss zwischen 2 und 1000 Nachrichten pro Minute liegen.");
  const steps: readonly number[] = SLOWMODE_STEPS;
  const minSeconds = Number(text(form, "minSeconds"));
  const maxSeconds = Number(text(form, "maxSeconds"));
  if (!steps.includes(minSeconds) || !steps.includes(maxSeconds)) back(path, "Bitte Werte aus der Liste wählen.");
  if (minSeconds >= maxSeconds) back(path, "Das Maximum muss größer als das Minimum sein.");
  const { db, notifySettingsChanged } = database();
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(autoSlowmodeChannels).where(eq(autoSlowmodeChannels.guildId, guildId));
  if (n >= 20) back(path, "Ein Server kann höchstens 20 Kanäle mit automatischem Langsam-Modus haben.");
  const values = { messagesPerMinute, minSeconds, maxSeconds };
  await db.insert(autoSlowmodeChannels).values({ channelId, guildId, ...values }).onConflictDoUpdate({ target: autoSlowmodeChannels.channelId, set: values });
  await notifySettingsChanged(guildId);
  back(path);
}

export async function deleteSlowmode(guildId: string, channelId: string) {
  await requireGuildAccess(guildId);
  const { db } = database();
  await db.delete(autoSlowmodeChannels).where(and(eq(autoSlowmodeChannels.channelId, channelId), eq(autoSlowmodeChannels.guildId, guildId)));
  back(`/servers/${guildId}/tools`);
}
