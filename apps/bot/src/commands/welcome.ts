import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type MessageCreateOptions } from "discord.js";
import { eq, welcomeSettings } from "@libremod/db";
import type { Command } from "./types.js";
import { fullWelcomePayload, welcomePayload } from "../services/welcome.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";

/** Zeigt die eingestellte Begrüßung zur Probe, nur für die aufrufende Person sichtbar. */
export const welcome: Command = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Begrüßung testen. Einstellen kannst du sie im Dashboard.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("test").setDescription("Zeigt dir die Willkommens- und Abschiedsnachricht mit dir als Beispiel.")),
  async execute(interaction, { db }) {
    if (!inGuild(interaction) || !interaction.guild) return;
    const [s] = await db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, interaction.guildId));
    if (!s) return void (await replyPrivate(interaction, "Noch keine Begrüßung eingestellt. Das geht im Dashboard unter „Begrüßung“."));
    const status = [
      `Willkommensnachricht: ${s.welcomeEnabled && s.welcomeChannelId ? `an, in <#${s.welcomeChannelId}>` : "aus"}`,
      `Direktnachricht: ${s.dmEnabled ? "an" : "aus"}`,
      `Abschied: ${s.goodbyeEnabled && s.goodbyeChannelId ? `an, in <#${s.goodbyeChannelId}>` : "aus"}`,
    ].join("\n");
    const welcomeMsg = await fullWelcomePayload(s, interaction.user, interaction.guild, interaction.member.displayName);
    const goodbyeMsg = welcomePayload(s.goodbyeMessage, s.goodbyeEmbed, interaction.user, interaction.guild, 0xf59e42, s.goodbyeDesign);
    await replyPrivate(interaction, `${status}\n\n**So sieht die Begrüßung aus:**`);
    const preview = (m: MessageCreateOptions) =>
      interaction.followUp({ content: m.content, embeds: m.embeds, files: m.files, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    await preview(welcomeMsg);
    await preview({ content: "**So sieht der Abschied aus:**" });
    await preview(goodbyeMsg);
  },
};
