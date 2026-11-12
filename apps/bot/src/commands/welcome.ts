import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type MessageCreateOptions,
} from "discord.js";
import { eq, welcomeSettings } from "@libremod/db";
import type { Command } from "./types.js";
import { fullWelcomePayload, welcomePayload } from "../services/welcome.js";
import { inGuild, replyPrivate } from "./moderation/shared.js";
import { t } from "@libremod/shared";

/** Zeigt die eingestellte Begrüßung zur Probe, nur für die aufrufende Person sichtbar. */
export const welcome: Command = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Begrüßung testen. Einstellen kannst du sie im Dashboard.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription(
          t(
            "Zeigt dir die Willkommens- und Abschiedsnachricht mit dir als Beispiel.",
          ),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction) || !interaction.guild) return;
    const [s] = await db
      .select()
      .from(welcomeSettings)
      .where(eq(welcomeSettings.guildId, interaction.guildId));
    if (!s)
      return void (await replyPrivate(
        interaction,
        t(
          "Noch keine Begrüßung eingestellt. Das geht im Dashboard unter „Begrüßung“.",
        ),
      ));
    const status = [
      t("Willkommensnachricht: {n0}", { n0: s.welcomeEnabled && s.welcomeChannelId ? t("an, in <#{id}>", { id: s.welcomeChannelId }) : t("aus") }),
      t("Direktnachricht: {n0}", { n0: s.dmEnabled ? t("an") : t("aus") }),
      t("Abschied: {n0}", { n0: s.goodbyeEnabled && s.goodbyeChannelId ? t("an, in <#{id}>", { id: s.goodbyeChannelId }) : t("aus") }),
    ].join("\n");
    const welcomeMsg = await fullWelcomePayload(
      s,
      interaction.user,
      interaction.guild,
      interaction.member.displayName,
    );
    const goodbyeMsg = welcomePayload(
      s.goodbyeMessage,
      s.goodbyeEmbed,
      interaction.user,
      interaction.guild,
      0xf59e42,
      s.goodbyeDesign,
    );
    await replyPrivate(
      interaction,
      t("{status}\n\n**So sieht die Begrüßung aus:**", { status }),
    );
    const preview = (m: MessageCreateOptions) =>
      interaction.followUp({
        content: m.content,
        embeds: m.embeds,
        files: m.files,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    await preview(welcomeMsg);
    await preview({ content: t("**So sieht der Abschied aus:**") });
    await preview(goodbyeMsg);
  },
};
