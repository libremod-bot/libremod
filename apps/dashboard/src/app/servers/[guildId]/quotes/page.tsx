import { and, count, desc, eq, ilike, quotes } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getMembers } from "@/lib/discord";
import { deleteQuote } from "../actions";
import { t, dateFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Zitate") }) };
}

const when = dateFmt({ dateStyle: "short", timeZone: "Europe/Berlin" });

export default async function QuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string; suche?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "quotes");
  const { gespeichert, fehler, suche } = await searchParams;
  const term = suche?.trim().slice(0, 100) ?? "";
  const { db } = database();
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const where = term ? and(eq(quotes.guildId, guildId), ilike(quotes.text, `%${escaped}%`)) : eq(quotes.guildId, guildId);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.select().from(quotes).where(where).orderBy(desc(quotes.number)).limit(50),
    db.select({ total: count() }).from(quotes).where(eq(quotes.guildId, guildId)),
  ]);
  const people = await getMembers(guildId, [...new Set(rows.flatMap((r) => (r.authorId ? [r.authorId] : [])))]);
  const who = (r: (typeof rows)[number]) => (r.authorId ? (people.find((p) => p.id === r.authorId)?.name ?? r.authorId) : (r.authorName ?? "Unbekannt"));

  return (
    <>
      <PageHeader
        icon="note"
        title={t("Zitate")}
        description={t("Lustige und denkwürdige Sätze aufheben: Rechtsklick auf eine Nachricht → Apps → Als Zitat speichern, oder /quote add. Mit /quote random kommt eins zurück.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      <section className="card">
        <div className="card-title">
          <Icon name="note" />
          <h2>{t("Gespeicherte Zitate")}</h2>
          <span className="badge info" style={{ marginLeft: "auto" }}>
            {total}
          </span>
        </div>
        <form className="inline-form" style={{ marginBottom: "1rem" }}>
          <input type="search" name="suche" defaultValue={term} placeholder={t("Im Text suchen …")} aria-label={t("Im Text suchen")} maxLength={100} />
          <button type="submit" className="secondary small">
            {t("Suchen")}</button>
        </form>
        {rows.length === 0 ? (
          <p className="empty" style={{ paddingTop: 0 }}>
            {term ? t("Nichts gefunden.") : t("Noch keine Zitate gespeichert.")}
          </p>
        ) : (
          <ul className="notes">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="quote-text">„{r.text}“</div>
                <div className="small muted">
                  #{r.number} · {who(r)} · {when.format(r.createdAt)}
                  {r.channelId && r.messageId && (
                    <>
                      {" · "}
                      <a href={`https://discord.com/channels/${guildId}/${r.channelId}/${r.messageId}`} target="_blank" rel="noreferrer">
                        {t("zur Nachricht")}</a>
                    </>
                  )}
                </div>
                <form action={deleteQuote.bind(null, guildId, r.id)}>
                  <button className="danger small" type="submit" aria-label={t("Zitat {number} löschen", { number: r.number })}>
                    <Icon name="trash" size={15} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
