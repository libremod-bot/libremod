import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Client,
  type VoiceState,
} from "discord.js";
import {
  eq,
  tempVoiceChannels,
  tempVoiceHubs,
  type Db,
  type TempVoiceHub,
} from "@libremod/db";
import { renderTemplate } from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";

const hubCache = new Map<
  string,
  { hubs: Map<string, TempVoiceHub>; loadedAt: number }
>();
const owned = new Set<string>(); // IDs temporärer Kanäle
const lastCreated = new Map<string, number>();
const CREATE_COOLDOWN_MS = 10_000;

export function invalidateTempVoice(guildId: string) {
  hubCache.delete(guildId);
}

async function hubs(db: Db, guildId: string) {
  const hit = hubCache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < 60_000) return hit.hubs;
  const rows = await db
    .select()
    .from(tempVoiceHubs)
    .where(eq(tempVoiceHubs.guildId, guildId));
  const map = new Map(rows.map((r) => [r.channelId, r]));
  hubCache.set(guildId, { hubs: map, loadedAt: Date.now() });
  return map;
}

/** Beim Start: bekannte temporäre Kanäle laden und leere aufräumen. */
export async function loadTempChannels(client: Client, db: Db) {
  const rows = await db.select().from(tempVoiceChannels);
  for (const row of rows) {
    const channel = client.channels.cache.get(row.channelId);
    if (!channel || (channel.isVoiceBased() && channel.members.size === 0)) {
      if (channel)
        await channel.delete("Libremod: temporärer Kanal leer").catch(() => {});
      await db
        .delete(tempVoiceChannels)
        .where(eq(tempVoiceChannels.channelId, row.channelId));
    } else {
      owned.add(row.channelId);
    }
  }
}

export async function onTempVoiceState(
  before: VoiceState,
  after: VoiceState,
  db: Db,
) {
  if (before.channelId === after.channelId) return;

  // Verlassen: leeren temporären Kanal löschen
  if (
    before.channelId &&
    owned.has(before.channelId) &&
    before.channel &&
    before.channel.members.size === 0
  ) {
    owned.delete(before.channelId);
    await before.channel
      .delete("Libremod: temporärer Kanal leer")
      .catch(() => {});
    await db
      .delete(tempVoiceChannels)
      .where(eq(tempVoiceChannels.channelId, before.channelId));
  }

  // Beitritt zu einem „Beitreten zum Erstellen“-Kanal
  const member = after.member;
  if (!after.channelId || !after.channel || !member || member.user.bot) return;
  const hub = (await hubs(db, after.guild.id)).get(after.channelId);
  if (!hub) return;

  const key = `${after.guild.id}:${member.id}`;
  if ((lastCreated.get(key) ?? 0) > Date.now() - CREATE_COOLDOWN_MS) return;
  lastCreated.set(key, Date.now());

  const name = renderTemplate(hub.nameTemplate, {
    user: member.displayName,
    username: member.displayName,
    server: after.guild.name,
    membercount: after.guild.memberCount,
  }).slice(0, 100);
  try {
    const parent = after.channel.parent;
    const channel = await after.guild.channels.create({
      name: name || t("Sprachkanal"),
      type: ChannelType.GuildVoice,
      parent: parent ?? undefined,
      userLimit: hub.userLimit || undefined,
      permissionOverwrites: [
        ...(parent?.permissionOverwrites.cache.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow,
          deny: o.deny,
        })) ?? []),
        {
          id: member.id,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
          ],
        },
      ],
      reason: t("Libremod: temporärer Kanal für {tag}", {
        tag: member.user.tag,
      }),
    });
    owned.add(channel.id);
    await db
      .insert(tempVoiceChannels)
      .values({
        channelId: channel.id,
        guildId: after.guild.id,
        ownerId: member.id,
      });
    await member.voice.setChannel(channel).catch(async () => {
      // Person ist schon wieder weg: Kanal gleich entfernen
      owned.delete(channel.id);
      await channel.delete().catch(() => {});
      await db
        .delete(tempVoiceChannels)
        .where(eq(tempVoiceChannels.channelId, channel.id));
    });
  } catch (err) {
    logger.warn(
      { err, guildId: after.guild.id },
      "Temporärer Sprachkanal konnte nicht erstellt werden",
    );
  }
}

export const isTempChannel = (id: string) => owned.has(id);
