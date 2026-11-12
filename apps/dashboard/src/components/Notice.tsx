import { t } from "@/lib/i18n";
export function Notice({ saved, error }: { saved?: string; error?: string }) {
  if (error)
    return (
      <div className="toast error" role="alert">
        {error}
      </div>
    );
  if (saved)
    return (
      <div className="toast" role="status">
        {t("Gespeichert. Libremod übernimmt die Änderung sofort.")}</div>
    );
  return null;
}
