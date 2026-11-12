/** Event-Planer: Termine mit Zu- und Absagen, Warteliste und Erinnerung. Zeiten gelten in deutscher Zeit. */

import { parseDuration } from "./duration.js";
import { berlinParts, berlinToDate } from "./schedule.js";
import { t } from "./i18n.js";

export const EVENT_COLOR = 0x4f9dff;
export const EVENT_DONE_COLOR = 0x80848e;
export const EVENT_CANCELLED_COLOR = 0xed4245;
export const MAX_EVENT_TITLE = 100;
export const MAX_EVENT_DESCRIPTION = 2000;
export const MAX_EVENT_LOCATION = 200;
export const MAX_ACTIVE_EVENTS = 25;
export const MAX_EVENT_SLOTS = 1000;
/** Termine höchstens ein Jahr im Voraus. */
export const MAX_EVENT_AHEAD_MS = 366 * 24 * 60 * 60_000;
/** Ohne Angabe gilt ein Event nach 2 Stunden als vorbei. */
export const DEFAULT_EVENT_MINUTES = 120;
export const MAX_EVENT_MINUTES = 14 * 24 * 60;

export const EVENT_REMINDERS = [
  { value: 0, label: "Keine Erinnerung" },
  { value: 15, label: "15 Minuten vorher" },
  { value: 30, label: "30 Minuten vorher" },
  { value: 60, label: "1 Stunde vorher" },
  { value: 180, label: "3 Stunden vorher" },
  { value: 1440, label: "1 Tag vorher" },
] as const;

export type RsvpChoice = "yes" | "maybe" | "no";
export type RsvpStatus = RsvpChoice | "waitlist";

const CHOICES: RsvpChoice[] = ["yes", "maybe", "no"];

export const eventCustomId = (id: number, choice: RsvpChoice) => `lmev:${id}:${choice}`;

export function parseEventCustomId(customId: string): { id: number; choice: RsvpChoice } | null {
  const m = /^lmev:(\d{1,9}):(yes|maybe|no)$/.exec(customId);
  return m ? { id: Number(m[1]), choice: m[2] as RsvpChoice } : null;
}

const WORD_DAYS: Record<string, number> = { heute: 0, morgen: 1, übermorgen: 2, uebermorgen: 2 };

/**
 * Liest einen Startzeitpunkt in deutscher Zeit:
 * „24.12.2026 18:00“, „24.12. 18:00“, „2026-12-24 18:00“, „morgen 19:30“, „heute 20 Uhr“ oder „in 2h“.
 * Ohne Jahr gilt der nächste passende Tag. Gibt null zurück, wenn nichts verstanden wird.
 */
export function parseEventStart(input: string, now = new Date()): Date | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/ uhr$/, "").replace(/,/g, "");
  if (!s) return null;

  const rel = /^in (.+)$/.exec(s);
  if (rel) {
    const secs = parseDuration(rel[1]!.replace(/ ?(minuten?|min)$/, "m").replace(/ ?(stunden?|std)$/, "h").replace(/ ?(tagen?|tage)$/, "d"));
    return secs ? new Date(now.getTime() + secs * 1000) : null;
  }

  const time = /(?:^| )(?:um )?([01]?\d|2[0-3])(?::|\.|h)?([0-5]\d)?(?: uhr)?$/.exec(s);
  if (!time) return null;
  const hour = Number(time[1]);
  const minute = Number(time[2] ?? 0);
  const datePart = s.slice(0, time.index).trim();
  const today = berlinParts(now);

  let year: number;
  let month: number;
  let day: number;
  let explicitYear = true;
  if (datePart in WORD_DAYS) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + WORD_DAYS[datePart]!));
    [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  } else {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
    const de = /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/.exec(datePart);
    if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else if (de) {
      day = Number(de[1]);
      month = Number(de[2]);
      explicitYear = !!de[3];
      year = de[3] ? Number(de[3].length === 2 ? `20${de[3]}` : de[3]) : today.year;
    } else return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 31.02. o. Ä. ablehnen statt in den nächsten Monat zu rutschen
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let at = berlinToDate(year, month, day, hour, minute);
  if (!explicitYear && at.getTime() < now.getTime() - 60_000) at = berlinToDate(year + 1, month, day, hour, minute);
  return at;
}

/** Prüft Start und Dauer. Gibt eine Fehlermeldung oder null zurück. */
export function validateEventTime(startsAt: Date, minutes: number, now = new Date()): string | null {
  if (Number.isNaN(startsAt.getTime())) return t("Der Startzeitpunkt wurde nicht verstanden.");
  if (startsAt.getTime() < now.getTime() + 60_000) return t("Das Event muss in der Zukunft liegen.");
  if (startsAt.getTime() > now.getTime() + MAX_EVENT_AHEAD_MS) return t("Events können höchstens ein Jahr im Voraus geplant werden.");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > MAX_EVENT_MINUTES) return t("Die Dauer muss zwischen 5 Minuten und 14 Tagen liegen.");
  return null;
}

/**
 * Welchen Status bekommt jemand, der `choice` drückt? Volle Events führen Zusagen auf die Warteliste.
 * `yesCount` zählt die Zusagen ohne die Person selbst.
 */
