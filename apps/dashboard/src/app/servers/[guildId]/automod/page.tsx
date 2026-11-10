import { automodExemptions, automodFilter, automodRules, eq, guildSettings, type AutomodFilter } from "@libremod/db";
import { DEFAULT_THRESHOLDS, formatDuration } from "@libremod/shared";
import { Notice } from "@/components/Notice";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_CATEGORY, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { saveAutomod } from "../actions";

export const metadata = { title: "Auto-Mod · Libremod" };

const FILTERS: Record<AutomodFilter, { label: string; description: string; threshold?: string }> = {
  spam: {
    label: "Spam",
    description: "Zu viele Nachrichten in kurzer Zeit oder dreimal derselbe Text.",
    threshold: "Nachrichten in 5 Sekunden",
  },
  invites: { label: "Einladungslinks", description: "Einladungen zu anderen Discord-Servern." },
  links: { label: "Links", description: "Alle Links, außer zu erlaubten Domains." },
  words: { label: "Wortfilter", description: "Wörter aus deiner Liste, auch mit Ersatzzeichen wie 1d10t." },
  caps: { label: "Großbuchstaben", description: "Nachrichten, die überwiegend in Großbuchstaben geschrieben sind.", threshold: "Prozent" },
  mentions: {
    label: "Massen-Erwähnungen",
    description: "Viele Erwähnungen in einer Nachricht oder @everyone ohne Berechtigung.",
    threshold: "Erwähnungen",
  },
};

const ACTIONS = [
  ["delete", "Nur löschen"],
  ["warn", "Löschen + verwarnen"],
  ["timeout", "Löschen + Timeout"],
  ["kick", "Löschen + Kick"],
  ["ban", "Löschen + Ban"],
] as const;

