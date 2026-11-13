import { SaveBar } from "@/components/SaveBar";
import Link from "next/link";
import { asc, desc, economyLog, economySettings, eq, memberBalances, shopItems } from "@libremod/db";
import { formatMoney, MAX_SHOP_ITEMS } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getBotTopPosition, getGuildRoles, getMembers } from "@/lib/discord";
import { createShopItem, deleteShopItem, saveEconomy, toggleShopItem } from "../actions";
import { ItemFields } from "./ItemFields";
import { t, dateFmt, numFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Währung & Shop") }) };
}

const when = dateFmt({ dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export default async function EconomyPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "economy");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [[s], items, top, log, roles, botTop] = await Promise.all([
    db.select().from(economySettings).where(eq(economySettings.guildId, guildId)),
    db.select().from(shopItems).where(eq(shopItems.guildId, guildId)).orderBy(asc(shopItems.price)),
    db.select().from(memberBalances).where(eq(memberBalances.guildId, guildId)).orderBy(desc(memberBalances.balance)).limit(15),
    db.select().from(economyLog).where(eq(economyLog.guildId, guildId)).orderBy(desc(economyLog.createdAt)).limit(20),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  const people = await getMembers(guildId, [...new Set([...top.map((tItem) => tItem.userId), ...log.map((l) => l.userId)])]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const symbol = s?.currencySymbol ?? "🪙";
  const money = (n: number) => formatMoney(n, /^\d+$/.test(symbol) ? "" : symbol);
  const customSymbol = /^\d+$/.test(symbol);

  return (
    <>
      <PageHeader
        icon="coin"
        title={t("Währung & Shop")}
        description={t("Eine eigene Währung für deinen Server: täglicher Bonus, Arbeiten, Überweisungen und ein Shop mit Rollen oder eigenen Artikeln.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveEconomy.bind(null, guildId)} className="stack">
        <div className="card">
          <Switch
            name="enabled"
            defaultChecked={s?.enabled ?? false}
            label={t("Server-Währung")}
            description={t("Hauptschalter. Befehle: /balance, /daily, /work, /pay, /shop, /buy, /inventory, /richlist und für das Team /coins.")}
          />
        </div>

        <section className="card">
          <div className="card-title">
            <Icon name="coin" />
            <h2>{t("Währung")}</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="currencyName">{t("Name")}</label>
              <input id="currencyName" name="currencyName" type="text" maxLength={32} defaultValue={s?.currencyName ?? "Münzen"} />
            </div>
            <div>
              <label htmlFor="currencySymbol">{t("Symbol")}</label>
              <input id="currencySymbol" name="currencySymbol" type="text" maxLength={80} defaultValue={customSymbol ? `<:c:${symbol}>` : symbol} />
            </div>
            <div>
              <label htmlFor="startBalance">{t("Startguthaben")}</label>
              <input id="startBalance" name="startBalance" type="number" min={0} max={1_000_000} defaultValue={s?.startBalance ?? 0} />
            </div>
          </div>
          <div className="hint">{t("Als Symbol geht ein Emoji, ein Server-Emoji wie bei den Highlights oder ein kurzes Zeichen wie €.")}</div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="steps" />
            <h2>{t("Verdienen")}</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="dailyAmount">{t("Täglicher Bonus")}</label>
              <input id="dailyAmount" name="dailyAmount" type="number" min={0} max={1_000_000} defaultValue={s?.dailyAmount ?? 100} />
            </div>
            <div>
              <label htmlFor="dailyStreakBonus">{t("Extra pro Tag in Folge")}</label>
              <input id="dailyStreakBonus" name="dailyStreakBonus" type="number" min={0} max={100_000} defaultValue={s?.dailyStreakBonus ?? 10} />
            </div>
            <div>
              <label htmlFor="chatReward">{t("Pro Nachricht (max. 1×/Min.)")}</label>
              <input id="chatReward" name="chatReward" type="number" min={0} max={1000} defaultValue={s?.chatReward ?? 0} />
            </div>
            <div>
              <label htmlFor="workMin">{t("/work mindestens")}</label>
              <input id="workMin" name="workMin" type="number" min={0} max={1_000_000} defaultValue={s?.workMin ?? 20} />
            </div>
            <div>
              <label htmlFor="workMax">{t("/work höchstens")}</label>
              <input id="workMax" name="workMax" type="number" min={0} max={1_000_000} defaultValue={s?.workMax ?? 60} />
            </div>
            <div>
              <label htmlFor="workCooldownMinutes">{t("/work Pause in Minuten")}</label>
              <input id="workCooldownMinutes" name="workCooldownMinutes" type="number" min={5} max={1440} defaultValue={s?.workCooldownMinutes ?? 60} />
            </div>
          </div>
          <div className="hint">
            {t("Den Bonus gibt es alle 20 Stunden. Wer ihn mehrere Tage in Folge abholt, bekommt bis zu 7 Tage lang einen Zuschlag. 0 bei „Pro Nachricht“ schaltet das aus.")}</div>
        </section>

        <SaveBar>
          <label className="check-inline" style={{ padding: 0 }}>
            <input type="checkbox" name="allowPay" defaultChecked={s?.allowPay ?? true} />
            {t("Überweisungen zwischen Mitgliedern erlauben")}</label>
        </SaveBar>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="tag" />
          <h2>{t("Shop")}</h2>
        </div>
        {items.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("Artikel")}</th>
                  <th>{t("Preis")}</th>
                  <th>{t("Bestand")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} style={i.enabled ? undefined : { opacity: 0.6 }}>
                    <td>
                      <strong>{i.name}</strong>
                      {i.roleId && <span className="badge info" style={{ marginLeft: 6 }}>@{roles.find((r) => r.id === i.roleId)?.name ?? t("gelöschte Rolle")}</span>}
                      {!i.enabled && <span className="badge" style={{ marginLeft: 6 }}>{t("versteckt")}</span>}
                      {i.description && <div className="small muted">{i.description}</div>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{money(i.price)}</td>
                    <td>{i.stock === null ? "∞" : i.stock}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link href={`/servers/${guildId}/economy/items/${i.id}`} className="button secondary small">
                        <Icon name="edit" size={15} /> {" "}{t("Bearbeiten")}</Link>{" "}
                      <form action={toggleShopItem.bind(null, guildId, i.id)} style={{ display: "inline" }}>
                        <button className="secondary small" type="submit">
                          {i.enabled ? "Verstecken" : "Anzeigen"}
                        </button>
                      </form>{" "}
                      <form action={deleteShopItem.bind(null, guildId, i.id)} style={{ display: "inline" }}>
                        <button className="danger small" type="submit" aria-label={t("{name} löschen", { name: i.name })}>
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty" style={{ paddingTop: 0 }}>
            {t("Noch keine Artikel. Wie wäre es mit einer Rolle in Wunschfarbe oder einem Platz im nächsten Event?")}</p>
        )}
        {items.length < MAX_SHOP_ITEMS && (
          <form action={createShopItem.bind(null, guildId)}>
            <h3 style={{ margin: "0 0 .75rem" }}>{t("Neuer Artikel")}</h3>
            <ItemFields roles={roles} botTop={botTop} />
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> {" "}{t("Artikel hinzufügen")}</button>
          </form>
        )}
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="card-title">
            <Icon name="list" />
            <h2>{t("Reichste Mitglieder")}</h2>
          </div>
          {top.length === 0 ? (
            <p className="empty">{t("Noch hat niemand ein Konto.")}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {top.map((tItem, i) => (
                    <tr key={tItem.userId}>
                      <td className="muted">{i + 1}</td>
                      <td>{name(tItem.userId)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{money(tItem.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-title">
            <Icon name="log" />
            <h2>{t("Letzte Buchungen")}</h2>
          </div>
          {log.length === 0 ? (
            <p className="empty">{t("Noch keine Buchungen.")}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                        {when.format(l.createdAt)}
                      </td>
                      <td>
                        {name(l.userId)}
                        <div className="small muted">{l.reason.replace(/\d{17,20}/g, (id) => name(id))}</div>
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", color: l.amount < 0 ? "var(--danger, #e5534b)" : "var(--success, #2f9e6a)" }}>
                        {l.amount > 0 ? "+" : ""}
                        {numFmt().format(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
