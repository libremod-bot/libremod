import { automodExemptions, automodFilter, automodRules, eq, guildSettings, nameGuardSettings, type AutomodFilter } from "@libremod/db";
import { DEFAULT_THRESHOLDS, formatDuration, NAME_GUARD_ACTIONS } from "@libremod/shared";
import { Icon, type IconName } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_CATEGORY, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { saveAutomod, saveNameGuard } from "../actions";

export const metadata = { title: "Auto-Mod · Libremod" };

const FILTERS: Record<AutomodFilter, { label: string; description: string; icon: IconName; threshold?: string }> = {
  phishing: {
    label: "Anti-Phishing",
    description: "Betrugslinks, die Discord, Steam & Co. nachahmen, etwa „dlscord-gift.com“. Am besten mit Kick oder Ban.",
    icon: "shield",
  },
  spam: {
    label: "Spam",
    description: "Zu viele Nachrichten in kurzer Zeit oder dreimal derselbe Text.",
    icon: "spam",
    threshold: "Nachrichten in 5 Sekunden",
  },
  invites: { label: "Einladungslinks", description: "Einladungen zu anderen Discord-Servern.", icon: "invite" },
  links: { label: "Links", description: "Alle Links, außer zu Domains, die du erlaubst.", icon: "link" },
  words: { label: "Wortfilter", description: "Wörter aus deiner Liste, auch mit Tricks wie „1d10t“.", icon: "words" },
  caps: { label: "Großbuchstaben", description: "Nachrichten, die überwiegend in Großbuchstaben sind.", icon: "caps", threshold: "Prozent" },
  mentions: {
    label: "Massen-Erwähnungen",
    description: "Viele Erwähnungen auf einmal oder @everyone ohne Recht.",
    icon: "at",
    threshold: "Erwähnungen",
  },
};

const ACTIONS = [
  ["delete", "Nachricht löschen"],
  ["warn", "Löschen + Verwarnung"],
  ["timeout", "Löschen + Timeout"],
  ["kick", "Löschen + Kick"],
  ["ban", "Löschen + Ban"],
] as const;