export default async function AutomodPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [[settings], rules, exemptions, channels, roles] = await Promise.all([
    db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)),
    db.select().from(automodRules).where(eq(automodRules.guildId, guildId)),
    db.select().from(automodExemptions).where(eq(automodExemptions.guildId, guildId)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const byFilter = new Map(rules.map((r) => [r.filter, r]));
  const exemptRoles = exemptions.filter((e) => e.kind === "role").map((e) => e.targetId);
  const exemptChannels = exemptions.filter((e) => e.kind === "channel").map((e) => e.targetId);

  return (
    <>
      <h1>Auto-Mod</h1>
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveAutomod.bind(null, guildId)}>
        <div className="card">
          <label className="check">
            <input type="checkbox" name="automodEnabled" defaultChecked={settings?.automodEnabled ?? false} />
            Auto-Moderation einschalten
          </label>
          <div className="hint">
            Hauptschalter für alle Filter unten. Mitglieder mit „Nachrichten verwalten“ sind immer ausgenommen.
          </div>
        </div>

        {(automodFilter.enumValues as readonly AutomodFilter[]).map((f) => {
          const rule = byFilter.get(f);
          const info = FILTERS[f];
          const defaultThreshold = DEFAULT_THRESHOLDS[f as keyof typeof DEFAULT_THRESHOLDS];
          return (
            <section className="card" key={f}>
              <div className="card-head">
                <div>
                  <h2>{info.label}</h2>
                  <div className="muted small">{info.description}</div>
                </div>
                <label className="check">
                  <input type="checkbox" name={`${f}.enabled`} defaultChecked={rule?.enabled ?? false} />
                  Aktiv
                </label>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor={`${f}.action`}>Bei Verstoß</label>
                  <select id={`${f}.action`} name={`${f}.action`} defaultValue={rule?.action ?? "delete"}>
                    {ACTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${f}.duration`}>Dauer</label>
                  <input
                    id={`${f}.duration`}
                    name={`${f}.duration`}
                    type="text"
                    placeholder="z. B. 10m, 1d"
                    defaultValue={rule?.durationSeconds ? compactDuration(rule.durationSeconds) : ""}
                  />
                  <div className="hint">Für Timeout (Standard 10 Minuten) oder befristeten Ban.</div>
                </div>
                {info.threshold && (
                  <div className="field">
                    <label htmlFor={`${f}.threshold`}>Schwelle ({info.threshold})</label>
                    <input
                      id={`${f}.threshold`}
                      name={`${f}.threshold`}
                      type="number"
                      min={f === "caps" ? 50 : 2}
                      max={100}
                      placeholder={String(defaultThreshold)}
                      defaultValue={rule?.config.threshold ?? ""}
                    />
                  </div>
                )}
              </div>
              {f === "words" && (
                <div className="field">
                  <label htmlFor="words.list">Wortliste</label>
                  <textarea
                    id="words.list"
                    name="words.list"
                    defaultValue={(rule?.config.words ?? []).join("\n")}
                    placeholder={"ein Wort pro Zeile\nidiot*"}
                  />
                  <div className="hint">Ein Wort pro Zeile. Ein * am Ende trifft auch Endungen (idiot* → idioten).</div>
                </div>
              )}
              {f === "links" && (
                <div className="field">
                  <label htmlFor="links.allowedDomains">Erlaubte Domains</label>
                  <textarea
                    id="links.allowedDomains"
                    name="links.allowedDomains"
                    defaultValue={(rule?.config.allowedDomains ?? []).join("\n")}
                    placeholder={"youtube.com\nlibremod.dev"}
                  />
                  <div className="hint">Eine Domain pro Zeile, Subdomains sind automatisch mit erlaubt.</div>
                </div>
              )}
            </section>
          );
        })}

        <section className="card">
          <h2>Ausnahmen</h2>
          <p className="muted small">Mehrfachauswahl mit Strg bzw. Cmd.</p>
          <div className="row">
            <div className="field">
              <label htmlFor="exemptRoles">Rollen</label>
              <select id="exemptRoles" name="exemptRoles" multiple defaultValue={exemptRoles}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exemptChannels">Kanäle und Kategorien</label>
              <select id="exemptChannels" name="exemptChannels" multiple defaultValue={exemptChannels}>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === CHANNEL_CATEGORY ? `▸ ${c.name}` : `#${c.name}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Raid-Schutz</h2>
              <div className="muted small">Reagiert, wenn sehr viele Mitglieder in kurzer Zeit beitreten.</div>
            </div>
            <label className="check">
              <input type="checkbox" name="raidEnabled" defaultChecked={settings?.raidEnabled ?? false} />
              Aktiv
            </label>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="raidJoinThreshold">Ab Beitritten</label>
              <input id="raidJoinThreshold" name="raidJoinThreshold" type="number" min={3} max={100} defaultValue={settings?.raidJoinThreshold ?? 10} />
            </div>
            <div className="field">
              <label htmlFor="raidWindowSeconds">Innerhalb von Sekunden</label>
              <input id="raidWindowSeconds" name="raidWindowSeconds" type="number" min={5} max={600} defaultValue={settings?.raidWindowSeconds ?? 10} />
            </div>
            <div className="field">
              <label htmlFor="raidAction">Neue Mitglieder während des Raids</label>
              <select id="raidAction" name="raidAction" defaultValue={settings?.raidAction ?? "alert"}>
                <option value="alert">Nur im Mod-Log warnen</option>
                <option value="timeout">Timeout (1 Stunde)</option>
                <option value="kick">Kicken</option>
                <option value="ban">Bannen</option>
              </select>
            </div>
          </div>
          <div className="hint">Der Raid-Modus bleibt nach dem letzten verdächtigen Beitritt 5 Minuten aktiv.</div>
        </section>

        <div className="actions">
          <button type="submit">Alles speichern</button>
        </div>
      </form>
    </>
  );
}

/** Sekunden zurück in eine kurze Eingabe wie "1d12h" umwandeln. */
function compactDuration(seconds: number) {
  const units: [number, string][] = [
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
    [1, "s"],
  ];
  let rest = seconds;
  let out = "";
  for (const [size, unit] of units) {
    const n = Math.floor(rest / size);
    if (n) {
      out += `${n}${unit}`;
      rest -= n * size;
    }
  }
  return out || formatDuration(seconds);
}
