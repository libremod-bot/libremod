import type { GuildMember } from "discord.js";

/**
 * Prüft, ob moderator gegen target vorgehen darf, und gibt sonst einen
 * verständlichen Grund zurück. Gilt zusätzlich für den Bot selbst.
 */
export function moderationBlocker(moderator: GuildMember, target: GuildMember): string | null {
  const guild = target.guild;
  const me = guild.members.me;

  if (target.id === moderator.id) return "Du kannst nicht gegen dich selbst vorgehen.";
  if (target.id === guild.ownerId) return "Gegen den Server-Inhaber kann niemand vorgehen.";
  if (me && target.id === me.id) return "Gegen mich selbst kann ich nichts unternehmen.";

  if (moderator.id !== guild.ownerId && target.roles.highest.comparePositionTo(moderator.roles.highest) >= 0) {
    return "Dieses Mitglied hat eine gleich hohe oder höhere Rolle als du.";
  }
  if (me && target.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
    return "Dieses Mitglied hat eine gleich hohe oder höhere Rolle als ich. Verschiebe meine Rolle in den Server-Einstellungen weiter nach oben.";
  }
  return null;
}
