import { count, eq, verificationPending, verificationSettings } from "@libremod/db";
import { VERIFY_MODES } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getBotTopPosition, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { saveVerification } from "../actions";

export const metadata = { title: "Verifizierung · Libremod" };

export default async function VerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "verification");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [[s], [pending], channels, roles, botTop] = await Promise.all([
    db.select().from(verificationSettings).where(eq(verificationSettings.guildId, guildId)),
    db.select({ n: count() }).from(verificationPending).where(eq(verificationPending.guildId, guildId)),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
  ]);
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const assignable = roles.filter((r) => r.position < botTop);
  const mode = s?.mode ?? "button";
  const channelOptions = textChannels.map((c) => (
    <option key={c.id} value={c.id}>
      #{c.name}
    </option>
  ));
  const roleOptions = assignable.map((r) => (
    <option key={r.id} value={r.id}>
      @{r.name}
    </option>
  ));

  return (
    <>
      <PageHeader
        icon="usercheck"
        title="Verifizierung"
        description="Neue Mitglieder bestätigen erst per Knopf, dass sie echte Menschen sind. Erst danach bekommen sie eine Rolle, mit der sie den Server sehen."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveVerification.bind(null, guildId)} className="stack">
        <div className="card">
          <Switch
            name="enabled"
            defaultChecked={s?.enabled ?? false}
            label="Verifizierung"
            description="Libremod postet im gewählten Kanal eine Nachricht mit einem Knopf „Verifizieren“. Von Hand geht es mit /verify."
          />
          {s?.enabled && (pending?.n ?? 0) > 0 && (
            <p className="small muted" style={{ margin: ".75rem 0 0" }}>
              {pending!.n} {pending!.n === 1 ? "Mitglied wartet" : "Mitglieder warten"} gerade auf die Verifizierung.
            </p>
          )}
        </div>

        <section className="card">
          <div className="card-title">
            <Icon name="usercheck" />
            <h2>Ablauf</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="channelId">Kanal für den Knopf</label>
              <select id="channelId" name="channelId" defaultValue={s?.channelId ?? ""}>
                <option value="">Kanal wählen …</option>
                {channelOptions}
              </select>
            </div>
            <div>
              <label htmlFor="roleId">Rolle für Verifizierte</label>
              <select id="roleId" name="roleId" defaultValue={s?.roleId ?? ""}>
                <option value="">Rolle wählen …</option>
                {roleOptions}
              </select>
            </div>
            <div>
              <label htmlFor="unverifiedRoleId">Rolle bis zur Verifizierung</label>
              <select id="unverifiedRoleId" name="unverifiedRoleId" defaultValue={s?.unverifiedRoleId ?? ""}>
                <option value="">Keine</option>
                {roleOptions}
              </select>
            </div>
          </div>
          <div className="hint">
            Richte die Kanalrechte so ein, dass @everyone nur den Verifizierungs-Kanal sieht und die Rolle für Verifizierte den Rest. Alternativ
            sperrst du mit der Rolle „bis zur Verifizierung“ gezielt Kanäle. Libremod nimmt sie nach dem Bestätigen wieder weg.
          </div>

          <fieldset className="radio-cards" style={{ marginTop: "1rem" }}>
            <legend>Wie wird bestätigt?</legend>
            {VERIFY_MODES.map((m) => (
              <label key={m.value} className="radio-card">
                <input type="radio" name="mode" value={m.value} defaultChecked={mode === m.value} />
                <span>
                  <strong>{m.label}</strong>
                  <span className="small muted">{m.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid-2" style={{ marginTop: "1rem", alignItems: "start" }}>
            <div>
              <label htmlFor="question">Frage (nur bei „Eigene Frage“)</label>
              <input id="question" name="question" type="text" maxLength={45} defaultValue={s?.question ?? ""} placeholder="z. B. Welches Tier steht in Regel 3?" />
              <div className="hint">Höchstens 45 Zeichen, mehr erlaubt Discord in Formularen nicht.</div>
            </div>
            <div>
              <label htmlFor="answers">Richtige Antworten</label>
              <textarea id="answers" name="answers" rows={3} defaultValue={(s?.answers ?? []).join("\n")} placeholder={"Pinguin\nPinguine"} />
              <div className="hint">Eine pro Zeile. Groß- und Kleinschreibung sowie Satzzeichen am Ende sind egal.</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="shield" />
            <h2>Zusätzlicher Schutz</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="minAccountAgeDays">Mindestalter des Kontos (Tage)</label>
              <input id="minAccountAgeDays" name="minAccountAgeDays" type="number" min={0} max={365} defaultValue={s?.minAccountAgeDays ?? 0} />
            </div>
            <div>
              <label htmlFor="kickAfterHours">Kicken nach Stunden ohne Bestätigung</label>
              <input id="kickAfterHours" name="kickAfterHours" type="number" min={0} max={720} defaultValue={s?.kickAfterHours ?? 0} />
            </div>
            <div>
              <label htmlFor="logChannelId">Log-Kanal</label>
              <select id="logChannelId" name="logChannelId" defaultValue={s?.logChannelId ?? ""}>
                <option value="">Kein Log</option>
                {channelOptions}
              </select>
            </div>
          </div>
          <div className="hint">
            0 schaltet die beiden Grenzen aus. Brandneue Konten sind ein typisches Zeichen für Spam- und Raid-Konten. Nach drei falschen
            Antworten muss man zehn Minuten warten.
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="message" />
            <h2>Nachricht mit dem Knopf</h2>
          </div>
          <label htmlFor="title">Titel</label>
          <input id="title" name="title" type="text" maxLength={256} defaultValue={s?.title ?? "Willkommen! Bitte kurz bestätigen"} />
          <label htmlFor="description">Text (leer = passender Standardtext)</label>
          <textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={s?.description ?? ""} />
        </section>

        <div className="savebar">
          <span className="small muted">Beim Speichern wird die Nachricht gepostet oder aktualisiert.</span>
          <button type="submit">Speichern</button>
        </div>
      </form>
    </>
  );
}
