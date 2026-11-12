import { counterChannels, eq, tempVoiceHubs } from "@libremod/db";
import { COUNTER_PLACEHOLDERS } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_CATEGORY, getGuildChannels, type GuildChannel } from "@/lib/discord";
import { createCounter, createTempHub, deleteCounter, deleteTempHub, updateTempHub } from "../actions";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Sprachkanäle & Zähler") }) };
}

function CategorySelect({ categories }: { categories: GuildChannel[] }) {
  return (
    <select id="parentId" name="parentId" defaultValue="">
      <option value="">{t("Ohne Kategorie")}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          ▸ {c.name}
        </option>
      ))}
    </select>
  );
}

export default async function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "channels");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [hubs, counters, channels] = await Promise.all([
    db.select().from(tempVoiceHubs).where(eq(tempVoiceHubs.guildId, guildId)),
    db.select().from(counterChannels).where(eq(counterChannels.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const categories = channels.filter((c) => c.type === CHANNEL_CATEGORY);
  const channel = (id: string) => channels.find((c) => c.id === id);
  const parentName = (id: string) => {
    const p = channel(id)?.parent_id;
    return p ? channel(p)?.name : undefined;
  };

  return (
    <>
      <PageHeader
        icon="mic"
        title={t("Sprachkanäle & Zähler")}
        description={t("Sprachkanäle, die sich bei Bedarf selbst erstellen und wieder löschen, und Kanäle, die Zahlen deines Servers anzeigen.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <section className="card">
        <div className="card-title">
          <Icon name="mic" />
          <h2>{t("Temporäre Sprachkanäle")}</h2>
        </div>
        <p className="card-sub">
          {t("Wer den Kanal „Beitreten zum Erstellen“ betritt, bekommt sofort einen eigenen Sprachkanal und kann ihn umbenennen oder begrenzen. Ist er leer, löscht Libremod ihn wieder.")}</p>
        {hubs.map((h) => (
          <div className="subcard" key={h.channelId}>
            <div className="filter-head" style={{ alignItems: "center" }}>
              <strong style={{ flex: 1 }}>
                🔊 {channel(h.channelId)?.name ?? t("gelöschter Kanal")}
                {parentName(h.channelId) && <span className="small muted"> {" "}{t("· in")}{" "}{parentName(h.channelId)}</span>}
              </strong>
              <form action={deleteTempHub.bind(null, guildId, h.channelId)}>
                <button className="danger small" type="submit">
                  <Icon name="trash" size={15} /> {" "}{t("Entfernen")}</button>
              </form>
            </div>
            <form action={updateTempHub.bind(null, guildId, h.channelId)} className="inline-form" style={{ marginTop: "0.75rem", alignItems: "end" }}>
              <div style={{ flex: "2 1 220px" }}>
                <label htmlFor={`tpl-${h.channelId}`}>{t("Name neuer Kanäle")}</label>
                <input id={`tpl-${h.channelId}`} name="nameTemplate" type="text" maxLength={100} defaultValue={h.nameTemplate} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label htmlFor={`lim-${h.channelId}`}>{t("Max. Personen")}</label>
                <input id={`lim-${h.channelId}`} name="userLimit" type="number" min={0} max={99} defaultValue={h.userLimit} />
              </div>
              <button type="submit" className="secondary">
                {t("Speichern")}</button>
            </form>
          </div>
        ))}
        <form action={createTempHub.bind(null, guildId)} style={{ marginTop: hubs.length ? "1.25rem" : 0 }}>
          <div className="grid-3">
            <div>
              <label htmlFor="hubName">{t("Name des Kanals")}</label>
              <input id="hubName" name="hubName" type="text" maxLength={100} defaultValue={t("➕ Kanal erstellen")} required />
            </div>
            <div>
              <label htmlFor="parentId">{t("Kategorie")}</label>
              <CategorySelect categories={categories} />
            </div>
            <div>
              <label htmlFor="nameTemplate">{t("Name neuer Kanäle")}</label>
              <input id="nameTemplate" name="nameTemplate" type="text" maxLength={100} defaultValue={t("Kanal von {username}")} />
            </div>
            <div>
              <label htmlFor="userLimit">{t("Max. Personen (0 = egal)")}</label>
              <input id="userLimit" name="userLimit" type="number" min={0} max={99} defaultValue={0} />
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> {" "}{t("Kanal „Beitreten zum Erstellen“ anlegen")}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="hash" />
          <h2>{t("Zähler-Kanäle")}</h2>
        </div>
        <p className="card-sub">
          {t("Ein gesperrter Sprachkanal, dessen Name eine Zahl zeigt, z. B. „👥 Mitglieder: 1.234“. Discord erlaubt nur wenige Umbenennungen, daher aktualisiert Libremod alle 10 Minuten.")}</p>
        {counters.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("Kanal")}</th>
                  <th>{t("Vorlage")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {counters.map((c) => (
                  <tr key={c.channelId}>
                    <td>
                      <strong>{channel(c.channelId)?.name ?? t("gelöschter Kanal")}</strong>
                    </td>
                    <td className="mono small">{c.template}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteCounter.bind(null, guildId, c.channelId)}>
                        <button className="danger small" type="submit">
                          {t("Entfernen")}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={createCounter.bind(null, guildId)}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="template">{t("Name mit Platzhalter")}</label>
              <input id="template" name="template" type="text" required maxLength={90} defaultValue={t("👥 Mitglieder: {members}")} />
            </div>
            <div className="field">
              <label htmlFor="counterParent">{t("Kategorie")}</label>
              <select id="counterParent" name="parentId" defaultValue="">
                <option value="">{t("Ohne Kategorie")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    ▸ {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="chips" style={{ marginTop: "0.75rem" }}>
            {COUNTER_PLACEHOLDERS.map((p) => (
              <span key={p.key} className="chip">
                <code>{p.key}</code> {t(p.description)}
              </span>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> {" "}{t("Zähler anlegen")}</button>
          </div>
        </form>
      </section>
    </>
  );
}
