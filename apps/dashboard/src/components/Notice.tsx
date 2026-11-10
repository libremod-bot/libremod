export function Notice({ saved, error }: { saved?: string; error?: string }) {
  if (error) return <div className="notice error">{error}</div>;
  if (saved) return <div className="notice">Gespeichert. Libremod übernimmt die Änderung sofort.</div>;
  return null;
}
