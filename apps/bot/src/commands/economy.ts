import {
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  userMention,
} from "discord.js";
import {
  and,
  asc,
  desc,
  eq,
  memberBalances,
  purchases,
  shopItems,
  type EconomySettings,
} from "@libremod/db";
import { formatMoney, MAX_BALANCE, workText } from "@libremod/shared";
import type { Command } from "./types.js";
import {
  inGuild,
  replyPrivate,
  type GuildInteraction,
} from "./moderation/shared.js";
import {
  addBalance,
  buyItem,
  claimDaily,
  doWork,
  getAccount,
  loadEconomy,
  pay,
} from "../services/economy.js";
import { t } from "@libremod/shared";

const COLOR = 0xffc83d;
const nf = new Intl.NumberFormat("de-DE");

/** Lädt die Einstellungen und antwortet selbst, wenn die Währung aus ist. */
async function economyOn(
  interaction: GuildInteraction,
  db: Parameters<Command["execute"]>[1]["db"],
): Promise<EconomySettings | null> {
  const s = await loadEconomy(db, interaction.guildId);
  if (!s?.enabled) {
    await replyPrivate(
      interaction,
      t("Die Server-Währung ist auf diesem Server ausgeschaltet."),
    );
    return null;
  }
  return s;
}

const money = (s: EconomySettings, n: number) =>
  formatMoney(n, s.currencySymbol);

export const balance: Command = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Zeigt das Guthaben.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("mitglied").setDescription(t("Wessen Guthaben? Leer = deins")),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const user = interaction.options.getUser("mitglied") ?? interaction.user;
    if (user.bot)
      return void (await replyPrivate(
        interaction,
        t("Bots haben kein Konto."),
      ));
    const acc = await getAccount(
      db,
      interaction.guildId,
      user.id,
      s.startBalance,
    );
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({
        name: user.globalName ?? user.username,
        iconURL: user.displayAvatarURL({ size: 64 }),
      })
      .setDescription(`**${money(s, acc.balance)}** ${s.currencyName}`)
      .addFields(
        {
          name: t("Insgesamt verdient"),
          value: money(s, acc.earned),
          inline: true,
        },
        {
          name: t("Tägliche Serie"),
          value: acc.dailyStreak
            ? `${acc.dailyStreak} ${acc.dailyStreak === 1 ? "Tag" : "Tage"}`
            : "–",
          inline: true,
        },
      );
    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export const daily: Command = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Holt den täglichen Bonus ab.")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const r = await claimDaily(db, s, interaction.user.id);
    if (!r.ok)
      return void (await replyPrivate(
        interaction,
        t("Den nächsten Bonus gibt es {n0}.", {
          n0: time(r.nextAt, TimestampStyles.RelativeTime),
        }),
      ));
    const streak =
      r.streak > 1
        ? t("\n🔥 {streak} Tage in Folge!", { streak: r.streak })
        : "";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setDescription(
            t("Du bekommst **{n0}** {currencyName}.{streak}\nGuthaben: {n3}", {
              n0: money(s, r.amount),
              currencyName: s.currencyName,
              streak,
              n3: money(s, r.balance),
            }),
          ),
      ],
    });
  },
};

export const work: Command = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Arbeiten und etwas verdienen.")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const r = await doWork(db, s, interaction.user.id);
    if (!r.ok)
      return void (await replyPrivate(
        interaction,
        t("Du bist noch erschöpft. Wieder arbeiten kannst du {n0}.", {
          n0: time(r.nextAt, TimestampStyles.RelativeTime),
        }),
      ));
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setDescription(
            t("{n0}\nGuthaben: {n1}", {
              n0: workText(`**${money(s, r.amount)}**`),
              n1: money(s, r.balance),
            }),
          ),
      ],
    });
  },
};

