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
  warnEscalations,
  type AutomodAction,
  type AutomodFilter,
  type EscalationAction,
  type LogCategory,
} from "@libremod/db";
import { MAX_TIMEOUT_SECONDS, parseDuration } from "@libremod/shared";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";

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
