"use client";

import { useState } from "react";
import { PRESET_INFO, type PresetKey, type ProtectionLevel, type SetupModule } from "@libremod/shared/presets";
import { useT } from "@/components/I18n";
import { Icon, type IconName } from "@/components/Icon";

type Channel = { id: string; name: string };

const PRESET_CARDS: { key: PresetKey; icon: IconName; title: string; text: string }[] = [
  { key: "community", icon: "users", title: "Community", text: "Offener Server mit vielen Leuten, die sich unterhalten." },
  { key: "gaming", icon: "play", title: "Gaming", text: "Zusammen spielen, viel los im Sprachkanal, gern mit Level und Münzen." },
  { key: "learning", icon: "bulb", title: "Lernen & Schule", text: "Lerngruppe, Klasse oder Kurs. Ruhig, sicher und ohne Ablenkung." },
  { key: "creator", icon: "broadcast", title: "Creator & Streams", text: "Dein Kanal, deine Fans. Begrüßung, Level und Ideen aus der Community." },
  { key: "friends", icon: "wave", title: "Freundeskreis", text: "Klein und privat. Wenig Regeln, viel Spaß." },
];

const LEVELS: { key: ProtectionLevel; title: string; text: string }[] = [
  { key: "relaxed", title: "Entspannt", text: "Nur Betrugslinks und grober Spam. Ihr kennt euch." },
  { key: "normal", title: "Normal", text: "Betrugslinks, Spam, Massen-Erwähnungen, fremde Einladungen und Schreien in Großbuchstaben. Strafen steigen mit den Verwarnungen." },
  { key: "strict", title: "Streng", text: "Wie Normal, dazu nur bekannte Links (YouTube, Twitch, GitHub …), schnellere Strafen und Schutz vor Raids." },
];

const MODULES: { key: SetupModule; icon: IconName; title: string; text: string }[] = [
  { key: "welcome", icon: "wave", title: "Begrüßung", text: "Neue Mitglieder werden mit Bild und Text willkommen geheißen." },
  { key: "levels", icon: "steps", title: "Level", text: "XP fürs Schreiben und Reden, mit Rangliste." },
  { key: "economy", icon: "coin", title: "Währung & Shop", text: "Tägliche Münzen, /work und ein Shop." },
  { key: "suggestions", icon: "bulb", title: "Vorschläge", text: "Mitglieder reichen Ideen ein, alle stimmen ab." },
  { key: "birthdays", icon: "cake", title: "Geburtstage", text: "Libremod gratuliert am großen Tag." },
];

const STEPS = ["Art des Servers", "Schutz", "Module", "Kanäle", "Fertig"];

