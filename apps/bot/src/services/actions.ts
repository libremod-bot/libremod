import type { Guild, GuildMember, User } from "discord.js";
import { and, eq, warnEscalations, type CaseType, type Db, type ModCase } from "@libremod/db";
import { logger } from "../logger.js";
import { formatDuration, MAX_TIMEOUT_SECONDS } from "@libremod/shared";
import { countActiveWarnings, createCase, deactivateBans, getSettings } from "./cases.js";
import { CASE_LABELS, postModLog } from "./modlog.js";

export interface ModerationRequest {
  db: Db;
  guild: Guild;
  type: CaseType;
  target: User;
  /** Nur nötig für Timeout und Aufheben des Timeouts. */
  member?: GuildMember | null;
  moderatorId: string;
  reason?: string | null;
  /** Timeout-Dauer bzw. Dauer eines befristeten Bans in Sekunden. */
  durationSeconds?: number | null;
  /** Ban: Nachrichten der letzten X Sekunden löschen (max. 7 Tage). */
  deleteMessageSeconds?: number;
  automatic?: boolean;
}

export interface ModerationResult {
  case: ModCase;
  dmSent: boolean;
  /** Fälle, die durch Verwarnungsstufen zusätzlich ausgelöst wurden. */
  escalated?: ModerationResult;
}

const DM_VERBS: Partial<Record<CaseType, string>> = {
  warn: "wurdest verwarnt",
  timeout: "wurdest stummgeschaltet",
  kick: "wurdest gekickt",
  ban: "wurdest gebannt",
};

async function notify(target: User, guild: Guild, type: CaseType, reason?: string | null, durationSeconds?: number | null) {
  const verb = DM_VERBS[type];
  if (!verb) return false;
  const lines = [`Du ${verb} auf **${guild.name}**.`];
  if (durationSeconds) lines.push(`Dauer: ${formatDuration(durationSeconds)}`);
  lines.push(`Grund: ${reason || "Kein Grund angegeben"}`);
  try {
    await target.send(lines.join("\n"));
    return true;
  } catch {
    return false; // Direktnachrichten geschlossen
  }
}

/**
 * Führt eine Moderationsaktion aus: Discord-Aktion, Fall anlegen, Mod-Log, Direktnachricht
 * und bei Verwarnungen die Prüfung der Verwarnungsstufen. Wird von Befehlen, Auto-Mod und
 * später dem Dashboard gemeinsam genutzt.
 */
export async function moderate(req: ModerationRequest): Promise<ModerationResult> {
  const { db, guild, type, target, member, moderatorId, reason, durationSeconds } = req;
  const settings = await getSettings(db, guild.id);
  const auditReason = `${reason || "Kein Grund angegeben"} (durch ${moderatorId})`.slice(0, 512);

  // Vor Kick und Ban benachrichtigen, danach teilen wir keinen Server mehr.
  let dmSent = false;
  if (settings.dmOnAction && (type === "kick" || type === "ban")) {
    dmSent = await notify(target, guild, type, reason, durationSeconds);
  }

  let expiresAt: Date | null = null;
  switch (type) {
    case "warn":
      break;
    case "timeout": {
      if (!member) throw new Error("Timeout braucht ein Mitglied");
      const seconds = Math.min(durationSeconds ?? 0, MAX_TIMEOUT_SECONDS);
      await member.timeout(seconds * 1000, auditReason);
      expiresAt = new Date(Date.now() + seconds * 1000);
      break;
    }
    case "untimeout":
      if (!member) throw new Error("Aufheben des Timeouts braucht ein Mitglied");
      await member.timeout(null, auditReason);
      break;
    case "kick":
      await guild.members.kick(target, auditReason);
      break;
    case "ban":
      await guild.bans.create(target, {
        reason: auditReason,
        deleteMessageSeconds: Math.min(req.deleteMessageSeconds ?? 0, 7 * 24 * 60 * 60),
      });
      if (durationSeconds) expiresAt = new Date(Date.now() + durationSeconds * 1000);
      break;
    case "unban":
      await guild.bans.remove(target, auditReason);
      await deactivateBans(db, guild.id, target.id);
      break;
  }

  if (settings.dmOnAction && (type === "warn" || type === "timeout")) {
    dmSent = await notify(target, guild, type, reason, durationSeconds);
  }

  const created = await createCase(db, {
    guildId: guild.id,
    type,
    targetId: target.id,
    moderatorId,
    reason,
    expiresAt,
    automatic: req.automatic,
  });
  await postModLog(guild, settings.modLogChannelId, created);

  const result: ModerationResult = { case: created, dmSent };
  if (type === "warn") result.escalated = await escalate(db, guild, target);
  return result;
}

/** Prüft nach einer Verwarnung, ob eine Verwarnungsstufe erreicht ist, und führt sie aus. */
async function escalate(db: Db, guild: Guild, target: User): Promise<ModerationResult | undefined> {
  const warnings = await countActiveWarnings(db, guild.id, target.id);
  const [rule] = await db
    .select()
    .from(warnEscalations)
    .where(and(eq(warnEscalations.guildId, guild.id), eq(warnEscalations.warnCount, warnings)));
  if (!rule) return;

  const me = guild.members.me;
  if (!me) return;
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member && rule.action !== "ban") return;
  if (member && !member.manageable && rule.action !== "ban") return;

  try {
    return await moderate({
      db,
      guild,
      type: rule.action,
      target,
      member,
      moderatorId: me.id,
      reason: `Automatisch: ${warnings} Verwarnungen erreicht`,
      durationSeconds: rule.durationSeconds,
      automatic: true,
    });
  } catch (err) {
    logger.warn({ err, guildId: guild.id, action: rule.action }, "Verwarnungsstufe konnte nicht ausgeführt werden");
  }
}

/** Kurze Bestätigung für den Moderator nach einer Aktion. */
export function describeResult(result: ModerationResult, targetTag: string): string {
  const c = result.case;
  const lines = [`**${CASE_LABELS[c.type]}** für ${targetTag} (Fall #${c.caseNumber}).`];
  if (c.type !== "unban" && c.type !== "untimeout" && !result.dmSent) {
    lines.push("Hinweis: Die Person konnte nicht per Direktnachricht informiert werden.");
  }
  if (result.escalated) {
    const e = result.escalated.case;
    lines.push(`Verwarnungsstufe erreicht: automatisch **${CASE_LABELS[e.type]}** (Fall #${e.caseNumber}).`);
  }
  return lines.join("\n");
}
