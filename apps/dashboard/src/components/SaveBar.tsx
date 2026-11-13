"use client";

import { useEffect, useRef } from "react";
import { useT } from "./I18n";

/**
 * Speichern-Leiste am Ende eines Formulars. Sobald etwas geändert wurde, bekommt das Formular
 * data-dirty: Die Leiste schwebt dann am unteren Rand mit und bietet „Verwerfen“ an.
 */
export function SaveBar({ note, label, children }: { note?: React.ReactNode; label?: string; children?: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const dirty = () => form.setAttribute("data-dirty", "");
    const clean = () => form.removeAttribute("data-dirty");
    form.addEventListener("input", dirty);
    form.addEventListener("change", dirty);
    form.addEventListener("reset", clean);
    form.addEventListener("submit", clean);
    return () => {
      form.removeEventListener("input", dirty);
      form.removeEventListener("change", dirty);
      form.removeEventListener("reset", clean);
      form.removeEventListener("submit", clean);
    };
  }, []);
  return (
    <div className="savebar" ref={ref}>
      <span className="small">
        <span className="savebar-dirty">{t("Du hast ungespeicherte Änderungen.")}</span>
        <span className="savebar-clean muted">{note}</span>
      </span>
      {children}
      <span className="savebar-actions">
        <button type="reset" className="secondary savebar-discard">
          {t("Verwerfen")}
        </button>
        <button type="submit">{label ?? t("Speichern")}</button>
      </span>
    </div>
  );
}
