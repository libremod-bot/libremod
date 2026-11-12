import {
  MessageFlags,
  roleMention,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { and, eq, rolePanels, type Db } from "@libremod/db";
import { panelRoleChanges, parsePanelCustomId } from "@libremod/shared";
import { logger } from "../logger.js";
import { t } from "@libremod/shared";

/** Prüft, ob eine Komponente zu einem Rollen-Panel gehört. */
export function isPanelInteraction(customId: string) {
  return parsePanelCustomId(customId) !== null;
}

/** Button-Klick oder Menüauswahl in einem Rollen-Panel. */
export async function handlePanelInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  db: Db,
) {
  const parsed = parsePanelCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [panel] = await db
    .select()
    .from(rolePanels)
    .where(
      and(
        eq(rolePanels.id, parsed.panelId),
        eq(rolePanels.guildId, interaction.guildId),
      ),
    );
  if (!panel)
    return void (await interaction.editReply(
      t("Dieses Rollen-Panel gibt es nicht mehr."),
    ));

  const member = interaction.member;
  const action = interaction.isButton()
    ? { clicked: parsed.roleId ?? "" }
    : { selected: interaction.values };
  const { add, remove } = panelRoleChanges(
    panel.roleIds,
    member.roles.cache.keys(),
    action,
    panel.single,
  );
  if (!add.length && !remove.length)
    return void (await interaction.editReply(t("Keine Änderung.")));

  // Nur Rollen anfassen, die es noch gibt und die der Bot vergeben darf.
  const me = interaction.guild.members.me;
  const allowed = (id: string) => {
    const role = interaction.guild.roles.cache.get(id);
    return (
      !!role &&
      !role.managed &&
      !!me &&
      role.position < me.roles.highest.position
    );
  };
  const blocked = [...add, ...remove].filter((id) => !allowed(id));
  if (blocked.length) {
    return void (await interaction.editReply(
      t(
        "Ich kann {n0} nicht vergeben. Ein Admin muss meine Rolle in den Servereinstellungen über diese Rolle schieben.",
        { n0: blocked.map(roleMention).join(", ") },
      ),
    ));
  }

  try {
    if (remove.length)
      await member.roles.remove(remove, t("Libremod: Rollen-Panel"));
    if (add.length) await member.roles.add(add, t("Libremod: Rollen-Panel"));
  } catch (err) {
    logger.warn(
      { err, guildId: interaction.guildId, panel: panel.id },
      "Rollen-Panel: Rollen konnten nicht geändert werden",
    );
    return void (await interaction.editReply(
      t(
        "Das hat nicht geklappt. Mir fehlt vermutlich das Recht „Rollen verwalten“.",
      ),
    ));
  }

  const lines = [
    add.length
      ? t("Hinzugefügt: {n0}", { n0: add.map(roleMention).join(", ") })
      : "",
    remove.length
      ? t("Entfernt: {n0}", { n0: remove.map(roleMention).join(", ") })
      : "",
  ].filter(Boolean);
  await interaction.editReply({
    content: lines.join("\n"),
    allowedMentions: { parse: [] },
  });
}
