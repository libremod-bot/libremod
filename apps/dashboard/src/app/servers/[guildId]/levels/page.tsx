import { asc, desc, economySettings, eq, levelMultipliers, levelNoXp, levelRewards, levelSeasons, levelSettings, memberXp } from "@libremod/db";
import { levelProgress, MAX_XP_PERCENT, SEASON_MODES, totalXpForLevel } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import {
  CHANNEL_ANNOUNCEMENT,
  CHANNEL_CATEGORY,
  CHANNEL_TEXT,
  getBotTopPosition,
  getGuildChannels,
  getGuildRoles,
  getMembers,
} from "@/lib/discord";
import { addLevelMultiplier, addLevelReward, endSeasonNow, removeLevelMultiplier, removeLevelReward, saveLevels } from "../actions";

export const metadata = { title: "Level · Libremod" };

const nf = new Intl.NumberFormat("de-DE");
const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export default async function LevelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { gespeichert, fehler } = await searchParams;

  const { db } = database();
  const [[s], rewards, noXp, top, channels, roles, botTop, multipliers, seasons, [eco]] = await Promise.all([
    db.select().from(levelSettings).where(eq(levelSettings.guildId, guildId)),
    db.select().from(levelRewards).where(eq(levelRewards.guildId, guildId)).orderBy(asc(levelRewards.level)),
    db.select().from(levelNoXp).where(eq(levelNoXp.guildId, guildId)),
    db.select().from(memberXp).where(eq(memberXp.guildId, guildId)).orderBy(desc(memberXp.xp)).limit(25),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
    getBotTopPosition(guildId),
    db.select().from(levelMultipliers).where(eq(levelMultipliers.guildId, guildId)).orderBy(desc(levelMultipliers.percent)),
    db.select().from(levelSeasons).where(eq(levelSeasons.guildId, guildId)).orderBy(desc(levelSeasons.number)).limit(6),
    db.select({ enabled: economySettings.enabled, currency: economySettings.currencyName }).from(economySettings).where(eq(economySettings.guildId, guildId)),
  ]);
  const seasonUsers = seasons.flatMap((x) => x.top.slice(0, 3).map((t) => t.userId));
  const [members, seasonPeople] = await Promise.all([
    getMembers(
      guildId,
      top.map((t) => t.userId),
    ),
    getMembers(guildId, [...new Set(seasonUsers)]),
  ]);
  const personName = (id: string) => seasonPeople.find((p) => p.id === id)?.name ?? "Unbekannt";
  const seasonsOn = (s?.seasonMode ?? "off") !== "off";
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "gelöschte Rolle";
  const noXpRoles = noXp.filter((n) => n.kind === "role").map((n) => n.targetId);
  const noXpChannels = noXp.filter((n) => n.kind === "channel").map((n) => n.targetId);

  return (
    <>
      <PageHeader
        icon="steps"
        title="Level"
        description="Mitglieder sammeln XP für Nachrichten und Zeit im Sprachkanal, steigen im Level auf und bekommen Rollen als Belohnung."
      />
      <Notice saved={gespeichert} error={fehler} />

      <form action={saveLevels.bind(null, guildId)} className="stack">
        <div className="card">
          <Switch
            name="enabled"
            defaultChecked={s?.enabled ?? false}
            label="Level-System"
            description="Hauptschalter. Mitglieder sehen ihr Level mit /rank und die Bestenliste mit /leaderboard."
          />
        </div>

        <section className="card">
          <div className="card-title">
            <Icon name="message" />
            <h2>XP sammeln</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="textXpMin">XP pro Nachricht, mindestens</label>
              <input id="textXpMin" name="textXpMin" type="number" min={0} max={1000} defaultValue={s?.textXpMin ?? 15} />
            </div>
            <div>
              <label htmlFor="textXpMax">… höchstens</label>
              <input id="textXpMax" name="textXpMax" type="number" min={0} max={1000} defaultValue={s?.textXpMax ?? 25} />
            </div>
            <div>
              <label htmlFor="cooldownSeconds">Wartezeit in Sekunden</label>
              <input id="cooldownSeconds" name="cooldownSeconds" type="number" min={0} max={3600} defaultValue={s?.cooldownSeconds ?? 60} />
            </div>
            <div>
              <label htmlFor="voiceXpPerMinute">XP pro Minute im Sprachkanal</label>
              <input id="voiceXpPerMinute" name="voiceXpPerMinute" type="number" min={0} max={1000} defaultValue={s?.voiceXpPerMinute ?? 10} />
            </div>
          </div>
          <div className="hint">
            Pro Wartezeit zählt nur eine Nachricht, Spam lohnt sich also nicht. Sprach-XP gibt es nur mit mindestens einer weiteren Person im Kanal,
            nicht im AFK-Kanal und nicht bei Taubschaltung. 0 schaltet Sprach-XP aus. Level 1 gibt es ab 100 XP, Level 10 ab{" "}
            {nf.format(totalXpForLevel(10))} XP.
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="sparkle" />
            <h2>Bonus, Münzen und Aussehen</h2>
          </div>
          <div className="grid-3">
            <div>
              <label htmlFor="weekendPercent">XP am Wochenende in %</label>
              <input id="weekendPercent" name="weekendPercent" type="number" min={0} max={MAX_XP_PERCENT} defaultValue={s?.weekendPercent ?? 100} />
            </div>
            <div>
              <label htmlFor="levelUpCoins">Münzen pro Level-Aufstieg</label>
              <input id="levelUpCoins" name="levelUpCoins" type="number" min={0} max={1000000} defaultValue={s?.levelUpCoins ?? 0} />
            </div>
            <div>
              <label htmlFor="cardColor">Farbe der Rang-Karte</label>
              <input id="cardColor" name="cardColor" type="color" defaultValue={hex(s?.cardColor ?? 0x4cb4ff)} />
            </div>
          </div>
          <div className="hint">
            100 % heißt normal, 200 % doppelte XP am Samstag und Sonntag. Münzen gibt es nur, wenn{" "}
            <a href={`/servers/${guildId}/economy`}>Währung &amp; Shop</a> eingeschaltet ist
            {eco?.enabled ? "" : " (gerade aus)"}. Die Karte zeigt /rank als Bild.
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="steps" />
            <h2>Level-Aufstieg verkünden</h2>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="announce">Wo?</label>
              <select id="announce" name="announce" defaultValue={s?.announce ?? "same"}>
                <option value="same">Im Kanal der letzten Nachricht</option>
                <option value="channel">In einem festen Kanal</option>
                <option value="dm">Per Direktnachricht</option>
                <option value="off">Gar nicht</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="announceChannelId">Fester Kanal</label>
              <select id="announceChannelId" name="announceChannelId" defaultValue={s?.announceChannelId ?? ""}>
                <option value="">Keiner</option>
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="announceMessage">Text</label>
            <input
              id="announceMessage"
              name="announceMessage"
              type="text"
              maxLength={500}
              defaultValue={s?.announceMessage ?? "Glückwunsch {user}, du bist jetzt **Level {level}**!"}
            />
            <div className="hint">
              Platzhalter: {"{user}"}, {"{username}"}, {"{level}"}, {"{server}"}, {"{coins}"} (Münzen für diesen Aufstieg).
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="clock" />
            <h2>Saisons</h2>
          </div>
          <p className="card-sub">
            Am Ende jeder Saison landen die besten 10 in der Ruhmeshalle und alle fangen wieder bei 0 XP an. Belohnungsrollen bleiben.
          </p>
          <fieldset className="radio-cards" aria-label="Saisons">
            {SEASON_MODES.map((m) => (
              <label key={m.value} className="radio-card">
                <input type="radio" name="seasonMode" value={m.value} defaultChecked={(s?.seasonMode ?? "off") === m.value} />
                <span>
                  <strong>{m.label}</strong>
                  <span className="small muted">
                    {m.value === "off" ? "XP sammeln sich für immer" : m.value === "monthly" ? "Neustart am 1. jedes Monats" : "Neustart am 1. Januar, April, Juli und Oktober"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="hint">Das Ende wird im festen Kanal für Level-Aufstiege verkündet, falls einer gewählt ist.</div>
        </section>

        <section className="card">
          <div className="card-title">
            <Icon name="users" />
            <h2>Keine XP</h2>
          </div>
          <p className="card-sub">Zum Beispiel für Spam- oder Bot-Kanäle. Mehrfachauswahl mit Strg bzw. Cmd.</p>
          <div className="grid-3">
            <div>
              <label htmlFor="noXpRoles">Rollen</label>
              <select id="noXpRoles" name="noXpRoles" multiple defaultValue={noXpRoles}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="noXpChannels">Kanäle und Kategorien</label>
              <select id="noXpChannels" name="noXpChannels" multiple defaultValue={noXpChannels}>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === CHANNEL_CATEGORY ? `▸ ${c.name}` : `#${c.name}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="savebar">
          <label className="check-inline" style={{ padding: 0 }}>
            <input type="checkbox" name="stackRewards" defaultChecked={s?.stackRewards ?? true} />
            Frühere Belohnungsrollen behalten
          </label>
          <button type="submit">Speichern</button>
        </div>
      </form>

      <section className="card">
        <div className="card-title">
          <Icon name="tag" />
          <h2>Rollenbelohnungen</h2>
        </div>
        <p className="card-sub">Ab einem Level bekommt das Mitglied automatisch eine Rolle. Gilt auch rückwirkend beim nächsten Aufstieg.</p>
        {rewards.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Ab Level</th>
                  <th>Rolle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.level}>
                    <td>
                      <strong>{r.level}</strong>
                    </td>
                    <td>
                      <span className="badge info">@{roleName(r.roleId)}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={removeLevelReward.bind(null, guildId, r.level)}>
                        <button className="danger small" type="submit">
                          Entfernen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch keine Belohnungen.
          </p>
        )}
        <form action={addLevelReward.bind(null, guildId)}>
          <div className="grid-3">
            <div>
              <label htmlFor="rewardLevel">Ab Level</label>
              <input id="rewardLevel" name="level" type="number" min={1} max={500} required placeholder="10" />
            </div>
            <div>
              <label htmlFor="rewardRole">Rolle</label>
              <select id="rewardRole" name="roleId" required defaultValue="">
                <option value="" disabled>
                  Rolle wählen …
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.position >= botTop}>
                    @{r.name}
                    {r.position >= botTop ? " (steht über Libremod)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> Belohnung hinzufügen
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-title">
          <Icon name="sparkle" />
          <h2>Bonus-Rollen</h2>
        </div>
        <p className="card-sub">Mitglieder mit dieser Rolle bekommen mehr oder weniger XP, zum Beispiel Booster 150 %. Hat jemand mehrere, zählt die höchste.</p>
        {multipliers.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: "1.25rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Rolle</th>
                  <th>XP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {multipliers.map((m) => (
                  <tr key={m.roleId}>
                    <td>
                      <span className="badge info">@{roleName(m.roleId)}</span>
                    </td>
                    <td>
                      <strong>{m.percent} %</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={removeLevelMultiplier.bind(null, guildId, m.roleId)}>
                        <button className="danger small" type="submit">
                          Entfernen
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty" style={{ paddingTop: 0 }}>
            Noch keine Bonus-Rollen.
          </p>
        )}
        <form action={addLevelMultiplier.bind(null, guildId)}>
          <div className="grid-3">
            <div>
              <label htmlFor="multRole">Rolle</label>
              <select id="multRole" name="roleId" required defaultValue="">
                <option value="" disabled>
                  Rolle wählen …
                </option>
                {roles
                  .filter((r) => r.id !== guildId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="multPercent">XP in %</label>
              <input id="multPercent" name="percent" type="number" min={0} max={MAX_XP_PERCENT} required placeholder="150" />
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="secondary">
              <Icon name="plus" size={16} /> Bonus-Rolle hinzufügen
            </button>
          </div>
        </form>
      </section>

      {(seasonsOn || seasons.length > 0) && (
        <section className="card">
          <div className="card-title">
            <Icon name="star" />
            <h2>Ruhmeshalle</h2>
          </div>
          {seasonsOn && s && (
            <div className="inline-form" style={{ marginBottom: "1rem" }}>
              <span>
                Saison <strong>{s.seasonNumber}</strong> läuft seit {day.format(s.seasonStartedAt)}.
              </span>
              <form action={endSeasonNow.bind(null, guildId, s.seasonNumber)}>
                <button type="submit" className="danger small">
                  Saison jetzt beenden
                </button>
              </form>
            </div>
          )}
          {seasons.length === 0 ? (
            <p className="empty" style={{ paddingTop: 0 }}>
              Noch keine Saison abgeschlossen.
            </p>
          ) : (
            <ul className="season-list">
              {seasons.map((x) => (
                <li key={x.id}>
                  <div>
                    <strong>Saison {x.number}</strong>{" "}
                    <span className="small muted">
                      {day.format(x.startedAt)} bis {day.format(x.endedAt)}
                    </span>
                  </div>
                  <div className="small">
                    {x.top.length === 0
                      ? "Niemand hat XP gesammelt."
                      : x.top
                          .slice(0, 3)
                          .map((t, i) => `${["🥇", "🥈", "🥉"][i]} ${personName(t.userId)} (${nf.format(t.xp)} XP)`)
                          .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="hint">Die ganze Liste einer Saison zeigt /leaderboard saison:Nummer.</div>
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <Icon name="list" />
          <h2>Rangliste</h2>
        </div>
        {top.length === 0 ? (
          <p className="empty">Noch hat niemand XP gesammelt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mitglied</th>
                  <th>Level</th>
                  <th>XP</th>
                  <th>Fortschritt</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t, i) => {
                  const m = members[i]!;
                  const p = levelProgress(t.xp);
                  return (
                    <tr key={t.userId}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <span className="member">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.avatar} alt="" width={24} height={24} />
                          {m.name}
                        </span>
                      </td>
                      <td>
                        <strong>{p.level}</strong>
                      </td>
                      <td>{nf.format(t.xp)}</td>
                      <td style={{ minWidth: 120 }}>
                        <div className="progress small-progress" title={`${nf.format(p.current)} / ${nf.format(p.needed)} XP`}>
                          <span style={{ width: `${Math.round((p.current / p.needed) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint">XP einzelner Mitglieder änderst du in Discord mit /xp add, /xp remove, /xp set oder /xp reset.</div>
      </section>
    </>
  );
}
