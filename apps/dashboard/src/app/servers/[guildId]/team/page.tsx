import { dashboardTeamAccess, eq } from "@libremod/db";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { TEAM_AREAS } from "@/lib/areas";
import { database } from "@/lib/db";
import { getGuildRoles } from "@/lib/discord";
import { deleteTeamAccess, saveTeamAccess } from "../actions";
import { t, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Team-Zugänge") }) };
}

const GROUPS = [...new Set(TEAM_AREAS.map((a) => a.group))];

function AreaChecks({ picked }: { picked: string[] }) {
  return (
    <>
      {GROUPS.map((group) => (
        <fieldset key={t(group)} className="team-group">
          <legend>{t(group)}</legend>
          <div className="checks">
            {TEAM_AREAS.filter((a) => a.group === group).map((a) => (
              <label key={a.key} className="check-inline">
                <input type="checkbox" name="areas" value={a.key} defaultChecked={picked.includes(a.key)} /> {t(a.label)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "team");
  const { gespeichert, fehler } = await searchParams;
  const { db } = database();
  const [rules, roles] = await Promise.all([
    db.select().from(dashboardTeamAccess).where(eq(dashboardTeamAccess.guildId, guildId)),
    getGuildRoles(guildId),
  ]);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? t("gelöschte Rolle");
  const free = roles.filter((r) => r.id !== guildId && !r.managed && !rules.some((x) => x.roleId === r.id));

  return (
    <>
      <PageHeader
        icon="users"
        title={t("Team-Zugänge")}
        description={t("Gib Moderatoren und Helfern Zugriff auf einzelne Bereiche des Dashboards, ohne ihnen „Server verwalten“ zu geben. Wer die Rolle auf Discord hat, sieht nach dem Login nur die freigegebenen Bereiche.")}
      />
      <Notice saved={gespeichert} error={fehler} />

      {rules.map((r) => (
        <form key={r.roleId} action={saveTeamAccess.bind(null, guildId)} className="card">
          <input type="hidden" name="roleId" value={r.roleId} />
          <div className="card-title">
            <Icon name="users" />
            <h2>@{roleName(r.roleId)}</h2>
            <span className="badge info" style={{ marginLeft: "auto" }}>
              {r.areas.length} {r.areas.length === 1 ? "Bereich" : "Bereiche"}
            </span>
          </div>
          <AreaChecks picked={r.areas} />
          <div className="savebar">
            <button type="submit">{t("Speichern")}</button>
            <button className="danger" type="submit" formAction={deleteTeamAccess.bind(null, guildId, r.roleId)}>
              <Icon name="trash" size={15} /> {" "}{t("Zugang entfernen")}</button>
          </div>
        </form>
      ))}

      <form action={saveTeamAccess.bind(null, guildId)} className="card">
        <div className="card-title">
          <Icon name="plus" />
          <h2>{t("Rolle hinzufügen")}</h2>
        </div>
        <label htmlFor="roleId">{t("Rolle")}</label>
        <select id="roleId" name="roleId" required defaultValue="">
          <option value="" disabled>
            {t("Rolle wählen …")}</option>
          {free.map((r) => (
            <option key={r.id} value={r.id}>
              @{r.name}
            </option>
          ))}
        </select>
        <AreaChecks picked={[]} />
        <div className="hint">
          {t("Statistik, Team-Zugänge, Änderungsprotokoll sowie Export und Import bleiben immer Personen mit „Server verwalten“ vorbehalten. Jede Änderung über einen Team-Zugang steht im Änderungsprotokoll.")}</div>
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">
            <Icon name="plus" size={16} /> {" "}{t("Zugang anlegen")}</button>
        </div>
      </form>
    </>
  );
}
