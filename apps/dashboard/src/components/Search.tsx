"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AREAS } from "@/lib/areas";
import { AREA_KEYWORDS, normalize, score, type SearchEntry } from "@/lib/search";
import { useT } from "./I18n";
import { Icon } from "./Icon";

/**
 * Schnellsuche über alle Bereiche eines Servers. Öffnet sich mit Strg+K (Mac: Cmd+K), mit „/“
 * oder über den Knopf in der Seitenleiste. Pfeiltasten wählen, Enter öffnet, Esc schließt.
 */
export function Search({ guildId, allowed }: { guildId: string; allowed: string[] | null }) {
  const t = useT();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(0);
  const [mac, setMac] = useState(false);

  const entries = useMemo<SearchEntry[]>(() => {
    const base = `/servers/${guildId}`;
    const list: SearchEntry[] = [
      { title: t("Übersicht"), hint: t("Start"), href: base, haystack: "ubersicht overview start home dashboard" },
    ];
    for (const a of AREAS) {
      if (allowed && !allowed.includes(a.key)) continue;
      const title = t(a.label);
      list.push({
        title,
        hint: t(a.group),
        href: `${base}/${a.key}`,
        haystack: normalize(`${a.label} ${title} ${t(a.group)} ${AREA_KEYWORDS[a.key]}`),
      });
    }
    if (!allowed) {
      list.push({
        title: t("Einrichtungs-Assistent"),
        hint: t("Start"),
        href: `${base}/setup`,
        haystack: normalize(`${t("Einrichtungs-Assistent")} einrichten assistent wizard setup vorlage preset schnellstart quick start`),
      });
    }
    list.push({ title: t("Alle Server"), hint: t("Wechseln"), href: "/servers", haystack: "server wechseln switch alle all" });
    return list;
  }, [guildId, allowed, t]);

  const results = useMemo(
    () =>
      entries
        .map((e) => ({ e, s: score(e, query) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.e)
        .slice(0, 12),
    [entries, query],
  );

  const open = () => {
    setQuery("");
    setPos(0);
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  };
  const close = () => dialog.current?.close();
  const go = (href: string) => {
    close();
    router.push(href);
  };

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (dialog.current?.open) close();
        else open();
      } else if (e.key === "/" && !typing && !dialog.current?.open) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPos((p) => Math.min(p + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPos((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter" && results[pos]) {
      e.preventDefault();
      go(results[pos].href);
    }
  };

  return (
    <>
      <button type="button" className="search-open" onClick={open}>
        <Icon name="search" size={16} />
        <span>{t("Suchen …")}</span>
        <kbd>{mac ? "⌘K" : t("Strg K")}</kbd>
      </button>
      <dialog
        ref={dialog}
        className="search-dialog"
        aria-label={t("Suche")}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="search-field">
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPos(0);
            }}
            onKeyDown={onInputKey}
            placeholder={t("Wonach suchst du? Zum Beispiel Spam, Willkommen oder Level")}
            aria-label={t("Suchbegriff")}
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={results[pos] ? `search-${pos}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="icon-button" onClick={close} aria-label={t("Schließen")}>
            <Icon name="x" />
          </button>
        </div>
        {results.length ? (
          <ul className="search-results" id="search-results" role="listbox">
            {results.map((r, i) => (
              <li
                key={r.href}
                id={`search-${i}`}
                role="option"
                aria-selected={i === pos}
                onMouseMove={() => setPos(i)}
                onClick={() => go(r.href)}
              >
                <span>{r.title}</span>
                <span className="muted small">{r.hint}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="search-empty muted">{t("Nichts gefunden. Versuch es mit einem anderen Wort.")}</p>
        )}
        <p className="search-help small muted">{t("Pfeiltasten zum Auswählen, Enter zum Öffnen, Esc zum Schließen")}</p>
      </dialog>
    </>
  );
}
