"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useT } from "./I18n";
import { INTL_LOCALE } from "@libremod/shared/i18n";

type Field = { name: string; value: string; inline?: boolean };
export interface Design {
  title?: string;
  color?: number;
  authorName?: string;
  footer?: string;
  imageUrl?: string;
  thumbnail?: "avatar" | "none" | "url";
  thumbnailUrl?: string;
  fields?: Field[];
  timestamp?: boolean;
}

interface Props {
  /** Name des versteckten Feldes, das die Gestaltung als JSON mitschickt. */
  name: string;
  /** id der Textarea mit dem Nachrichtentext (wird live gelesen). */
  textareaId: string;
  /** Name der Checkbox „als Karte“. Ohne Angabe ist es immer eine Karte. */
  toggleName?: string;
  initial?: Design | null;
  defaults?: { color?: number; thumbnail?: "avatar" | "none" };
  /** Beispielwerte für Platzhalter in der Vorschau. */
  sample?: Record<string, string>;
  /** Platzhalter erklären */
  placeholders?: boolean;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Sehr kleiner Markdown-Ausschnitt für die Vorschau: **fett**, *kursiv*, Erwähnungen, Zeilenumbrüche. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\u2063@[^\u2063]+\u2063)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^\*[^*\n]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        if (/^\u2063@[^\u2063]+\u2063$/.test(p)) return <span key={i} className="dc-mention">{p.slice(1, -1)}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function EmbedEditor({ name, textareaId, toggleName, initial, defaults, sample, placeholders = true }: Props) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<Design>(() => ({ ...(initial ?? {}) }));
  const [text, setText] = useState("");
  const [asEmbed, setAsEmbed] = useState(!toggleName);

  // Text und Karten-Schalter aus dem umgebenden Formular mitlesen
  useEffect(() => {
    const form = root.current?.closest("form");
    const ta = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const toggle = toggleName ? (form?.querySelector(`input[name="${toggleName}"]`) as HTMLInputElement | null) : null;
    const sync = () => {
      setText(ta?.value ?? "");
      if (toggle) setAsEmbed(toggle.checked);
    };
    sync();
    ta?.addEventListener("input", sync);
    toggle?.addEventListener("change", sync);
    return () => {
      ta?.removeEventListener("input", sync);
      toggle?.removeEventListener("change", sync);
    };
  }, [textareaId, toggleName]);

  const set = (patch: Partial<Design>) => setD((old) => ({ ...old, ...patch }));
  const fields = d.fields ?? [];
  const setField = (i: number, patch: Partial<Field>) => set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const thumbnail = d.thumbnail ?? defaults?.thumbnail ?? "none";
  const color = d.color ?? defaults?.color ?? 0x4cb4ff;

  const s = { user: t("@Neues Mitglied"), username: t("Neues Mitglied"), server: t("Dein Server"), membercount: "128", ...sample };
  // Erwähnungen werden für die Vorschau unsichtbar markiert, damit sie wie in Discord hervorgehoben werden.
  const render = (tItem: string) =>
    tItem.replace(/\{(user|username|server|membercount)\}/gi, (_, k: string) => {
      const v = s[k.toLowerCase() as keyof typeof s] ?? "";
      return k.toLowerCase() === "user" ? `\u2063${v}\u2063` : v;
    });
  const shown = render(text);
  const now = new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }).format(new Date());

  const json = JSON.stringify(d);

  return (
    <div className="embed-editor" ref={root}>
      <input type="hidden" name={name} value={json} />
      {asEmbed && (
        <details className="embed-design">
          <summary>{t("Karte gestalten")}</summary>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${id}-title`}>{t("Überschrift")}</label>
              <input id={`${id}-title`} type="text" maxLength={256} value={d.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="optional" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-color`}>{t("Farbe")}</label>
              <input id={`${id}-color`} type="color" value={hex(color)} onChange={(e) => set({ color: parseInt(e.target.value.slice(1), 16) })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-author`}>{t("Zeile über der Überschrift")}</label>
              <input id={`${id}-author`} type="text" maxLength={256} value={d.authorName ?? ""} onChange={(e) => set({ authorName: e.target.value })} placeholder="optional" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-footer`}>{t("Fußzeile")}</label>
              <input id={`${id}-footer`} type="text" maxLength={2048} value={d.footer ?? ""} onChange={(e) => set({ footer: e.target.value })} placeholder="optional" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-thumb`}>{t("Kleines Bild oben rechts")}</label>
              <select id={`${id}-thumb`} value={thumbnail} onChange={(e) => set({ thumbnail: e.target.value as Design["thumbnail"] })}>
                <option value="avatar">{t("Profilbild der Person")}</option>
                <option value="none">{t("Kein Bild")}</option>
                <option value="url">{t("Eigenes Bild (Adresse)")}</option>
              </select>
            </div>
            {thumbnail === "url" && (
              <div className="field">
                <label htmlFor={`${id}-thumburl`}>{t("Adresse des kleinen Bildes")}</label>
                <input id={`${id}-thumburl`} type="url" value={d.thumbnailUrl ?? ""} onChange={(e) => set({ thumbnailUrl: e.target.value })} placeholder="https://…" />
              </div>
            )}
            <div className="field">
              <label htmlFor={`${id}-image`}>{t("Großes Bild unten (Adresse)")}</label>
              <input id={`${id}-image`} type="url" value={d.imageUrl ?? ""} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://… (optional)" />
            </div>
            <label className="check-inline">
              <input type="checkbox" checked={d.timestamp ?? false} onChange={(e) => set({ timestamp: e.target.checked })} /> {" "}{t("Uhrzeit in der Fußzeile")}</label>
          </div>
          <div className="embed-fields">
            {fields.map((f, i) => (
              <div className="embed-field-row" key={i}>
                <input type="text" aria-label={t("Feld {n0}: Name", { n0: i + 1 })} placeholder={t("Name")} maxLength={256} value={f.name} onChange={(e) => setField(i, { name: e.target.value })} />
                <input type="text" aria-label={t("Feld {n0}: Inhalt", { n0: i + 1 })} placeholder={t("Inhalt")} maxLength={1024} value={f.value} onChange={(e) => setField(i, { value: e.target.value })} />
                <label className="check-inline">
                  <input type="checkbox" checked={f.inline ?? false} onChange={(e) => setField(i, { inline: e.target.checked })} /> {" "}{t("nebeneinander")}</label>
                <button type="button" className="danger small" aria-label={t("Feld {n0} entfernen", { n0: i + 1 })} onClick={() => set({ fields: fields.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            {fields.length < 10 && (
              <button type="button" className="secondary small" onClick={() => set({ fields: [...fields, { name: "", value: "" }] })}>
                {t("+ Feld hinzufügen")}</button>
            )}
          </div>
          {placeholders && <div className="hint">{t("Platzhalter wie")}{" "}{"{user}"}, {"{server}"} {" "}{t("und")}{" "}{"{membercount}"} {" "}{t("gehen in allen Texten der Karte.")}</div>}
        </details>
      )}

      <div className="dc-preview" aria-label={t("Vorschau")}>
        <div className="dc-label">{t("Vorschau")}</div>
        <div className="dc-message">
          <div className="dc-avatar" aria-hidden="true">L</div>
          <div className="dc-body">
            <div className="dc-head">
              <strong>{t("Libremod")}</strong> <span className="dc-bot">{t("APP")}</span> <span className="dc-time">{t("heute um")}{" "}{now}</span>
            </div>
            {!asEmbed ? (
              <div className="dc-text">{shown.trim() ? <Rich text={shown} /> : <span className="muted">{t("Noch kein Text")}</span>}</div>
            ) : (
              <div className="dc-embed" style={{ borderLeftColor: hex(color) }}>
                <div className="dc-embed-main">
                  {d.authorName && <div className="dc-author">{render(d.authorName)}</div>}
                  {d.title && <div className="dc-title">{render(d.title)}</div>}
                  {shown.trim() && (
                    <div className="dc-desc">
                      <Rich text={shown} />
                    </div>
                  )}
                  {fields.some((f) => f.name || f.value) && (
                    <div className="dc-fields">
                      {fields.map((f, i) => (
                        <div key={i} className={f.inline ? "dc-field inline" : "dc-field"}>
                          <div className="dc-field-name">{render(f.name)}</div>
                          <div className="dc-field-value">
                            <Rich text={render(f.value)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.imageUrl && /^https:\/\//.test(d.imageUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dc-image" src={d.imageUrl} alt="" referrerPolicy="no-referrer" />
                  )}
                  {(d.footer || d.timestamp) && (
                    <div className="dc-footer">
                      {d.footer ? render(d.footer) : ""}
                      {d.footer && d.timestamp ? " • " : ""}
                      {d.timestamp ? t("heute um {now}", { now }) : ""}
                    </div>
                  )}
                </div>
                {thumbnail === "avatar" && <div className="dc-thumb dc-thumb-avatar" aria-hidden="true" />}
                {thumbnail === "url" && d.thumbnailUrl && /^https:\/\//.test(d.thumbnailUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dc-thumb" src={d.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
