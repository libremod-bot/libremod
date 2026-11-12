import { eq, welcomeSettings } from "@libremod/db";
import { PLACEHOLDERS } from "@libremod/shared";
import { EmbedEditor } from "@/components/EmbedEditor";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, type GuildChannel } from "@/lib/discord";
import { saveWelcome } from "../actions";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Begrüßung") }) };
}

const DEFAULTS = {
  welcomeMessage: "Willkommen auf **{server}**, {user}! Du bist Mitglied Nummer {membercount}.",
  dmMessage: "Hallo {username}, schön, dass du auf **{server}** bist!",
  goodbyeMessage: "**{username}** hat den Server verlassen.",
};

function ChannelSelect({ id, value, channels }: { id: string; value: string | null | undefined; channels: GuildChannel[] }) {
  return (
    <select id={id} name={id} defaultValue={value ?? ""}>
      <option value="">{t("Kanal wählen …")}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
    </select>
  );
}

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "welcome");
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [[s], channels] = await Promise.all([
    db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);

  return (
    <>
      <PageHeader
        icon="wave"
        title={t("Begrüßung")}
        description={t("Neue Mitglieder willkommen heißen und Abschiede ankündigen. Mit /welcome test siehst du in Discord, wie es aussieht.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <div className="card placeholders">
        <div className="card-title">
          <Icon name="words" />
          <h2>{t("Platzhalter")}</h2>
        </div>
        <p className="card-sub">{t("Diese Platzhalter kannst du in allen Texten verwenden. Libremod ersetzt sie automatisch.")}</p>
        <div className="chips">
          {PLACEHOLDERS.map((p) => (
            <span key={p.key} className="chip" title={t(p.description)}>
              <code>{p.key}</code> {t(p.description)}
            </span>
          ))}
        </div>
      </div>

      <form action={saveWelcome.bind(null, guildId)} className="stack">
        <section className="card">
          <div className="filter-head">
            <div className="module-icon">
              <Icon name="wave" />
            </div>
            <div style={{ flex: 1 }}>
              <Switch
                name="welcomeEnabled"
                defaultChecked={s?.welcomeEnabled ?? false}
                label={t("Willkommensnachricht")}
                description={t("Wird gepostet, sobald jemand dem Server beitritt.")}
              />
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label htmlFor="welcomeChannelId">{t("Kanal")}</label>
              <ChannelSelect id="welcomeChannelId" value={s?.welcomeChannelId} channels={textChannels} />
            </div>
            <label className="check-inline">
              <input type="checkbox" name="welcomeEmbed" defaultChecked={s?.welcomeEmbed ?? true} />
              {t("Als Karte (Embed) anzeigen")}</label>
          </div>
          <div className="field">
            <label htmlFor="welcomeMessage">{t("Text")}</label>
            <textarea id="welcomeMessage" name="welcomeMessage" maxLength={1500} defaultValue={s?.welcomeMessage ?? t(DEFAULTS.welcomeMessage)} />
          </div>
          <EmbedEditor name="welcomeDesign" textareaId="welcomeMessage" toggleName="welcomeEmbed" initial={s?.welcomeDesign} defaults={{ thumbnail: "avatar", color: s?.welcomeImageColor ?? 0x4cb4ff }} />
          <label className="check-inline" style={{ marginTop: ".5rem" }}>
            <input type="checkbox" name="welcomeImage" defaultChecked={s?.welcomeImage ?? false} />
            {t("Begrüßungsbild mit Profilbild, Name und Mitgliedsnummer anhängen")}</label>
          <div className="grid-2" style={{ marginTop: ".75rem" }}>
            <div className="field">
              <label htmlFor="welcomeImageTitle">{t("Überschrift im Bild")}</label>
              <input id="welcomeImageTitle" name="welcomeImageTitle" type="text" maxLength={40} defaultValue={s?.welcomeImageTitle ?? t("Willkommen!")} />
            </div>
            <div className="field">
              <label htmlFor="welcomeImageColor">{t("Farbe")}</label>
              <input id="welcomeImageColor" name="welcomeImageColor" type="color" defaultValue={`#${(s?.welcomeImageColor ?? 0x4cb4ff).toString(16).padStart(6, "0")}`} />
            </div>
          </div>
          <div className="hint">{t("Im Bild gehen")}{" "}{"{server}"} {" "}{t("und")}{" "}{"{membercount}"}{t(", aber keine Emojis. Zum Ausprobieren: /welcome test.")}</div>
        </section>

        <section className="card">
          <div className="filter-head">
            <div className="module-icon">
              <Icon name="mail" />
            </div>
            <div style={{ flex: 1 }}>
              <Switch
                name="dmEnabled"
                defaultChecked={s?.dmEnabled ?? false}
                label={t("Direktnachricht an neue Mitglieder")}
                description={t("Zum Beispiel mit Regeln oder wichtigen Links. Kommt nicht an, wenn die Person Direktnachrichten ausgeschaltet hat.")}
              />
            </div>
          </div>
          <div className="field" style={{ marginTop: "1rem" }}>
            <label htmlFor="dmMessage">{t("Text")}</label>
            <textarea id="dmMessage" name="dmMessage" maxLength={1500} defaultValue={s?.dmMessage ?? t(DEFAULTS.dmMessage)} />
          </div>
        </section>

        <section className="card">
          <div className="filter-head">
            <div className="module-icon">
              <Icon name="door" />
            </div>
            <div style={{ flex: 1 }}>
              <Switch
                name="goodbyeEnabled"
                defaultChecked={s?.goodbyeEnabled ?? false}
                label={t("Abschiedsnachricht")}
                description={t("Wird gepostet, wenn jemand den Server verlässt, gekickt oder gebannt wird.")}
              />
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label htmlFor="goodbyeChannelId">{t("Kanal")}</label>
              <ChannelSelect id="goodbyeChannelId" value={s?.goodbyeChannelId} channels={textChannels} />
            </div>
            <label className="check-inline">
              <input type="checkbox" name="goodbyeEmbed" defaultChecked={s?.goodbyeEmbed ?? false} />
              {t("Als Karte (Embed) anzeigen")}</label>
          </div>
          <div className="field">
            <label htmlFor="goodbyeMessage">{t("Text")}</label>
            <textarea id="goodbyeMessage" name="goodbyeMessage" maxLength={1500} defaultValue={s?.goodbyeMessage ?? t(DEFAULTS.goodbyeMessage)} />
          </div>
          <EmbedEditor
            name="goodbyeDesign"
            textareaId="goodbyeMessage"
            toggleName="goodbyeEmbed"
            initial={s?.goodbyeDesign}
            defaults={{ thumbnail: "avatar", color: 0xf59e42 }}
            sample={{ user: t("@Ehemaliges Mitglied"), username: t("Ehemaliges Mitglied") }}
          />
        </section>

        <div className="savebar">
          <span className="small muted">{t("Auto-Rollen für neue Mitglieder stellst du unter „Rollen“ ein.")}</span>
          <button type="submit">{t("Speichern")}</button>
        </div>
      </form>
    </>
  );
}
