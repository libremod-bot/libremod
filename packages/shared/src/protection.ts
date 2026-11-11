/**
 * Schutz-Funktionen: Verifizierung neuer Mitglieder und Kanal-Sperren (Lockdown).
 */

// --- Verifizierung ---

export const VERIFY_COLOR = 0x3ba55d;
export const VERIFY_START_ID = "lmvf:start";
export const VERIFY_CODE_ID = "lmvf:code";
export const VERIFY_ANSWER_ID = "lmvf:answer";
export const MAX_VERIFY_ANSWERS = 10;
export const VERIFY_MODES = [
  { value: "button", label: "Nur Knopf", description: "Ein Klick genügt. Hält einfache Bots auf, die nur Nachrichten schicken." },
  { value: "code", label: "Code abtippen", description: "Ein zufälliger Code muss in ein Formular abgetippt werden." },
  { value: "question", label: "Eigene Frage", description: "Eine Frage aus euren Regeln, z. B. nach einem Wort, das nur dort steht." },
] as const;

/** Ohne leicht verwechselbare Zeichen wie 0/O oder 1/I. */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 6, random = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return out;
}

/** Code-Eingaben: Leerzeichen und Groß-/Kleinschreibung egal. */
export function codeMatches(input: string, code: string): boolean {
  return input.replace(/\s+/g, "").toUpperCase() === code.toUpperCase();
}

const normalizeAnswer = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'„“”.!?]+|[\s"'„“”.!?]+$/g, "");

export function answerMatches(input: string, answers: string[]): boolean {
  const a = normalizeAnswer(input);
  return a.length > 0 && answers.some((x) => normalizeAnswer(x) === a);
}

/** Antworten aus dem Dashboard: eine pro Zeile oder mit | getrennt. */
export function parseAnswers(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n|]/)) {
    const a = raw.trim().slice(0, 100);
    if (!a || seen.has(normalizeAnswer(a))) continue;
    seen.add(normalizeAnswer(a));
    out.push(a);
  }
  return out.slice(0, MAX_VERIFY_ANSWERS);
}

/** Gibt zurück, ab wann ein Konto alt genug ist, oder null, wenn es schon passt. */
export function accountOldEnoughAt(createdAt: Date, minDays: number, now = new Date()): Date | null {
  if (minDays <= 0) return null;
  const ok = new Date(createdAt.getTime() + minDays * 86_400_000);
  return ok > now ? ok : null;
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Nachricht für POST/PATCH /channels/{id}/messages. */
export function buildVerificationMessage(s: { title: string; description: string; mode: string }) {
  const fallback =
    s.mode === "question"
      ? "Damit wir wissen, dass du die Regeln gelesen hast: Klicke unten und beantworte eine kurze Frage. Danach siehst du den ganzen Server."
      : s.mode === "code"
        ? "Klicke unten und tippe den angezeigten Code ab. Danach siehst du den ganzen Server."
        : "Klicke unten, um zu bestätigen, dass du ein Mensch bist. Danach siehst du den ganzen Server.";
  return {
    embeds: [{ title: clip(s.title || "Willkommen!", 256), description: clip(s.description.trim() || fallback, 4000), color: VERIFY_COLOR }],
    components: [{ type: 1, components: [{ type: 2, style: 3, custom_id: VERIFY_START_ID, label: "Verifizieren", emoji: { name: "✅" } }] }],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** Zählt Fehlversuche. Nach `max` Fehlern innerhalb von `windowMs` ist eine Pause fällig. */
export class AttemptLimiter {
  private fails = new Map<string, number[]>();
  constructor(
    private max = 3,
    private windowMs = 10 * 60_000,
  ) {}

  /** Millisekunden bis zum nächsten erlaubten Versuch, 0 = jetzt erlaubt. */
  waitMs(key: string, now = Date.now()): number {
    const recent = (this.fails.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.fails.set(key, recent);
    if (recent.length < this.max) return 0;
    return this.windowMs - (now - recent[recent.length - this.max]!);
  }

  fail(key: string, now = Date.now()) {
    const list = this.fails.get(key) ?? [];
    list.push(now);
    this.fails.set(key, list.slice(-this.max));
    if (this.fails.size > 10_000) this.fails.delete(this.fails.keys().next().value!);
  }

  reset(key: string) {
    this.fails.delete(key);
  }
}

// --- Lockdown ---

/** Rechte, die eine Sperre für @everyone wegnimmt (Namen wie in discord.js PermissionFlagsBits). */
export const LOCK_PERMISSIONS = {
  SendMessages: 1n << 11n,
  SendMessagesInThreads: 1n << 38n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  AddReactions: 1n << 6n,
} as const;

export type LockPermission = keyof typeof LOCK_PERMISSIONS;
export type LockState = "allow" | "deny" | "neutral";

/** Merkt sich, wie die gesperrten Rechte vorher in der @everyone-Überschreibung standen. */
export function snapshotOverwrite(allow: bigint, deny: bigint): Record<LockPermission, LockState> {
  const out = {} as Record<LockPermission, LockState>;
  for (const [name, bit] of Object.entries(LOCK_PERMISSIONS) as [LockPermission, bigint][]) {
    out[name] = allow & bit ? "allow" : deny & bit ? "deny" : "neutral";
  }
  return out;
}

/** Werte für permissionOverwrites.edit: false = verbieten. */
export function lockOptions(): Record<LockPermission, false> {
  return Object.fromEntries(Object.keys(LOCK_PERMISSIONS).map((k) => [k, false])) as Record<LockPermission, false>;
}

/** Werte für permissionOverwrites.edit, die den alten Zustand wiederherstellen (null = neutral). */
export function restoreOptions(previous: Record<string, LockState>): Record<LockPermission, boolean | null> {
  const out = {} as Record<LockPermission, boolean | null>;
  for (const name of Object.keys(LOCK_PERMISSIONS) as LockPermission[]) {
    const s = previous[name] ?? "neutral";
    out[name] = s === "allow" ? true : s === "deny" ? false : null;
  }
  return out;
}

export const MAX_LOCK_SECONDS = 30 * 24 * 60 * 60;