export const payCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Jemandem etwas überweisen.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("mitglied").setDescription(t("An wen")).setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("betrag")
        .setDescription(t("Wie viel"))
        .setMinValue(1)
        .setMaxValue(MAX_BALANCE)
        .setRequired(true),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    if (!s.allowPay)
      return void (await replyPrivate(
        interaction,
        t("Überweisungen sind auf diesem Server ausgeschaltet."),
      ));
    const to = interaction.options.getUser("mitglied", true);
    const amount = interaction.options.getInteger("betrag", true);
    if (to.bot || to.id === interaction.user.id)
      return void (await replyPrivate(interaction, t("Das geht nicht.")));
    const left = await pay(db, s, interaction.user.id, to.id, amount);
    if (left === null)
      return void (await replyPrivate(
        interaction,
        t("Dafür reicht dein Guthaben nicht."),
      ));
    await interaction.reply({
      content: t("💸 {n0} hat {id} **{n2}** überwiesen.", {
        n0: interaction.user.toString(),
        id: userMention(to.id),
        n2: money(s, amount),
      }),
      allowedMentions: { users: [to.id] },
    });
  },
};

export const shop: Command = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Zeigt, was es im Shop gibt.")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const items = await db
      .select()
      .from(shopItems)
      .where(
        and(
          eq(shopItems.guildId, interaction.guildId),
          eq(shopItems.enabled, true),
        ),
      )
      .orderBy(asc(shopItems.price));
    if (!items.length)
      return void (await replyPrivate(
        interaction,
        t("Der Shop ist noch leer."),
      ));
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(t("Shop von {name}", { name: interaction.guild.name }))
      .setDescription(t("Kaufen mit `/buy`."))
      .addFields(
        items.slice(0, 25).map((i) => ({
          name: `${i.name} · ${money(s, i.price)}`,
          value:
            [
              i.description,
              i.roleId
                ? t("Rolle: <@&{id}>{n1}", { id: i.roleId, n1: i.roleDays ? (i.roleDays === 1 ? t(" für 1 Tag") : t(" für {n} Tage", { n: i.roleDays })) : "" })
                : "",
              i.stock !== null
                ? i.stock > 0
                  ? t("Noch {n} übrig", { n: i.stock })
                  : t("Ausverkauft")
                : "",
            ]
              .filter(Boolean)
              .join("\n") || "​",
        })),
      );
    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export const buy: Command = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Etwas im Shop kaufen.")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("artikel")
        .setDescription("Was")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async autocomplete(interaction, { db }) {
    if (!interaction.guildId) return;
    const q = interaction.options.getFocused().toLowerCase();
    const items = await db
      .select()
      .from(shopItems)
      .where(
        and(
          eq(shopItems.guildId, interaction.guildId),
          eq(shopItems.enabled, true),
        ),
      )
      .orderBy(asc(shopItems.price));
    await interaction.respond(
      items
        .filter((i) => i.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((i) => ({
          name: `${i.name} (${nf.format(i.price)})`.slice(0, 100),
          value: String(i.id),
        })),
    );
  },
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const raw = interaction.options.getString("artikel", true);
    let id = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isNaN(id)) {
      // Name eingetippt statt aus der Liste gewählt
      const [hit] = await db
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(
          and(
            eq(shopItems.guildId, interaction.guildId),
            eq(shopItems.name, raw),
          ),
        );
      id = hit?.id ?? -1;
    }
    const r = await buyItem(db, s, interaction.member, id);
    if (!r.ok) {
      const msg = {
        missing: t("Diesen Artikel gibt es nicht. Schau mit `/shop` nach."),
        soldout: t("Dieser Artikel ist ausverkauft."),
        money: t("Dafür reicht dein Guthaben nicht ({n0}).", {
          n0: money(s, r.item?.price ?? 0),
        }),
        owned: t("Diese Rolle hast du schon."),
        role: t(
          "Die Rolle kann ich gerade nicht vergeben. Bitte sag dem Team Bescheid, dein Guthaben bleibt unverändert.",
        ),
      }[r.reason];
      return void (await replyPrivate(interaction, msg));
    }
    const lines = [
      t("🛍️ Du hast **{name}** für {n1} gekauft.", {
        name: r.item.name,
        n1: money(s, r.item.price),
      }),
      r.roleGiven
        ? r.item.roleDays
          ? t(
              "Du hast die Rolle <@&{roleId}> für {roleDays} {n2}. Ein erneuter Kauf verlängert sie.",
              {
                roleId: r.item.roleId,
                roleDays: r.item.roleDays,
                n2: r.item.roleDays === 1 ? "Tag" : "Tage",
              },
            )
          : t("Du hast jetzt die Rolle <@&{roleId}>.", {
              roleId: r.item.roleId,
            })
        : "",
      r.item.replyMessage,
      t("Guthaben: {n0}", { n0: money(s, r.balance) }),
    ].filter(Boolean);
    await interaction.reply({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
  },
};

