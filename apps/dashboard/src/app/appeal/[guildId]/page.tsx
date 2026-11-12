import { notFound } from "next/navigation";
import { and, appealSettings, banAppeals, desc, eq } from "@libremod/db";
import { APPEAL_MAX_LENGTH, APPEAL_MIN_LENGTH, appealBlocker } from "@libremod/shared";
import { database } from "@/lib/db";
import { botIsInGuild, getBan, getGuildInfo, guildIconUrl } from "@/lib/discord";
import { getUser } from "@/lib/session";
import { submitAppeal } from "./actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Einspruch gegen einen Ban") }) };
}

const when = dateFmt({ dateStyle: "long", timeZone: "Europe/Berlin" });
const STATUS: Record<string, string> = { open: "Liegt dem Team vor", accepted: "Angenommen", denied: "Abgelehnt" };

export default async function AppealPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ fehler?: string; gesendet?: string }>;
}) {
  const { guildId } = await params;
  if (!/^\d{17,20}$/.test(guildId) || !(await botIsInGuild(guildId))) notFound();
  const { fehler, gesendet } = await searchParams;
  const { db } = database();
  const [[s], guild, session] = await Promise.all([
    db.select().from(appealSettings).where(eq(appealSettings.guildId, guildId)),
    getGuildInfo(guildId),
    getUser(),
  ]);
  const icon = guildIconUrl(guild);

  const head = (
    <div className="appeal-head">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" width={64} height={64} />
      ) : (
        <div className="appeal-icon">{guild.name.slice(0, 2).toUpperCase()}</div>
      )}
      <div>
        <h1>{t("Einspruch gegen einen Ban")}</h1>
        <p className="muted">{guild.name}</p>
      </div>
    </div>
  );

  if (!s?.enabled) {
    return (
      <section className="card appeal">
        {head}
        <p>{t("Auf diesem Server kann man gerade keinen Einspruch einlegen. Wende dich bitte direkt an das Team.")}</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="card appeal">
        {head}
        <p>{t("Melde dich mit Discord an, damit das Team weiß, wer den Einspruch schreibt. Wir fragen nur deinen Namen ab.")}</p>
        <a className="button" href={`/api/auth/login?weiter=${encodeURIComponent(`/appeal/${guildId}`)}`}>
          {t("Mit Discord anmelden")}</a>
      </section>
    );
  }

  const [ban, previous] = await Promise.all([
    getBan(guildId, session.user.id),
    db
      .select()
      .from(banAppeals)
      .where(and(eq(banAppeals.guildId, guildId), eq(banAppeals.userId, session.user.id)))
      .orderBy(desc(banAppeals.createdAt))
      .limit(5),
  ]);
  const last = previous[0];
  const blocker = appealBlocker(previous, s.cooldownDays);

  return (
    <section className="card appeal">
      {head}
      {gesendet && <div className="toast">{t("Danke! Dein Einspruch ist beim Team. Du bekommst eine Direktnachricht, sobald entschieden ist.")}</div>}
      {fehler && <div className="toast error">{fehler}</div>}
      {last && (
        <div className="appeal-last">
          <strong>{t("Dein letzter Einspruch")}</strong> {" "}{t("vom")}{" "}{when.format(last.createdAt)}: {STATUS[last.status] ?? last.status}
          {last.reviewReason && <div className="small">{t("Begründung:")}{" "}{last.reviewReason}</div>}
        </div>
      )}
      {!ban ? (
        <p>{last?.status === "accepted" ? t("Dein Ban ist aufgehoben, du kannst wieder beitreten.") : t("Du bist auf diesem Server nicht gebannt. Hier gibt es nichts zu tun.")}</p>
      ) : blocker ? (
        <p>{blocker}</p>
      ) : (
        <form action={submitAppeal.bind(null, guildId)}>
          {ban.reason && <p className="small muted">{t("Grund für den Ban:")}{" "}{ban.reason.replace(/ \(durch \d+\)$/, "")}</p>}
          <label htmlFor="text">{s.question}</label>
          <textarea id="text" name="text" required minLength={APPEAL_MIN_LENGTH} maxLength={APPEAL_MAX_LENGTH} style={{ minHeight: 180 }} />
          <div className="hint">
            {t("Bleib sachlich und ehrlich. Mindestens")}{" "}{APPEAL_MIN_LENGTH} {" "}{t("Zeichen. Nach einer Ablehnung kannst du nach")}{" "}{s.cooldownDays} {" "}{t("Tagen einen neuen Einspruch stellen.")}</div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">{t("Einspruch absenden")}</button>
          </div>
        </form>
      )}
      <p className="small muted" style={{ marginTop: "1.5rem" }}>
        {t("Angemeldet als")}{" "}{session.user.username}.
      </p>
    </section>
  );
}