const ACTION_SHORT: Record<string, string> = {
  delete: "Löschen",
  warn: "Verwarnung",
  timeout: "Timeout",
  kick: "Kick",
  ban: "Ban",
};

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
  const [[settings], rules, exemptions, channels, roles, [guard]] = await Promise.all([
    db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)),
    db.select().from(automodRules).where(eq(automodRules.guildId, guildId)),
    db.select().from(automodExemptions).where(eq(automodExemptions.guildId, guildId)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    db.select().from(nameGuardSettings).where(eq(nameGuardSettings.guildId, guildId)),
  ]);
  const byFilter = new Map(rules.map((r) => [r.filter, r]));
  const exemptRoles = exemptions.filter((e) => e.kind === "role").map((e) => e.targetId);
  const exemptChannels = exemptions.filter((e) => e.kind === "channel").map((e) => e.targetId);

  return (
    <>
      <PageHeader
        icon="shield"
        title="Auto-Mod"
        description="Libremod löscht unerwünschte Nachrichten automatisch und bestraft auf Wunsch. Schalte einfach ein, was du brauchst."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveAutomod.bind(null, guildId)} className="stack">
        <div className="card">
          <Switch
            name="automodEnabled"
            defaultChecked={settings?.automodEnabled ?? false}
            label="Auto-Moderation"
            description="Hauptschalter für alle Filter. Mitglieder mit „Nachrichten verwalten“ sind immer ausgenommen."
          />
        </div>

        <section>
          <h2 style={{ marginBottom: "0.85rem" }}>Filter</h2>
          <div className="filters">
            {(["phishing", ...automodFilter.enumValues.filter((x) => x !== "phishing")] as AutomodFilter[]).map((f) => {
              const rule = byFilter.get(f);
              const info = FILTERS[f];
              const defaultThreshold = DEFAULT_THRESHOLDS[f as keyof typeof DEFAULT_THRESHOLDS];
              const action = rule?.action ?? "delete";
              return (
                <div className="card filter-card" key={f}>
                  <div className="filter-head">
                    <div className="module-icon">
                      <Icon name={info.icon} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Switch name={`${f}.enabled`} defaultChecked={rule?.enabled ?? false} label={info.label} description={info.description} />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: "1rem" }}>
                    <label htmlFor={`${f}.action`}>Was passiert bei einem Verstoß?</label>
                    <select id={`${f}.action`} name={`${f}.action`} defaultValue={action}>
                      {ACTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {f === "words" && (
                    <div className="field">
                      <label htmlFor="words.list">Verbotene Wörter</label>
                      <textarea
                        id="words.list"
                        name="words.list"
                        defaultValue={(rule?.config.words ?? []).join("\n")}
                        placeholder={"ein Wort pro Zeile\nidiot*"}
                      />
                      <div className="hint">Ein * am Ende trifft auch Endungen (idiot* → idioten).</div>
                    </div>
                  )}
                  {f === "phishing" && (
                    <div className="field">
                      <label className="check-inline" style={{ padding: 0, marginBottom: ".75rem" }}>
                        <input type="checkbox" name="phishing.externalLists" defaultChecked={rule?.config.externalLists ?? true} />
                        Öffentliche Betrugslink-Listen nutzen
                      </label>
                      <div className="hint" style={{ marginTop: "-.5rem", marginBottom: ".75rem" }}>
                        Zehntausende bekannte Betrugsdomains aus zwei freien Listen auf GitHub. Libremod lädt die Listen nur herunter und prüft
                        Links bei sich. Es wird nichts an die Listen gesendet, weder Nachrichten noch Nutzer noch dein Server.
                      </div>
                      <label htmlFor="phishing.blockedDomains">Zusätzlich gesperrte Domains</label>
                      <textarea
                        id="phishing.blockedDomains"
                        name="phishing.blockedDomains"
                        defaultValue={(rule?.config.blockedDomains ?? []).join("\n")}
                        placeholder={"beispiel-betrug.com"}
                        style={{ minHeight: 60 }}
                      />
                      <div className="hint">Eine Domain pro Zeile. Echte Discord-, Steam- und andere bekannte Seiten bleiben immer erlaubt.</div>
                      <label htmlFor="phishing.allowedDomains" style={{ marginTop: ".75rem" }}>
                        Freigegeben (Fehlalarme)
                      </label>
                      <textarea
                        id="phishing.allowedDomains"
                        name="phishing.allowedDomains"
                        defaultValue={(rule?.config.allowedDomains ?? []).join("\n")}
                        style={{ minHeight: 60 }}
                      />
                      <div className="hint">
                        Prüft auch Kurzlinks (bit.ly usw.), getarnte Links und typische Betrugstexte. Postet jemand denselben Link in mehreren Kanälen,
                        löscht Libremod alle Kopien und schaltet die Person mindestens 1 Stunde stumm. Im Mod-Log kann dein Team Domains per Knopf
                        sperren oder freigeben, per Rechtsklick auf eine Nachricht → Apps → „Betrugslink sperren“ auch nachträglich.
                      </div>
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
                        style={{ minHeight: 80 }}
                      />
                      <div className="hint">Eine Domain pro Zeile, Subdomains sind automatisch erlaubt.</div>
                    </div>
                  )}

                  <details className="more">
                    <summary>
                      Erweitert
                      {rule?.durationSeconds ? ` · ${ACTION_SHORT[action]} ${formatDuration(rule.durationSeconds)}` : ""}
                      {rule?.config.threshold ? ` · Schwelle ${rule.config.threshold}` : ""}
                      {rule?.config.notice ? " · mit Hinweis" : ""}
                    </summary>
                    <div className="grid-3">
                      <div>
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
                        <div>
                          <label htmlFor={`${f}.threshold`}>Schwelle</label>
                          <input
                            id={`${f}.threshold`}
                            name={`${f}.threshold`}
                            type="number"
                            min={f === "caps" ? 50 : 2}
                            max={100}
                            placeholder={String(defaultThreshold)}
                            defaultValue={rule?.config.threshold ?? ""}
                          />
                          <div className="hint">
                            {info.threshold}, Standard {defaultThreshold}.
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="field" style={{ marginTop: "0.9rem", marginBottom: 0 }}>
                      <label htmlFor={`${f}.notice`}>Hinweis an die Person</label>
                      <input
                        id={`${f}.notice`}
                        name={`${f}.notice`}
                        type="text"
                        maxLength={500}
                        placeholder="z. B. {user}, bitte keine Einladungslinks hier."
                        defaultValue={rule?.config.notice ?? ""}
                      />
                      <div className="hint">Erscheint nach dem Löschen im Kanal und verschwindet nach 10 Sekunden. Leer = kein Hinweis.</div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="users" />
            <h2>Ausnahmen</h2>
          </div>
          <p className="card-sub">Rollen und Kanäle, in denen die Auto-Mod nicht eingreift. Mehrfachauswahl mit Strg bzw. Cmd.</p>
          <div className="grid-3">
            <div>
              <label htmlFor="exemptRoles">Rollen</label>
              <select id="exemptRoles" name="exemptRoles" multiple defaultValue={exemptRoles}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
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

        <section className="card" id="raid">
          <div className="filter-head">
            <div className="module-icon">
              <Icon name="shield" />
            </div>
            <div style={{ flex: 1 }}>
              <Switch
                name="raidEnabled"
                defaultChecked={settings?.raidEnabled ?? false}
                label="Raid-Schutz"
                description="Reagiert, wenn sehr viele Mitglieder in kurzer Zeit beitreten. Bleibt danach 5 Minuten aktiv."
              />
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: "1rem" }}>
            <div>
              <label htmlFor="raidJoinThreshold">Ab Beitritten</label>
              <input id="raidJoinThreshold" name="raidJoinThreshold" type="number" min={3} max={100} defaultValue={settings?.raidJoinThreshold ?? 10} />
            </div>
            <div>
              <label htmlFor="raidWindowSeconds">Innerhalb von Sekunden</label>
              <input id="raidWindowSeconds" name="raidWindowSeconds" type="number" min={5} max={600} defaultValue={settings?.raidWindowSeconds ?? 10} />
            </div>
            <div>
              <label htmlFor="raidAction">Mit neuen Mitgliedern</label>
              <select id="raidAction" name="raidAction" defaultValue={settings?.raidAction ?? "alert"}>
                <option value="alert">Nur im Mod-Log warnen</option>
                <option value="timeout">Timeout (1 Stunde)</option>
                <option value="kick">Kicken</option>
                <option value="ban">Bannen</option>
              </select>
            </div>
          </div>
        </section>

        <div className="savebar">
          <span className="small muted">Änderungen gelten sofort nach dem Speichern.</span>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <form action={saveNameGuard.bind(null, guildId)} className="card" id="namensschutz">
        <Switch
          name="nameGuard.enabled"
          defaultChecked={guard?.enabled ?? false}
          label="Namensschutz"
          description="Greift ein, wenn jemand heißt wie dein Team, der Server-Inhaber oder Libremod, auch mit Tricks wie „Mlchel“ oder „Max | Support“."
        />
        <div className="grid-2" style={{ marginTop: "1rem", alignItems: "start" }}>
          <div>
            <label htmlFor="nameGuard.roles">Team-Rollen, deren Namen geschützt sind</label>
            <select id="nameGuard.roles" name="nameGuard.roles" multiple defaultValue={guard?.roleIds ?? []}>
              {roles
                .filter((r) => r.id !== guildId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
            </select>
            <div className="hint">Inhaber und Libremod sind immer geschützt. Wer selbst eine dieser Rollen hat, wird nicht geprüft.</div>
          </div>
          <div>
            <label htmlFor="nameGuard.action">Was passiert?</label>
            <select id="nameGuard.action" name="nameGuard.action" defaultValue={guard?.action ?? "rename"}>
              {NAME_GUARD_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <label htmlFor="nameGuard.names" style={{ marginTop: "1rem" }}>
              Weitere geschützte Namen
            </label>
            <textarea id="nameGuard.names" name="nameGuard.names" defaultValue={(guard?.names ?? []).join("\n")} placeholder={"Servername\nSupport"} style={{ minHeight: 80 }} />
            <div className="hint">Einer pro Zeile. Alles landet im Mod-Log.</div>
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Namensschutz speichern</button>
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
