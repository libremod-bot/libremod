import { countingChannels, eq, wordChainChannels } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { addCountingChannel, deleteCountingChannel, resetCountingChannel, updateCountingChannel } from "../actions";
import { t, numFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Zähl-Kanal") }) };
}

const nf = numFmt();

function Options({ c }: { c?: { allowSameUser: boolean; resetOnFail: boolean; onlyNumbers: boolean } }) {
  return (
    <div className="checks">
      <label className="check-inline">
        <input type="checkbox" name="resetOnFail" defaultChecked={c?.resetOnFail ?? true} /> {" "}{t("Bei Fehlern wieder bei 1 anfangen")}</label>
      <label className="check-inline">
        <input type="checkbox" name="onlyNumbers" defaultChecked={c?.onlyNumbers ?? true} /> {" "}{t("Nachrichten ohne Zahl löschen")}</label>
      <label className="check-inline">
        <input type="checkbox" name="allowSameUser" defaultChecked={c?.allowSameUser ?? false} /> {" "}{t("Dieselbe Person darf zweimal hintereinander")}</label>
    </div>
  );
}

export default async function CountingPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "counting");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [rows, chains, channels] = await Promise.all([
    db.select().from(countingChannels).where(eq(countingChannels.guildId, guildId)),
    db.select({ id: wordChainChannels.channelId }).from(wordChainChannels).where(eq(wordChainChannels.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const taken = new Set([...rows.map((r) => r.channelId), ...chains.map((c) => c.id)]);
  const textChannels = channels.filter((c) => (c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT) && !taken.has(c.id));
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? t("gelöschter Kanal");

  return (
    <>
      <PageHeader
        icon="hash"
        title={t("Zähl-Kanal")}
        description={t("Gemeinsam hochzählen: Jede Nachricht ist die nächste Zahl. Wer sich verzählt oder zweimal hintereinander schreibt, bringt alle zurück auf 1.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      {rows.map((c) => (
        <section className="card" key={c.channelId}>
          <div className="card-title">
            <Icon name="hash" />
            <h2>#{channelName(c.channelId)}</h2>
          </div>
          <div className="stats" style={{ marginBottom: "1rem" }}>
            <div className="stat">
              <div className="stat-label">{t("Aktuell")}</div>
              <div className="stat-value">{nf.format(c.current)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t("Rekord")}</div>
              <div className="stat-value">{nf.format(c.record)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t("Verzählt")}</div>
              <div className="stat-value">{nf.format(c.fails)}</div>
            </div>
          </div>
          <form action={updateCountingChannel.bind(null, guildId, c.channelId)}>
            <Options c={c} />
            <div className="inline-form" style={{ marginTop: "1rem" }}>
              <button type="submit" className="secondary small">
                {t("Speichern")}</button>
            </div>
          </form>
          <div className="inline-form" style={{ marginTop: ".5rem" }}>
            <form action={resetCountingChannel.bind(null, guildId, c.channelId)}>
              <button type="submit" className="secondary small">
                {t("Auf 0 zurücksetzen")}</button>
            </form>
            <form action={deleteCountingChannel.bind(null, guildId, c.channelId)}>
              <button type="submit" className="danger small">
                <Icon name="trash" size={15} /> {" "}{t("Kein Zähl-Kanal mehr")}</button>
            </form>
          </div>
        </section>
      ))}

      {rows.length < 5 && (
        <form action={addCountingChannel.bind(null, guildId)} className="card">
          <div className="card-title">
            <Icon name="plus" />
            <h2>{rows.length ? t("Weiteren Zähl-Kanal einrichten") : t("Zähl-Kanal einrichten")}</h2>
          </div>
          <label htmlFor="channelId">{t("Kanal")}</label>
          <select id="channelId" name="channelId" required defaultValue="">
            <option value="" disabled>
              {t("Kanal wählen …")}</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <div style={{ marginTop: "1rem" }}>
            <Options />
          </div>
          <div className="hint">
            {t("Am besten ein eigener Kanal nur fürs Zählen. Libremod braucht dort „Nachrichten verwalten“ und „Reaktionen hinzufügen“. Zahlen wie „1.000“ werden erkannt, Text hinter der Zahl ist erlaubt.")}</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">
              <Icon name="plus" size={16} /> {" "}{t("Einrichten")}</button>
          </div>
        </form>
      )}
    </>
  );
}
