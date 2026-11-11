import "server-only";
import { env } from "./env";

const API = "https://discord.com/api/v10";

/** Berechtigungen, die zum Verwalten eines Servers im Dashboard reichen. */
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

/** Rechte, die der Bot beim Einladen bekommt (siehe README). */
export const BOT_PERMISSIONS = "564444887510102";

export interface PartialGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface GuildChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id: string | null;
}

export interface GuildRole {
  id: string;
  name: string;
  position: number;
  color: number;
  managed: boolean;
}

export const CHANNEL_TEXT = 0;
export const CHANNEL_CATEGORY = 4;
export const CHANNEL_ANNOUNCEMENT = 5;
export const CHANNEL_VOICE = 2;

// Kleiner Zwischenspeicher, damit wir Discords Rate-Limits nicht reißen.
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearCache(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

async function discord<T>(path: string, auth: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: auth, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new DiscordError(res.status, `${init?.method ?? "GET"} ${path}: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class DiscordError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- OAuth2 ---

export function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.clientId,
    response_type: "code",
    redirect_uri: `${env.dashboardUrl}/api/auth/callback`,
    scope: "identify guilds",
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${env.dashboardUrl}/api/auth/callback`,
    }),
  });
  if (!res.ok) throw new DiscordError(res.status, "Token-Austausch fehlgeschlagen");
  return (await res.json()) as { access_token: string; expires_in: number };
}

export function getCurrentUser(accessToken: string) {
  return discord<{ id: string; username: string; global_name: string | null; avatar: string | null }>(
    "/users/@me",
    `Bearer ${accessToken}`,
  );
}

/** Server, die der Nutzer verwalten darf (Inhaber, Administrator oder „Server verwalten“). */
export function getManageableGuilds(userId: string, accessToken: string) {
  return cached(`user-guilds:${userId}`, 60_000, async () => {
    const guilds = await discord<PartialGuild[]>("/users/@me/guilds", `Bearer ${accessToken}`);
    return guilds.filter((g) => {
      const perms = BigInt(g.permissions);
      return g.owner || (perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n;
    });
  });
}

// --- Bot-Anfragen ---

const bot = () => `Bot ${env.botToken}`;

/** Prüft, ob der Bot auf dem Server ist. */
export function botIsInGuild(guildId: string) {
  return cached(`bot-guild:${guildId}`, 60_000, async () => {
    try {
      await discord(`/guilds/${guildId}`, bot());
      return true;
    } catch (err) {
      if (err instanceof DiscordError && (err.status === 403 || err.status === 404)) return false;
      throw err;
    }
  });
}

export function getGuildChannels(guildId: string) {
  return cached(`channels:${guildId}`, 30_000, async () => {
    const channels = await discord<GuildChannel[]>(`/guilds/${guildId}/channels`, bot());
    return channels.sort((a, b) => a.position - b.position);
  });
}

function getAllRoles(guildId: string) {
  return cached(`roles:${guildId}`, 30_000, () => discord<GuildRole[]>(`/guilds/${guildId}/roles`, bot()));
}

/** Rollen ohne @everyone und ohne Rollen, die von Integrationen verwaltet werden, höchste zuerst. */
export async function getGuildRoles(guildId: string) {
  const roles = await getAllRoles(guildId);
  return roles.filter((r) => r.id !== guildId && !r.managed).sort((a, b) => b.position - a.position);
}

/** Position der höchsten Rolle des Bots. Nur Rollen darunter kann er vergeben. */
export function getBotTopPosition(guildId: string) {
  return cached(`bot-top:${guildId}`, 30_000, async () => {
    const [member, roles] = await Promise.all([
      discord<{ roles: string[] }>(`/guilds/${guildId}/members/${env.clientId}`, bot()),
      getAllRoles(guildId),
    ]);
    const mine = new Set(member.roles);
    return Math.max(0, ...roles.filter((r) => mine.has(r.id)).map((r) => r.position));
  });
}

export interface MemberInfo {
  id: string;
  name: string;
  avatar: string;
}

/** Namen und Avatare für eine Liste von Nutzer-IDs (z. B. Rangliste). Unbekannte bekommen ihre ID als Namen. */
export async function getMembers(guildId: string, ids: string[]): Promise<MemberInfo[]> {
  return Promise.all(
    ids.map((id) =>
      cached(`member:${guildId}:${id}`, 5 * 60_000, async () => {
        try {
          const m = await discord<{ nick: string | null; user: { id: string; username: string; global_name: string | null; avatar: string | null } }>(
            `/guilds/${guildId}/members/${id}`,
            bot(),
          );
          return { id, name: m.nick ?? m.user.global_name ?? m.user.username, avatar: avatarUrl(m.user) };
        } catch {
          return { id, name: id, avatar: avatarUrl({ id, avatar: null }) };
        }
      }),
    ),
  );
}

/** Zahlen für Zähler-Kanäle. */
export async function getGuildCounts(guildId: string) {
  const [g, channels, roles] = await Promise.all([
    discord<{ approximate_member_count?: number; premium_subscription_count?: number }>(`/guilds/${guildId}?with_counts=true`, bot()),
    getGuildChannels(guildId),
    getAllRoles(guildId),
  ]);
  return {
    members: g.approximate_member_count ?? 0,
    boosts: g.premium_subscription_count ?? 0,
    channels: channels.length,
    roles: Math.max(0, roles.length - 1),
  };
}

// --- Kanäle anlegen und löschen (Zähler, temporäre Sprachkanäle) ---

export async function createGuildChannel(guildId: string, body: Record<string, unknown>) {
  const channel = await discord<{ id: string; name: string }>(`/guilds/${guildId}/channels`, bot(), jsonInit("POST", body));
  clearCache(`channels:${guildId}`);
  return channel;
}

export async function deleteGuildChannel(guildId: string, channelId: string) {
  try {
    await discord(`/channels/${channelId}`, bot(), { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof DiscordError && err.status === 404)) throw err;
  }
  clearCache(`channels:${guildId}`);
}

// --- Nachrichten des Bots (Rollen-Panels) ---

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function sendBotMessage(channelId: string, body: unknown) {
  return discord<{ id: string }>(`/channels/${channelId}/messages`, bot(), jsonInit("POST", body));
}

export function editBotMessage(channelId: string, messageId: string, body: unknown) {
  return discord<{ id: string }>(`/channels/${channelId}/messages/${messageId}`, bot(), jsonInit("PATCH", body));
}

export async function deleteBotMessage(channelId: string, messageId: string) {
  try {
    await discord(`/channels/${channelId}/messages/${messageId}`, bot(), { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof DiscordError && err.status === 404)) throw err; // schon weg ist auch gut
  }
}

export function inviteUrl(guildId?: string) {
  const params = new URLSearchParams({
    client_id: env.clientId,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSIONS,
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params}`;
}

export function guildIconUrl(g: { id: string; icon: string | null }) {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null;
}

export function avatarUrl(u: { id: string; avatar: string | null }) {
  return u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
}
