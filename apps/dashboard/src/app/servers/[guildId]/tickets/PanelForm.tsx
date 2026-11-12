import type { TicketCategory, TicketPanel } from "@libremod/db";
import type { GuildChannel } from "@/lib/discord";
import { t } from "@/lib/i18n";

export function TicketPanelForm({
  action,
  panel,
  channels,
  categories,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  panel?: TicketPanel;
  channels: GuildChannel[];
  categories: TicketCategory[];
  submitLabel: string;
}) {
  const selected = new Set(panel?.categoryIds ?? categories.map((c) => c.id));
  return (
    <form action={action} className="card">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="title">{t("Überschrift")}</label>
          <input id="title" name="title" type="text" required maxLength={256} defaultValue={panel?.title ?? "Hilfe & Support"} />
        </div>
        <div className="field">
          <label htmlFor="channelId">{t("Kanal")}</label>
          <select id="channelId" name="channelId" required defaultValue={panel?.channelId ?? ""}>
            <option value="" disabled>
              {t("Kanal wählen …")}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">{t("Text")}</label>
        <textarea
          id="description"
          name="description"
          maxLength={2000}
          style={{ minHeight: 90 }}
          defaultValue={panel?.description ?? "Du brauchst Hilfe oder möchtest etwas melden? Wähle unten aus, worum es geht. Es öffnet sich ein privater Bereich nur für dich und das Team."}
        />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="style">{t("Darstellung")}</label>
          <select id="style" name="style" defaultValue={panel?.style ?? "buttons"}>
            <option value="buttons">{t("Buttons")}</option>
            <option value="select">{t("Auswahlmenü (mit Beschreibungen)")}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="color">{t("Farbe")}</label>
          <input id="color" name="color" type="color" defaultValue={`#${(panel?.color ?? 0x4cb4ff).toString(16).padStart(6, "0")}`} />
        </div>
      </div>
      <fieldset className="field">
        <legend>{t("Ticket-Arten in diesem Panel")}</legend>
        {categories.map((c) => (
          <label className="check-inline" key={c.id}>
            <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={selected.has(c.id)} />
            {c.emoji && !/^\d+$/.test(c.emoji) ? `${c.emoji} ` : ""}
            {c.name}
          </label>
        ))}
      </fieldset>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
