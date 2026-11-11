import type { TicketCategory } from "@libremod/db";
import { MAX_TICKET_QUESTIONS, TICKET_PLACEHOLDERS } from "@libremod/shared";
import { Switch } from "@/components/Switch";
import { CHANNEL_CATEGORY, CHANNEL_TEXT, type GuildChannel, type GuildRole } from "@/lib/discord";

/** Formular für eine Ticket-Art: Grunddaten, Ort, Team, Begrüßung und bis zu fünf Fragen. */
export function CategoryForm({
  action,
  category,
  channels,
  roles,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  category?: TicketCategory;
  channels: GuildChannel[];
  roles: GuildRole[];
  submitLabel: string;
}) {
  const discordCategories = channels.filter((c) => c.type === CHANNEL_CATEGORY);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT);
  const customEmoji = category?.emoji && /^\d+$/.test(category.emoji);
  return (
    <form action={action} className="stack">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Allgemein</h2>
        <div className="grid-3">
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" required maxLength={80} defaultValue={category?.name ?? ""} placeholder="z. B. Support" />
          </div>
          <div>
            <label htmlFor="emoji">Emoji (optional)</label>
            <input
              id="emoji"
              name="emoji"
              type="text"
              maxLength={80}
              defaultValue={customEmoji ? `<:emoji:${category!.emoji}>` : (category?.emoji ?? "")}
              placeholder="🛟"
            />
          </div>
          <div>
            <label htmlFor="maxOpen">Offene Tickets pro Person</label>
            <input id="maxOpen" name="maxOpen" type="number" min={1} max={10} defaultValue={category?.maxOpen ?? 1} />
          </div>
        </div>
        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="description">Kurzbeschreibung (im Auswahlmenü sichtbar)</label>
          <input id="description" name="description" type="text" maxLength={100} defaultValue={category?.description ?? ""} placeholder="Fragen und Probleme rund um den Server" />
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Wo entstehen die Tickets?</h2>
        <div className="grid-3">
          <div>
            <label htmlFor="mode">Als</label>
            <select id="mode" name="mode" defaultValue={category?.mode ?? "channel"}>
              <option value="channel">Eigener Kanal</option>
              <option value="thread">Privater Thread</option>
            </select>
          </div>
          <div>
            <label htmlFor="categoryParentId">Kategorie (bei eigenem Kanal)</label>
            <select id="categoryParentId" name="categoryParentId" defaultValue={category?.mode !== "thread" ? (category?.parentId ?? "") : ""}>
              <option value="">Keine</option>
              {discordCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  ▸ {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="threadParentId">Kanal (bei privatem Thread)</label>
            <select id="threadParentId" name="threadParentId" defaultValue={category?.mode === "thread" ? (category?.parentId ?? "") : ""}>
              <option value="">Keiner</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="hint">
          Eigene Kanäle sind übersichtlich, aber jeder belegt einen Platz in der Kanalliste. Private Threads halten die Liste sauber; das Team wird dabei
          über die Team-Rollen automatisch hinzugefügt.
        </div>
        <div className="field" style={{ marginTop: "1rem" }}>
          <label htmlFor="nameTemplate">Name des Kanals bzw. Threads</label>
          <input id="nameTemplate" name="nameTemplate" type="text" maxLength={90} defaultValue={category?.nameTemplate ?? "ticket-{number}"} />
          <div className="hint">Platzhalter: {"{number}"}, {"{username}"}, {"{category}"}.</div>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Team</h2>
        <div className="field">
          <label htmlFor="staffRoleIds">Team-Rollen (sehen und bearbeiten diese Tickets)</label>
          <select id="staffRoleIds" name="staffRoleIds" multiple defaultValue={category?.staffRoleIds ?? []} style={{ minHeight: 130 }}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </select>
          <div className="hint">Ohne Auswahl gilt: alle mit dem Recht „Kanäle verwalten“. Wer „Server verwalten“ darf, gehört immer dazu.</div>
        </div>
        <Switch name="pingStaff" defaultChecked={category?.pingStaff ?? false} label="Team bei neuen Tickets erwähnen" description="Schickt den Team-Rollen eine Benachrichtigung." />
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Begrüßung</h2>
        <textarea
          id="welcomeMessage"
          name="welcomeMessage"
          aria-label="Begrüßungstext"
          maxLength={2000}
          defaultValue={category?.welcomeMessage ?? "Hallo {user}, danke für dein Ticket! Das Team meldet sich so schnell wie möglich."}
          style={{ minHeight: 90 }}
        />
        <div className="hint">Platzhalter: {TICKET_PLACEHOLDERS.join(", ")}. Die Antworten auf die Fragen stehen automatisch darunter.</div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Fragen vor dem Öffnen</h2>
        <p className="card-sub">Bis zu {MAX_TICKET_QUESTIONS} Fragen erscheinen als Formular, bevor das Ticket entsteht. Leere Zeilen werden ignoriert.</p>
        <div className="questions">
          {Array.from({ length: MAX_TICKET_QUESTIONS }, (_, n) => {
            const q = category?.questions[n];
            return (
              <div className="subcard question" key={n}>
                <div className="grid-2">
                  <div>
                    <label htmlFor={`q${n}label`}>Frage {n + 1}</label>
                    <input id={`q${n}label`} name={`q${n}label`} type="text" maxLength={45} defaultValue={q?.label ?? ""} placeholder={n === 0 ? "Worum geht es?" : ""} />
                  </div>
                  <div>
                    <label htmlFor={`q${n}placeholder`}>Hinweis im Feld</label>
                    <input id={`q${n}placeholder`} name={`q${n}placeholder`} type="text" maxLength={100} defaultValue={q?.placeholder ?? ""} />
                  </div>
                </div>
                <div className="inline-form" style={{ marginTop: ".5rem" }}>
                  <label className="check-inline">
                    <input type="checkbox" name={`q${n}long`} defaultChecked={q?.long ?? n === 0} /> Mehrzeilig
                  </label>
                  <label className="check-inline">
                    <input type="checkbox" name={`q${n}required`} defaultChecked={q?.required ?? true} /> Pflichtfeld
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="savebar">
        <span />
        <button type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
