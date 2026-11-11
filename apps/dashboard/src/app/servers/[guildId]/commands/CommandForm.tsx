import type { CustomCommand } from "@libremod/db";

const hex = (n: number | null | undefined) => `#${(n ?? 0x4cb4ff).toString(16).padStart(6, "0")}`;

/** Formular für einen eigenen Befehl. */
export function CommandForm({ action, command, submitLabel }: { action: (form: FormData) => Promise<void>; command?: CustomCommand; submitLabel: string }) {
  return (
    <form action={action}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="name">Name</label>
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
          <label htmlFor="description">Beschreibung</label>
          <input
            id="description"
            name="description"
            type="text"
            required
            maxLength={100}
            defaultValue={command?.description ?? ""}
            placeholder="Zeigt die Serverregeln"
          />
        </div>
      </div>
      <div className="hint" style={{ marginTop: "-0.4rem", marginBottom: "0.9rem" }}>
        Nur Kleinbuchstaben, Zahlen, - und _. Die Beschreibung sehen Mitglieder in der Befehlsliste von Discord.
      </div>
      <div className="field">
        <label htmlFor="responses">Antwort</label>
        <textarea
          id="responses"
          name="responses"
          required
          maxLength={8000}
          defaultValue={(command?.responses ?? []).join("\n---\n")}
          placeholder={"1. Sei freundlich.\n2. Kein Spam.\n---\nEine zweite Antwort, falls du mehrere zur Auswahl willst"}
          style={{ minHeight: 140 }}
        />
        <div className="hint">
          Mehrere Antworten trennst du mit einer Zeile, auf der nur --- steht. Libremod wählt dann zufällig eine aus. Platzhalter: {"{user}"},{" "}
          {"{username}"}, {"{server}"}, {"{membercount}"}.
        </div>
      </div>
      <div className="grid-3" style={{ alignItems: "end" }}>
        <label className="check-inline">
          <input type="checkbox" name="embed" defaultChecked={command?.embed ?? false} />
          Als Embed (Karte) antworten
        </label>
        <div>
          <label htmlFor="embedTitle">Embed-Überschrift</label>
          <input id="embedTitle" name="embedTitle" type="text" maxLength={256} defaultValue={command?.embedTitle ?? ""} placeholder="optional" />
        </div>
        <div>
          <label htmlFor="embedColor">Embed-Farbe</label>
          <input id="embedColor" name="embedColor" type="color" defaultValue={hex(command?.embedColor)} />
        </div>
      </div>
      <label className="check-inline" style={{ marginTop: "0.5rem" }}>
        <input type="checkbox" name="ephemeral" defaultChecked={command?.ephemeral ?? false} />
        Antwort nur für die Person sichtbar, die den Befehl nutzt
      </label>
      <div style={{ marginTop: "1rem" }}>
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
