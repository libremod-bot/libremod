import { NOTIFY_PLACEHOLDERS } from "@libremod/shared";
import type { GuildChannel, GuildRole } from "@/lib/discord";

/** Gemeinsame Felder für Anlegen und Bearbeiten: Kanal, Erwähnung, Text. */
export function FeedFields({
  guildId,
  textChannels,
  roles,
  channelId,
  mentionRoleId,
  message,
  messagePlaceholder,
}: {
  guildId: string;
  textChannels: GuildChannel[];
  roles: GuildRole[];
  channelId?: string;
  mentionRoleId?: string | null;
  message?: string;
  messagePlaceholder: string;
}) {
  return (
    <>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="channelId">Posten in</label>
          <select id="channelId" name="channelId" required defaultValue={channelId ?? ""}>
            <option value="" disabled>
              Kanal wählen …
            </option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mentionRoleId">Erwähnen</label>
          <select id="mentionRoleId" name="mentionRoleId" defaultValue={mentionRoleId ?? ""}>
            <option value="">Niemanden</option>
            <option value={guildId}>@everyone</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="message">Text</label>
        <textarea id="message" name="message" maxLength={1500} defaultValue={message} placeholder={messagePlaceholder} style={{ minHeight: 90 }} />
        <div className="hint">
          Leer lassen für den Standardtext. Platzhalter: {NOTIFY_PLACEHOLDERS.join(", ")}. Links zu Videos und Streams zeigt Discord automatisch mit
          Vorschau an.
        </div>
      </div>
    </>
  );
}
