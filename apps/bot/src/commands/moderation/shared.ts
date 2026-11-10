import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type User } from "discord.js";
import { moderationBlocker } from "../../lib/permissions.js";

export type GuildInteraction = ChatInputCommandInteraction<"cached">;

/** Antwortet nur für den Ausführenden sichtbar. */
export async function replyPrivate(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } } as const;
  if (interaction.deferred || interaction.replied) await interaction.editReply(content);
  else await interaction.reply(payload);
}

/** Stellt sicher, dass der Befehl auf einem Server läuft, auf dem der Bot geladen ist. */
export function inGuild(interaction: ChatInputCommandInteraction): interaction is GuildInteraction {
  if (interaction.inCachedGuild()) return true;
  void replyPrivate(interaction, "Dieser Befehl funktioniert nur auf einem Server.");
  return false;
}

/**
 * Lädt das Zielmitglied und prüft Rollen-Hierarchie. Antwortet selbst mit einer Fehlermeldung
 * und gibt dann undefined zurück. Ist die Person nicht auf dem Server, kommt null zurück.
 */
export async function resolveTarget(
  interaction: GuildInteraction,
  user: User,
  { mustBeMember }: { mustBeMember: boolean },
): Promise<GuildMember | null | undefined> {
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    if (mustBeMember) {
      await replyPrivate(interaction, "Diese Person ist nicht auf dem Server.");
      return undefined;
    }
    return null;
  }
  const blocker = moderationBlocker(interaction.member, member);
  if (blocker) {
    await replyPrivate(interaction, blocker);
    return undefined;
  }
  return member;
}

export const REASON_MAX = 500;