export function SetupWizard({
  action,
  channels,
  defaults,
}: {
  action: (form: FormData) => void;
  channels: Channel[];
  defaults: { modLogChannelId: string; logChannelId: string; welcomeChannelId: string; suggestionChannelId: string };
}) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<PresetKey>("community");
  const [protection, setProtection] = useState<ProtectionLevel>(PRESET_INFO.community.protection);
  const [modules, setModules] = useState<SetupModule[]>(PRESET_INFO.community.modules);
  const [chosen, setChosen] = useState(defaults);

  const pickPreset = (p: PresetKey) => {
    setPreset(p);
    setProtection(PRESET_INFO[p].protection);
    setModules(PRESET_INFO[p].modules);
  };
  const toggle = (m: SetupModule) => setModules((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  const name = (id: string) => channels.find((c) => c.id === id)?.name;
  const last = STEPS.length - 1;

  const channelSelect = (key: keyof typeof defaults, label: string, hint: string) => (
    <div className="field">
      <label htmlFor={key}>{t(label)}</label>
      <select id={key} name={key} value={chosen[key]} onChange={(e) => setChosen({ ...chosen, [key]: e.target.value })}>
        <option value="">{t("Später einrichten")}</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <div className="hint">{t(hint)}</div>
    </div>
  );

  return (
    <form action={action} className="stack wizard">
      <ol className="wizard-steps" aria-label={t("Schritte")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
            <button type="button" className="link" onClick={() => setStep(i)} disabled={i > step}>
              <span className="wizard-dot">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              {t(s)}
            </button>
          </li>
        ))}
      </ol>

      {/* Alle Felder bleiben im Formular, versteckte Schritte nur unsichtbar. */}
      <input type="hidden" name="preset" value={preset} />
      <input type="hidden" name="protection" value={protection} />
      {modules.map((m) => (
        <input key={m} type="hidden" name="modules" value={m} />
      ))}

      <section className="card" hidden={step !== 0}>
        <h2>{t("Was für ein Server ist das?")}</h2>
        <p className="card-sub">{t("Libremod schlägt dir danach passende Einstellungen vor. Du kannst alles noch ändern.")}</p>
        <div className="radio-cards wizard-cards">
          {PRESET_CARDS.map((p) => (
            <label key={p.key} className="radio-card">
              <input type="radio" name="_preset" checked={preset === p.key} onChange={() => pickPreset(p.key)} />
              <span>
                <strong>
                  <Icon name={p.icon} size={18} /> {t(p.title)}
                </strong>
                <span className="small muted">{t(p.text)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" hidden={step !== 1}>
        <h2>{t("Wie streng soll Libremod aufpassen?")}</h2>
        <p className="card-sub">{t("Für deinen Server empfehlen wir „{level}“.", { level: t(LEVELS.find((l) => l.key === PRESET_INFO[preset].protection)!.title) })}</p>
        <div className="radio-cards wizard-cards">
          {LEVELS.map((l) => (
            <label key={l.key} className="radio-card">
              <input type="radio" name="_protection" checked={protection === l.key} onChange={() => setProtection(l.key)} />
              <span>
                <strong>{t(l.title)}</strong>
                <span className="small muted">{t(l.text)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" hidden={step !== 2}>
        <h2>{t("Was soll dazukommen?")}</h2>
        <p className="card-sub">{t("Schutz und Logging sind immer dabei. Den Rest kannst du jederzeit an- oder ausschalten.")}</p>
        <div className="radio-cards wizard-cards">
          {MODULES.map((m) => (
            <label key={m.key} className="radio-card">
              <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggle(m.key)} />
              <span>
                <strong>
                  <Icon name={m.icon} size={18} /> {t(m.title)}
                </strong>
                <span className="small muted">{t(m.text)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" hidden={step !== 3}>
        <h2>{t("Wohin soll Libremod schreiben?")}</h2>
        <p className="card-sub">{t("Am besten eigene Kanäle, die nur dein Team sieht, für das Mod-Log und das Server-Log.")}</p>
        <div className="stack" style={{ gap: "1rem" }}>
          {channelSelect("modLogChannelId", "Mod-Log", "Hier landet jede Verwarnung, jeder Timeout und jeder Ban mit Fallnummer.")}
          {channelSelect("logChannelId", "Server-Log", "Gelöschte und bearbeitete Nachrichten, Beitritte, Austritte und Änderungen am Server.")}
          {(modules.includes("welcome") || modules.includes("birthdays")) &&
            channelSelect("welcomeChannelId", "Begrüßungen und Glückwünsche", "Ein Kanal, den alle sehen, zum Beispiel #willkommen oder #allgemein.")}
          {modules.includes("suggestions") && channelSelect("suggestionChannelId", "Vorschläge", "Ein eigener Kanal nur für Vorschläge.")}
        </div>
      </section>

      <section className="card" hidden={step !== 4}>
        <h2>{t("Alles bereit")}</h2>
        <p className="card-sub">{t("Das richtet Libremod jetzt ein:")}</p>
        <ul className="wizard-summary">
          <li>
            <Icon name="shield" size={18} /> {t("Auto-Mod: {level}", { level: t(LEVELS.find((l) => l.key === protection)!.title) })}
          </li>
          <li>
            <Icon name="gavel" size={18} /> {chosen.modLogChannelId ? t("Mod-Log in #{name}", { name: name(chosen.modLogChannelId) ?? "?" }) : t("Mod-Log: später einrichten")}
          </li>
          <li>
            <Icon name="log" size={18} /> {chosen.logChannelId ? t("Server-Log in #{name}", { name: name(chosen.logChannelId) ?? "?" }) : t("Server-Log: später einrichten")}
          </li>
          {MODULES.filter((m) => modules.includes(m.key)).map((m) => (
            <li key={m.key}>
              <Icon name={m.icon} size={18} /> {t(m.title)}
            </li>
          ))}
        </ul>
        <p className="hint">{t("Bestehende Einstellungen dieser Bereiche werden angepasst, eigene Texte und Wortlisten bleiben. Im Änderungsprotokoll kannst du alles mit einem Klick zurücknehmen.")}</p>
      </section>

      <div className="savebar wizard-nav">
        {step > 0 ? (
          <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
            {t("Zurück")}
          </button>
        ) : (
          <span />
        )}
        {step < last ? (
          // Eigene keys: Sonst macht React aus dem geklickten „Weiter“ den Absenden-Knopf und das Formular geht sofort ab.
          <button key="next" type="button" onClick={() => setStep(step + 1)}>
            {t("Weiter")}
          </button>
        ) : (
          <button key="submit" type="submit">
            <Icon name="check" size={16} /> {t("Jetzt einrichten")}
          </button>
        )}
      </div>
    </form>
  );
}
