import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function Home({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (await getUser()) redirect("/servers");
  const { fehler } = await searchParams;

  return (
    <section className="hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hero-logo" src="/logo-emblem.webp" alt="Libremod-Logo" width={200} height={200} />
      <span className="badge info">{t("100 % kostenlos · Open Source")}</span>
      <h1>{t("Dein Server, gut geschützt.")}</h1>
      <p className="lead">
        {t("Moderation, Auto-Mod und Fallakte für Discord. Alle Funktionen für alle, ohne Premium-Stufen.")}</p>
      <div className="hero-features">
        <span className="badge">{t("Bans & Timeouts")}</span>
        <span className="badge">{t("Spam- & Linkfilter")}</span>
        <span className="badge">{t("Wortfilter")}</span>
        <span className="badge">{t("Raid-Schutz")}</span>
        <span className="badge">{t("Fallakte")}</span>
      </div>
      {fehler && <div className="toast error">{t("Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.")}</div>}
      <a className="button big" href="/api/auth/login">
        {t("Mit Discord anmelden")}</a>
      <p className="small muted">
        {t("Wir fragen nur deinen Namen und deine Server-Liste ab, um zu zeigen, welche Server du verwalten darfst.")}</p>
    </section>
  );
}
