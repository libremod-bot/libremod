import type { CustomCommand } from "@libremod/db";
import { EmbedEditor } from "@/components/EmbedEditor";
import { t } from "@/lib/i18n";


/** Formular für einen eigenen Befehl. */
export function CommandForm({ action, command, submitLabel }: { action: (form: FormData) => Promise<void>; command?: CustomCommand; submitLabel: string }) {
  return (
    <form action={action}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="name">{t("Name")}</label>
          <div className="input-prefix">
            <span>/</span>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={32}
              pattern="[a-z0-9_\-]{1,32}"
              defaultValue={command?.name ?? ""}
              placeholder="regeln"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">{t("Beschreibung")}</label>
          <input
            id="description"
            name="description"
            type="text"
            required
            maxLength={100}
            defaultValue={command?.description ?? ""}
            placeholder={t("Zeigt die Serverregeln")}
          />
        </div>
      </div>
      <div className="hint" style={{ marginTop: "-0.4rem", marginBottom: "0.9rem" }}>
        {t("Nur Kleinbuchstaben, Zahlen, - und _. Die Beschreibung sehen Mitglieder in der Befehlsliste von Discord.")}</div>
      <div className="field">
        <label htmlFor="responses">{t("Antwort")}</label>
        <textarea
          id="responses"
          name="responses"
          required
          maxLength={8000}
          defaultValue={(command?.responses ?? []).join("\n---\n")}
          placeholder={t("1. Sei freundlich.\n2. Kein Spam.\n---\nEine zweite Antwort, falls du mehrere zur Auswahl willst")}
          style={{ minHeight: 140 }}
        />
        <div className="hint">
          {t("Mehrere Antworten trennst du mit einer Zeile, auf der nur --- steht. Libremod wählt dann zufällig eine aus. Platzhalter:")}{" "}{"{user}"},{" "}
          {"{username}"}, {"{server}"}, {"{membercount}"}.
        </div>
      </div>
      <label className="check-inline">
        <input type="checkbox" name="embed" defaultChecked={command?.embed ?? false} />
        {t("Als Karte (Embed) antworten")}</label>
      <EmbedEditor
        name="design"
        textareaId="responses"
        toggleName="embed"
        initial={{ title: command?.embedTitle ?? undefined, color: command?.embedColor ?? undefined, ...(command?.design ?? {}) }}
        defaults={{ thumbnail: "none" }}
        sample={{ user: "@Mitglied", username: "Mitglied" }}
      />
      <label className="check-inline" style={{ marginTop: "0.5rem" }}>
        <input type="checkbox" name="ephemeral" defaultChecked={command?.ephemeral ?? false} />
        {t("Antwort nur für die Person sichtbar, die den Befehl nutzt")}</label>
      <div style={{ marginTop: "1rem" }}>
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
