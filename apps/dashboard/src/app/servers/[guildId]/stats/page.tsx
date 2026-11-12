import Link from "next/link";
import { and, desc, eq, gte, sql, statsChannels, statsDaily, statsHours } from "@libremod/db";
import { berlinParts } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { getGuildChannels } from "@/lib/discord";
import { t, dateFmt, numFmt, initLocale } from "@/lib/i18n";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Statistik") }) };
}

const RANGES = [7, 30, 90, 365];
const nf = numFmt();
const dayLabel = dateFmt({ day: "2-digit", month: "2-digit", timeZone: "UTC" });
const longDay = dateFmt({ weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

function isoDay(d: Date) {
  const p = berlinParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function daysBack(n: number) {
  const out: string[] = [];
  const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

const W = 720;
const H = 180;
const PAD = { l: 44, r: 8, t: 10, b: 24 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/** Säulen für eine Zahl pro Tag, mit Tooltip pro Säule. */
function BarChart({ days, values, unit, label, width = W }: { days: string[]; values: number[]; unit: string; label: string; width?: number }) {
  const W = width;
  const max = niceMax(Math.max(0, ...values));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const step = iw / days.length;
  const bw = Math.min(48, Math.max(1, step - 2));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(days.length / (W < 500 ? 4 : 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t(label)}>
      {ticks.map((tItem) => (
        <g key={tItem}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(tItem)} y2={y(tItem)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(tItem) + 4} textAnchor="end" className="chart-axis">
            {nf.format(Math.round(tItem))}
          </text>
        </g>
      ))}
      {values.map((v, i) => {
        const x = PAD.l + i * step + (step - bw) / 2;
        const h = Math.max(0, PAD.t + ih - y(v));
        return (
          <g key={days[i]} className="chart-hit">
            <rect x={PAD.l + i * step} y={PAD.t} width={step} height={ih} fill="transparent" />
            {h > 0 && <rect x={x} y={y(v)} width={bw} height={h} rx={Math.min(4, bw / 2)} className="chart-bar" />}
            <title>{`${longDay.format(new Date(`${days[i]}T00:00:00Z`))}: ${nf.format(v)} ${unit}`}</title>
          </g>
        );
      })}
      {days.map((d, i) =>
        i % every === 0 ? (
          <text key={d} x={PAD.l + i * step + step / 2} y={H - 6} textAnchor="middle" className="chart-axis">
            {dayLabel.format(new Date(`${d}T00:00:00Z`))}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Linie für die Mitgliederzahl. Tage ohne Messung werden übersprungen. */
function LineChart({ days, values, label }: { days: string[]; values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return <p className="empty">{t("Noch keine Daten.")}</p>;
  let lo = Math.min(...known);
  let hi = Math.max(...known);
  if (hi - lo < 4) {
    lo = Math.max(0, lo - 2);
    hi = hi + 2;
  }
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const step = days.length > 1 ? iw / (days.length - 1) : 0;
  const x = (i: number) => PAD.l + i * step;
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  const every = Math.max(1, Math.ceil((days.length - 1) / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t(label)}>
      {[lo, (lo + hi) / 2, hi].map((tItem) => (
        <g key={tItem}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(tItem)} y2={y(tItem)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(tItem) + 4} textAnchor="end" className="chart-axis">
            {nf.format(Math.round(tItem))}
          </text>
        </g>
      ))}
      <polyline points={pts.join(" ")} className="chart-line" />
      {values.map((v, i) =>
        v === null ? null : (
          <g key={days[i]} className="chart-hit">
            <rect x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 6)} height={ih} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={4} className="chart-dot" />
            <title>{t("{n0}: {n1} Mitglieder", { n0: longDay.format(new Date(`${days[i]}T00:00:00Z`)), n1: nf.format(v) })}</title>
          </g>
        ),
      )}
      {days.map((d, i) =>
        i % every === 0 || i === days.length - 1 ? (
          <text key={d} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="chart-axis">
            {dayLabel.format(new Date(`${d}T00:00:00Z`))}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ tage?: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId, "stats");
  const { tage } = await searchParams;
  const range = RANGES.includes(Number(tage)) ? Number(tage) : 30;
  const days = daysBack(range);
  const from = days[0]!;
  const { db } = database();
  const [daily, channelRows, hourRows, channels] = await Promise.all([
    db.select().from(statsDaily).where(and(eq(statsDaily.guildId, guildId), gte(statsDaily.day, from))),
    db
      .select({ channelId: statsChannels.channelId, n: sql<number>`sum(${statsChannels.messages})::int` })
      .from(statsChannels)
      .where(and(eq(statsChannels.guildId, guildId), gte(statsChannels.day, from)))
      .groupBy(statsChannels.channelId)
      .orderBy(desc(sql`sum(${statsChannels.messages})`))
      .limit(10),
    db
      .select({ hour: statsHours.hour, n: sql<number>`sum(${statsHours.messages})::int` })
      .from(statsHours)
      .where(and(eq(statsHours.guildId, guildId), gte(statsHours.day, from)))
      .groupBy(statsHours.hour),
    getGuildChannels(guildId),
  ]);
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const messages = days.map((d) => byDay.get(d)?.messages ?? 0);
  const joins = days.map((d) => byDay.get(d)?.joins ?? 0);
  const leaves = days.map((d) => byDay.get(d)?.leaves ?? 0);
  const members = days.map((d) => byDay.get(d)?.members || null);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const firstMembers = members.find((m) => m !== null) ?? null;
  const lastMembers = [...members].reverse().find((m) => m !== null) ?? null;
  const growth = firstMembers !== null && lastMembers !== null ? lastMembers - firstMembers : null;
  const hours = Array.from({ length: 24 }, (_, h) => hourRows.find((r) => r.hour === h)?.n ?? 0);
  const busiest = sum(hours) ? hours.indexOf(Math.max(...hours)) : null;
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? t("gelöschter Kanal");
  const topMax = Math.max(1, ...channelRows.map((c) => c.n));
  const base = `/servers/${guildId}/stats`;
  const empty = daily.length === 0;

  return (
    <>
      <PageHeader
        icon="gauge"
        title={t("Statistik")}
        description={t("Wie sich dein Server entwickelt. Libremod zählt nur Nachrichten, Beitritte und Abgänge, ohne zu speichern, wer was geschrieben hat.")}
      />

      <div className="chips" role="group" aria-label={t("Zeitraum")}>
        {RANGES.map((r) => (
          <Link key={r} href={`${base}?tage=${r}`} className="chip" aria-current={r === range ? "page" : undefined}>
            {r === 365 ? t("1 Jahr") : t("{r} Tage", { r })}
          </Link>
        ))}
      </div>

      {empty ? (
        <div className="card empty">
          {t("Noch keine Daten für diesen Zeitraum. Libremod sammelt ab jetzt, die ersten Zahlen erscheinen nach wenigen Minuten.")}</div>
      ) : (
        <>
          <div className="stats">
            <div className="card stat">
              <div className="stat-label">{t("Mitglieder")}</div>
              <div className="stat-value">{lastMembers !== null ? nf.format(lastMembers) : "–"}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("Veränderung")}</div>
              <div className="stat-value">{growth === null ? "–" : `${growth > 0 ? "+" : ""}${nf.format(growth)}`}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("Beitritte")}</div>
              <div className="stat-value">{nf.format(sum(joins))}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("Abgänge")}</div>
              <div className="stat-value">{nf.format(sum(leaves))}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("Nachrichten")}</div>
              <div className="stat-value">{nf.format(sum(messages))}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">{t("Aktivste Stunde")}</div>
              <div className="stat-value">{busiest === null ? "–" : t("{busiest}–{n1} Uhr", { busiest, n1: busiest + 1 })}</div>
            </div>
          </div>

          <section className="card">
            <div className="card-title">
              <Icon name="users" />
              <h2>{t("Mitglieder")}</h2>
            </div>
            <LineChart days={days} values={members} label={t("Mitgliederzahl pro Tag")} />
          </section>

          <section className="card">
            <div className="card-title">
              <Icon name="message" />
              <h2>{t("Nachrichten pro Tag")}</h2>
            </div>
            <BarChart days={days} values={messages} unit="Nachrichten" label={t("Nachrichten pro Tag")} />
          </section>

          <div className="grid-2" style={{ alignItems: "start" }}>
            <section className="card">
              <div className="card-title">
                <Icon name="door" />
                <h2>{t("Beitritte pro Tag")}</h2>
              </div>
              <BarChart days={days} values={joins} unit="Beitritte" label={t("Beitritte pro Tag")} width={360} />
            </section>
            <section className="card">
              <div className="card-title">
                <Icon name="door" />
                <h2>{t("Abgänge pro Tag")}</h2>
              </div>
              <BarChart days={days} values={leaves} unit={t("Abgänge")} label={t("Abgänge pro Tag")} width={360} />
            </section>
          </div>

          <div className="grid-2" style={{ alignItems: "start" }}>
            <section className="card">
              <div className="card-title">
                <Icon name="hash" />
                <h2>{t("Aktivste Kanäle")}</h2>
              </div>
              {channelRows.length === 0 ? (
                <p className="empty">{t("Noch keine Nachrichten.")}</p>
              ) : (
                <ul className="rank-bars">
                  {channelRows.map((c) => (
                    <li key={c.channelId}>
                      <span className="rank-name">#{channelName(c.channelId)}</span>
                      <span className="rank-track">
                        <span className="rank-fill" style={{ width: `${(c.n / topMax) * 100}%` }} />
                      </span>
                      <span className="rank-value">{nf.format(c.n)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <div className="card-title">
                <Icon name="clock" />
                <h2>{t("Nachrichten nach Uhrzeit")}</h2>
              </div>
              <HourChart hours={hours} />
              <div className="hint">{t("Deutsche Zeit, über den ganzen Zeitraum zusammengezählt.")}</div>
            </section>
          </div>

          <details className="card">
            <summary>{t("Zahlen als Tabelle")}</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Tag")}</th>
                    <th>{t("Mitglieder")}</th>
                    <th>{t("Beitritte")}</th>
                    <th>{t("Abgänge")}</th>
                    <th>{t("Nachrichten")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d, i) => {
                    const j = days.length - 1 - i;
                    return (
                      <tr key={d}>
                        <td>{longDay.format(new Date(`${d}T00:00:00Z`))}</td>
                        <td>{members[j] !== null ? nf.format(members[j]!) : "–"}</td>
                        <td>{nf.format(joins[j]!)}</td>
                        <td>{nf.format(leaves[j]!)}</td>
                        <td>{nf.format(messages[j]!)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const w = 360;
  const h = 150;
  const pad = { l: 8, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...hours);
  const step = (w - pad.l - pad.r) / 24;
  const ih = h - pad.t - pad.b;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label={t("Nachrichten nach Uhrzeit")}>
      <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="chart-grid" />
      {hours.map((v, i) => {
        const bh = (v / max) * ih;
        return (
          <g key={i} className="chart-hit">
            <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
            {bh > 0 && <rect x={pad.l + i * step + 1} y={pad.t + ih - bh} width={step - 2} height={bh} rx={3} className="chart-bar" />}
            <title>{t("{i}–{n1} Uhr: {n2} Nachrichten", { i, n1: i + 1, n2: nf.format(v) })}</title>
          </g>
        );
      })}
      {[0, 6, 12, 18].map((hh) => (
        <text key={hh} x={pad.l + hh * step + step / 2} y={h - 6} textAnchor="middle" className="chart-axis">
          {hh} {" "}{t("Uhr")}</text>
      ))}
    </svg>
  );
}