export const inventory: Command = {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("Zeigt gekaufte Artikel.")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) =>
      o.setName("mitglied").setDescription(t("Wessen? Leer = deins")),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const user = interaction.options.getUser("mitglied") ?? interaction.user;
    const rows = await db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.guildId, interaction.guildId),
          eq(purchases.userId, user.id),
        ),
      )
      .orderBy(desc(purchases.createdAt))
      .limit(20);
    if (!rows.length)
      return void (await replyPrivate(
        interaction,
        user.id === interaction.user.id
          ? t("Du hast noch nichts gekauft.")
          : t("Noch nichts gekauft."),
      ));
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({
        name: user.globalName ?? user.username,
        iconURL: user.displayAvatarURL({ size: 64 }),
      })
      .setTitle(t("Gekaufte Artikel"))
      .setDescription(
        rows
          .map(
            (p) =>
              `• **${p.itemName}** · ${money(s, p.price)} · ${time(p.createdAt, TimestampStyles.ShortDate)}`,
          )
          .join("\n"),
      );
    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export const richlist: Command = {
  data: new SlashCommandBuilder()
    .setName("richlist")
    .setDescription("Wer hat am meisten?")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o
        .setName("seite")
        .setDescription(t("Seite (10 pro Seite)"))
        .setMinValue(1)
        .setMaxValue(1000),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const page = interaction.options.getInteger("seite") ?? 1;
    const rows = await db
      .select()
      .from(memberBalances)
      .where(eq(memberBalances.guildId, interaction.guildId))
      .orderBy(desc(memberBalances.balance))
      .limit(10)
      .offset((page - 1) * 10);
    if (!rows.length)
      return void (await replyPrivate(
        interaction,
        page === 1
          ? t("Noch hat niemand ein Konto.")
          : t("Diese Seite ist leer."),
      ));
    const medal = ["🥇", "🥈", "🥉"];
    const lines = rows.map((r, i) => {
      const pos = (page - 1) * 10 + i + 1;
      return `${medal[pos - 1] ?? `**${pos}.**`} ${userMention(r.userId)} · ${money(s, r.balance)}`;
    });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(
            t("Die Reichsten auf {name}", { name: interaction.guild.name }),
          )
          .setDescription(lines.join("\n"))
          .setFooter({ text: t("Seite {page}", { page }) }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export const coins: Command = {
  data: new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Guthaben von Mitgliedern verwalten.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription(t("Guthaben hinzufügen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("betrag")
            .setDescription(t("Wie viel"))
            .setMinValue(1)
            .setMaxValue(MAX_BALANCE)
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription(t("Guthaben abziehen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("betrag")
            .setDescription(t("Wie viel"))
            .setMinValue(1)
            .setMaxValue(MAX_BALANCE)
            .setRequired(true),
        ),
    )
    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription(t("Guthaben auf einen Wert setzen."))
        .addUserOption((o) =>
          o.setName("mitglied").setDescription("Wer").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("betrag")
            .setDescription(t("Neuer Stand"))
            .setMinValue(0)
            .setMaxValue(MAX_BALANCE)
            .setRequired(true),
        ),
    ),
  async execute(interaction, { db }) {
    if (!inGuild(interaction)) return;
    const s = await economyOn(interaction, db);
    if (!s) return;
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("mitglied", true);
    if (user.bot)
      return void (await replyPrivate(
        interaction,
        t("Bots haben kein Konto."),
      ));
    const amount = interaction.options.getInteger("betrag", true);
    const reason = t("Von {username} ({sub})", {
      username: interaction.user.username,
      sub,
    });
    let value: number;
    if (sub === "set") {
      const acc = await getAccount(
        db,
        interaction.guildId,
        user.id,
        s.startBalance,
      );
      value = await addBalance(
        db,
        interaction.guildId,
        user.id,
        amount - acc.balance,
        reason,
      );
    } else {
      value = await addBalance(
        db,
        interaction.guildId,
        user.id,
        sub === "add" ? amount : -amount,
        reason,
        s.startBalance,
      );
    }
    await replyPrivate(
      interaction,
      t("{id} hat jetzt {n1}.", {
        id: userMention(user.id),
        n1: money(s, value),
      }),
    );
  },
};
