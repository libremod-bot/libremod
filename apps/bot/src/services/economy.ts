import type { GuildMember, Message } from "discord.js";
import {
  and,
  economyLog,
  economySettings,
  eq,
  memberBalances,
  purchases,
  shopItems,
  sql,
  type Db,
  type EconomySettings,
  type ShopItem,
} from "@libremod/db";
import {
  dailyReward,
  MAX_BALANCE,
  randomBetween,
  workReady,
} from "@libremod/shared";
import { logger } from "../logger.js";
import { addTempRole } from "./community2.js";
import { t } from "@libremod/shared";

const CACHE_TTL_MS = 60_000;
const cache = new Map<
  string,
  { settings: EconomySettings | null; loadedAt: number }
>();
const lastChat = new Map<string, number>();

export function invalidateEconomy(guildId: string) {
  cache.delete(guildId);
}

export async function loadEconomy(db: Db, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.settings;
  const [s] = await db
    .select()
    .from(economySettings)
    .where(eq(economySettings.guildId, guildId));
  cache.set(guildId, { settings: s ?? null, loadedAt: Date.now() });
  return s ?? null;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function getAccount(
  db: Db | Tx,
  guildId: string,
  userId: string,
  startBalance = 0,
) {
  await db
    .insert(memberBalances)
    .values({ guildId, userId, balance: startBalance })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(memberBalances)
    .where(
      and(
        eq(memberBalances.guildId, guildId),
        eq(memberBalances.userId, userId),
      ),
    );
  return row!;
}

/** Bucht einen Betrag (auch negativ). Das Guthaben bleibt zwischen 0 und dem Maximum. */
export async function addBalance(
  db: Db | Tx,
  guildId: string,
  userId: string,
  amount: number,
  reason: string | null,
  startBalance = 0,
) {
  await getAccount(db, guildId, userId, startBalance);
  const [row] = await db
    .update(memberBalances)
    .set({
      balance: sql`least(greatest(${memberBalances.balance} + ${amount}, 0), ${MAX_BALANCE})`,
      earned:
        amount > 0
          ? sql`least(${memberBalances.earned} + ${amount}, ${MAX_BALANCE})`
          : memberBalances.earned,
    })
    .where(
      and(
        eq(memberBalances.guildId, guildId),
        eq(memberBalances.userId, userId),
      ),
    )
    .returning();
  if (reason && amount !== 0)
    await db
      .insert(economyLog)
      .values({ guildId, userId, amount, reason: reason.slice(0, 100) });
  return row!.balance;
}

/** Zieht einen Betrag nur ab, wenn genug da ist. Gibt das neue Guthaben zurück oder null. */
async function spend(
  db: Db | Tx,
  guildId: string,
  userId: string,
  amount: number,
  reason: string,
  startBalance: number,
) {
  await getAccount(db, guildId, userId, startBalance);
  const [row] = await db
    .update(memberBalances)
    .set({ balance: sql`${memberBalances.balance} - ${amount}` })
    .where(
      and(
        eq(memberBalances.guildId, guildId),
        eq(memberBalances.userId, userId),
        sql`${memberBalances.balance} >= ${amount}`,
      ),
    )
    .returning();
  if (!row) return null;
  await db
    .insert(economyLog)
    .values({ guildId, userId, amount: -amount, reason: reason.slice(0, 100) });
  return row.balance;
}

export async function claimDaily(
  db: Db,
  s: EconomySettings,
  userId: string,
  now = new Date(),
) {
  const acc = await getAccount(db, s.guildId, userId, s.startBalance);
  const r = dailyReward(s, acc, now);
  if (!r.ok) return r;
  // Nur buchen, wenn seit dem Lesen niemand anders abgeholt hat.
  const claimed = await db
    .update(memberBalances)
    .set({ lastDailyAt: now, dailyStreak: r.streak })
    .where(
      and(
        eq(memberBalances.guildId, s.guildId),
        eq(memberBalances.userId, userId),
        acc.lastDailyAt
          ? eq(memberBalances.lastDailyAt, acc.lastDailyAt)
          : sql`${memberBalances.lastDailyAt} is null`,
      ),
    )
    .returning();
  if (!claimed.length)
    return { ok: false as const, nextAt: new Date(now.getTime() + 60_000) };
  const balance = await addBalance(
    db,
    s.guildId,
    userId,
    r.amount,
    t("Täglicher Bonus"),
  );
  return { ...r, balance };
}

export async function doWork(
  db: Db,
  s: EconomySettings,
  userId: string,
  now = new Date(),
) {
  const acc = await getAccount(db, s.guildId, userId, s.startBalance);
  const ready = workReady(acc.lastWorkAt, s.workCooldownMinutes, now);
  if (!ready.ok) return ready;
  const claimed = await db
    .update(memberBalances)
    .set({ lastWorkAt: now })
    .where(
      and(
        eq(memberBalances.guildId, s.guildId),
        eq(memberBalances.userId, userId),
        acc.lastWorkAt
          ? eq(memberBalances.lastWorkAt, acc.lastWorkAt)
          : sql`${memberBalances.lastWorkAt} is null`,
      ),
    )
    .returning();
  if (!claimed.length)
    return {
      ok: false as const,
      nextAt: new Date(now.getTime() + s.workCooldownMinutes * 60_000),
    };
  const amount = randomBetween(s.workMin, s.workMax);
  const balance = await addBalance(db, s.guildId, userId, amount, "Arbeit");
  return { ok: true as const, amount, balance };
}

export async function pay(
  db: Db,
  s: EconomySettings,
  fromId: string,
  toId: string,
  amount: number,
) {
  return db.transaction(async (tx) => {
    const left = await spend(
      tx,
      s.guildId,
      fromId,
      amount,
      t("Überweisung an {toId}", { toId }),
      s.startBalance,
    );
    if (left === null) return null;
    await addBalance(
      tx,
      s.guildId,
      toId,
      amount,
      t("Überweisung von {fromId}", { fromId }),
      s.startBalance,
    );
    return left;
  });
}

class NotEnoughMoney extends Error {}

export type BuyResult =
  | { ok: true; item: ShopItem; balance: number; roleGiven: boolean }
  | {
      ok: false;
      reason: "missing" | "soldout" | "money" | "owned" | "role";
      item?: ShopItem;
    };

/** Kauf: Geld abziehen, Bestand verringern, Rolle geben. Klappt die Rolle nicht, gibt es das Geld zurück. */
export async function buyItem(
  db: Db,
  s: EconomySettings,
  member: GuildMember,
  itemId: number,
): Promise<BuyResult> {
  const [item] = await db
    .select()
    .from(shopItems)
    .where(
      and(
        eq(shopItems.id, itemId),
        eq(shopItems.guildId, s.guildId),
        eq(shopItems.enabled, true),
      ),
    );
  if (!item) return { ok: false, reason: "missing" };
  if (item.roleId) {
    const role = member.guild.roles.cache.get(item.roleId);
    const me = member.guild.members.me;
    if (
      !role ||
      role.managed ||
      !me ||
      role.position >= me.roles.highest.position
    )
      return { ok: false, reason: "role", item };
    // Rollen auf Zeit dürfen nachgekauft werden, das verlängert sie.
    if (member.roles.cache.has(item.roleId) && !item.roleDays)
      return { ok: false, reason: "owned", item };
  }

  const result = await db
    .transaction(async (tx) => {
      if (item.stock !== null) {
        const [left] = await tx
          .update(shopItems)
          .set({ stock: sql`${shopItems.stock} - 1` })
          .where(and(eq(shopItems.id, item.id), sql`${shopItems.stock} > 0`))
          .returning();
        if (!left) return "soldout" as const;
      }
      const balance = await spend(
        tx,
        s.guildId,
        member.id,
        item.price,
        t("Kauf: {name}", { name: item.name }),
        s.startBalance,
      );
      if (balance === null) throw new NotEnoughMoney();
      const [p] = await tx
        .insert(purchases)
        .values({
          guildId: s.guildId,
          userId: member.id,
          itemId: item.id,
          itemName: item.name,
          price: item.price,
        })
        .returning({ id: purchases.id });
      return { balance, purchaseId: p!.id };
    })
    .catch((err) => {
      // Bestand und Abbuchung werden dabei zusammen zurückgerollt.
      if (err instanceof NotEnoughMoney) return "money" as const;
      throw err;
    });
  if (result === "soldout") return { ok: false, reason: "soldout", item };
  if (result === "money") return { ok: false, reason: "money", item };

  if (item.roleId) {
    try {
      if (item.roleDays)
        await addTempRole(
          member,
          db,
          item.roleId,
          item.roleDays * 86_400,
          null,
          t("Shop: {name}", { name: item.name }).slice(0, 100),
        );
      else
        await member.roles.add(
          item.roleId,
          t("Libremod: im Shop gekauft ({name})", { name: item.name }),
        );
    } catch (err) {
      logger.warn(
        { err, guildId: s.guildId, item: item.id },
        "Shop: Rolle konnte nicht vergeben werden, Geld zurück",
      );
      await addBalance(
        db,
        s.guildId,
        member.id,
        item.price,
        t("Erstattung: {name}", { name: item.name }),
      );
      if (item.stock !== null)
        await db
          .update(shopItems)
          .set({ stock: sql`${shopItems.stock} + 1` })
          .where(eq(shopItems.id, item.id));
      await db.delete(purchases).where(eq(purchases.id, result.purchaseId));
      return { ok: false, reason: "role", item };
    }
  }
  return { ok: true, item, balance: result.balance, roleGiven: !!item.roleId };
}

/** Kleine Belohnung fürs Schreiben, höchstens einmal pro Minute. */
export async function handleMessageCoins(message: Message, db: Db) {
  if (!message.inGuild() || message.author.bot || message.system) return;
  const s = await loadEconomy(db, message.guildId);
  if (!s?.enabled || s.chatReward <= 0) return;
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastChat.get(key) ?? 0) < 60_000) return;
  lastChat.set(key, now);
  if (lastChat.size > 50_000) lastChat.clear();
  await addBalance(
    db,
    message.guildId,
    message.author.id,
    s.chatReward,
    null,
    s.startBalance,
  );
}