export function rsvpStatus(choice: RsvpChoice, yesCount: number, slots: number): RsvpStatus {
  if (choice !== "yes") return choice;
  return slots > 0 && yesCount >= slots ? "waitlist" : "yes";
}

export interface EventView {
  id: number;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  slots: number;
  hostId: string;
  roleId: string | null;
  remindMinutes: number;
  state: "open" | "done" | "cancelled";
}

export interface EventRsvps {
  yes: string[];
  maybe: string[];
  no: string[];
  waitlist: string[];
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/** Namensliste für ein Feld: höchstens so viele Erwähnungen, wie in 1024 Zeichen passen. */
export function mentionList(ids: string[], max = 1024): string {
  if (!ids.length) return "–";
  const out: string[] = [];
  let len = 0;
  for (const [i, id] of ids.entries()) {
    const m = `<@${id}>`;
    const rest = ids.length - i;
    if (len + m.length + 2 + 24 > max) {
      out.push(t("… und {rest} weitere", { rest }));
      break;
    }
    out.push(m);
    len += m.length + 2;
  }
  return out.join(", ");
}

/** Event-Nachricht für POST/PATCH /channels/{id}/messages und für discord.js. */
export function buildEventMessage(e: EventView, r: EventRsvps) {
  const lines: string[] = [];
  if (e.description.trim()) lines.push(e.description.trim(), "");
  if (e.state === "cancelled") lines.push(t("❌ **Abgesagt**"));
  else if (e.state === "done") lines.push(t("✅ Vorbei seit <t:{endsAt}:R>", { endsAt: unix(e.endsAt) }));
  lines.push(`🕒 <t:${unix(e.startsAt)}:F> (<t:${unix(e.startsAt)}:R>)`);
  lines.push(t("⏳ bis <t:{endsAt}:t>", { endsAt: unix(e.endsAt) }));
  if (e.location.trim()) lines.push(`📍 ${clip(e.location.trim(), MAX_EVENT_LOCATION)}`);
  if (e.roleId) lines.push(t("Zusagen bekommen die Rolle <@&{roleId}>.", { roleId: e.roleId }));
  if (e.state === "open" && e.remindMinutes > 0) lines.push(t("Wer zusagt, bekommt vorher eine Erinnerung per Direktnachricht."));
  lines.push(t("Geplant von <@{hostId}>", { hostId: e.hostId }));

  const yesLabel = e.slots > 0 ? t("✅ Zusagen ({length}/{slots})", { length: r.yes.length, slots: e.slots }) : t("✅ Zusagen ({length})", { length: r.yes.length });
  const fields = [
    { name: yesLabel, value: mentionList(r.yes), inline: true },
    { name: t("🤔 Vielleicht ({length})", { length: r.maybe.length }), value: mentionList(r.maybe), inline: true },
    { name: t("❌ Absagen ({length})", { length: r.no.length }), value: mentionList(r.no), inline: true },
  ];
  if (r.waitlist.length) fields.push({ name: t("⏸️ Warteliste ({length})", { length: r.waitlist.length }), value: mentionList(r.waitlist), inline: false });

  const open = e.state === "open";
  const button = (choice: RsvpChoice, label: string, emoji: string, style: number) => ({
    type: 2,
    style,
    custom_id: eventCustomId(e.id, choice),
    label,
    emoji: { name: emoji },
    disabled: !open,
  });
  return {
    embeds: [
      {
        title: `📅 ${clip(e.title, 240)}`,
        description: clip(lines.join("\n"), 4000),
        color: e.state === "cancelled" ? EVENT_CANCELLED_COLOR : e.state === "done" ? EVENT_DONE_COLOR : EVENT_COLOR,
        fields,
        footer: { text: t("Event #{id}", { id: e.id }) },
        timestamp: e.startsAt.toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [button("yes", "Dabei", "✅", 3), button("maybe", "Vielleicht", "🤔", 2), button("no", t("Nicht dabei"), "❌", 2)],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** Text der Erinnerung per Direktnachricht. */
export function eventReminderText(e: Pick<EventView, "title" | "startsAt" | "location">, guildName: string, link: string | null): string {
  const lines = [t("⏰ Gleich geht's los: **{n0}** auf **{n1}** <t:{startsAt}:R>.", { n0: clip(e.title, 200), n1: clip(guildName, 100), startsAt: unix(e.startsAt) })];
  if (e.location.trim()) lines.push(`📍 ${clip(e.location.trim(), MAX_EVENT_LOCATION)}`);
  if (link) lines.push(link);
  return lines.join("\n");
}

export const RSVP_REPLY: Record<RsvpStatus, string> = {
  yes: "Du bist dabei. ✅",
  maybe: "Du bist als „vielleicht“ eingetragen.",
  no: "Du hast abgesagt.",
  waitlist: "Das Event ist voll. Du stehst auf der Warteliste und rückst automatisch nach, wenn ein Platz frei wird.",
};

export const isRsvpChoice = (v: string): v is RsvpChoice => (CHOICES as string[]).includes(v);
