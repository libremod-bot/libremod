import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  if (await getUser()) redirect("/servers");
  const { fehler } = await searchParams;

  return (
    <section className="hero">
      <h1>Libremod Dashboard</h1>
      <p className="muted">
        Moderation, Auto-Mod und Fallakte für deinen Discord-Server. Kostenlos, ohne Premium-Stufen, quelloffen.
      </p>
      {fehler && <div className="notice error">Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.</div>}
      <a className="button" href="/api/auth/login">
        Mit Discord anmelden
      </a>
      <p className="small muted" style={{ marginTop: "1.5rem" }}>
        Wir fragen nur deinen Namen und deine Server-Liste ab, um zu zeigen, welche Server du verwalten darfst.
      </p>
    </section>
  );
}
