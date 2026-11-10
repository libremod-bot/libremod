import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (await getUser()) redirect("/servers");
  const { fehler } = await searchParams;

  return (
    <section className="hero">
      <span className="badge info">100 % kostenlos · Open Source</span>
      <h1>Dein Server, gut geschützt.</h1>
      <p className="lead">
        Moderation, Auto-Mod und Fallakte für Discord. Alle Funktionen für alle, ohne Premium-Stufen.
      </p>
      <div className="hero-features">
        <span className="badge">Bans &amp; Timeouts</span>
        <span className="badge">Spam- &amp; Linkfilter</span>
        <span className="badge">Wortfilter</span>
        <span className="badge">Raid-Schutz</span>
        <span className="badge">Fallakte</span>
      </div>
      {fehler && <div className="toast error">Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.</div>}
      <a className="button big" href="/api/auth/login">
        Mit Discord anmelden
      </a>
      <p className="small muted">
        Wir fragen nur deinen Namen und deine Server-Liste ab, um zu zeigen, welche Server du verwalten darfst.
      </p>
    </section>
  );
}
