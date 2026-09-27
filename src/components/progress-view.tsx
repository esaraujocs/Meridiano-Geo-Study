import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Legacy, Region } from "../domain/types";
import type { querySurfaces } from "../domain/progress-surfaces";
import type { EconomySnapshot } from "../domain/economy-store";
import { TITLE_IDS } from "../domain/hub-profile";
import {
  TITLE_GOAL, buildProgressDashboard, groupHistory,
  type Dashboard, type HistoryGroup, type PillarCard, type RegionRow, type ReviewItem, type SessionRow,
} from "../domain/progress-dashboard";
import { addDays, formatClock, formatSeconds, formatShortDate, type SessionGroup } from "../domain/session-view";
import { clockOf } from "../domain/duel-view";
import { loadFlags, flagSource, type FlagCatalog } from "../domain/quiz";
import { Glyph } from "./achievement-art";
import { Icon } from "./icons";
import { ProgressHero } from "./progress-hero";
import { compareText, t } from "../domain/i18n";

type SurfaceState = Awaited<ReturnType<typeof querySurfaces>>;
export type TrainFamily = "mapa" | "bandeiras" | "capitais";
type Props = {
  state: SurfaceState;
  data: Legacy;
  economy: EconomySnapshot;
  onTrain: (family: TrainFamily) => void;
  onOpenCollection: (region: Region) => void;
  onGoHub: () => void;
};
type FlagOf = (code?: string) => string | undefined;

const LEVEL_COLORS = ["rgba(199,182,143,.7)", "#857b5f", "var(--rar-2, #2F6F6A)", "var(--rar-3, #AB7A1A)", "var(--rar-4, #B65F47)", "#C49345"];
const GROUP_ICON: Record<SessionGroup, string> = { bandeiras: "flag", mapa: "map", capitais: "pin", historicas: "flag", idiomas: "world" };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

// ---------- linhas de partida (o duelo é uma linha só: adversário, placar e troféus) ----------
function RowIcon({ row }: { row: SessionRow }) {
  return row.duel
    ? <span className={`pr-sicon pr-sicon-duel is-${row.duel.outcome}`}><Icon type="swords" size={20} /></span>
    : <span className="pr-sicon"><Glyph name={GROUP_ICON[row.group]} size={20} /></span>;
}
function RowTitle({ row }: { row: SessionRow }) {
  return row.duel
    ? <b>{row.title} <em className={`pr-oc is-${row.duel.outcome}`}>{t.progress.duelOutcome[row.duel.outcome]}</em></b>
    : <b>{row.title}</b>;
}
function RowMeta({ row, when, flagIncomplete }: { row: SessionRow; when?: string; flagIncomplete?: boolean }) {
  const lead = row.duel ? t.progress.duelVs(row.duel.botName, row.duel.botLeague) : row.region;
  return <>
    {lead} · {row.rounds}{t.progress.roundsUnit(row.rounds)}{row.duration ? ` · ${row.duration}` : ""}{when ? ` · ${when}` : ""}
    {row.duel?.abandoned ? <> · <span className="pr-inc">{t.progress.duelLeft}</span></> : flagIncomplete && !row.complete ? <> · <span className="pr-inc">{t.progress.incomplete}</span></> : null}
  </>;
}

// ---------- topo ----------
function StageTrack({ hero }: { hero: Dashboard["hero"] }) {
  return <div className="pr-track" role="group" aria-label={t.progress.scaleAria}>
    <div className="pr-rail-wrap"><div className="pr-rail">
      <i style={{ width: `${hero.pct}%` }} />
      <span className="pr-you" style={{ left: `${hero.pct}%` }}><em>{t.progress.you(hero.pct)}</em></span>
      {hero.stages.map((stage, index) => {
        const reached = index <= hero.stageIndex;
        return <span key={stage.name} className={`pr-node${reached ? " done" : ""}${index === hero.stageIndex ? " now" : ""}`} style={{ left: `${index * 20}%` }} aria-current={index === hero.stageIndex ? "step" : undefined}>
          {reached && <Glyph name="check" size={12} stroke={3.2} />}
          <span className="pr-node-label"><b>{stage.name}</b><small>{stage.at}</small></span>
        </span>;
      })}
    </div></div>
  </div>;
}

function heroSummary(hero: Dashboard["hero"]): ReactNode {
  if (hero.cosmographer) { const [a, title, b] = t.progress.heroCosmo(hero.stageTitle); return <>{a}<b>{title}</b>{b}</>; }
  const [a, title, b] = t.progress.heroBase(hero.stageTitle, hero.dominated, hero.total);
  const base = <>{a}<b>{title}</b>{b}</>;
  if (hero.next) return <>{base}<b>{t.progress.nextTitleLabel}</b>{t.progress.nextTitleText(hero.next.name, hero.next.at, hero.missing ?? 0)}</>;
  return <>{base}<b>{t.progress.nextStepLabel}</b>{t.progress.nextStepText}</>;
}

// ---------- números rápidos ----------
function Kpis({ kpis, onOpenCollection }: { kpis: Dashboard["kpis"]; onOpenCollection: () => void }) {
  const { album } = kpis;
  const stack = album.distribution.map((count, level) => count > 0 ? <i key={level} style={{ flex: count, background: LEVEL_COLORS[level] }} /> : null);
  const acc = kpis.accuracyDelta;
  const time = kpis.timeDeltaMs;
  return <div className="pr-kpis">
    <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="trend" size={15} /> {t.progress.level}</span><b>{kpis.level}</b><div className="pr-mini" role="img" aria-label={t.progress.xpAria(kpis.xpInLevel, kpis.xpSpan)}><i style={{ width: `${Math.round((kpis.xpInLevel / kpis.xpSpan) * 100)}%` }} /></div><small>{t.progress.xpToLevel(kpis.xpInLevel, kpis.xpSpan, kpis.level + 1)}</small></div>
    <div className="pr-kpi" data-fam="capitais"><span className="pr-k"><Glyph name="coll" size={15} /> {t.progress.collection}</span><b>{album.discovered}<em>/{album.total}</em></b><div className="pr-stack" aria-hidden="true">{stack}</div><small>{t.progress.cardsFound} · <button type="button" className="pr-inline" onClick={onOpenCollection}>{t.progress.open}</button></small></div>
    <div className="pr-kpi" data-fam="mapa"><span className="pr-k"><Glyph name="world" size={15} /> {t.progress.matches}</span><b>{kpis.sessions}</b><small>{t.progress.roundsPlayed(kpis.rounds)}</small></div>
    <div className="pr-kpi" data-fam="bandeiras"><span className="pr-k"><Glyph name="target" size={15} /> {t.progress.accuracy}</span><b>{kpis.accuracyPct === null ? "—" : `${kpis.accuracyPct}%`}</b>
      {kpis.accuracyPct === null ? <small>{t.progress.afterFirst}</small> : acc === null ? <small>{t.progress.allRounds}</small> : <small className={acc >= 0 ? "up" : "down"}>{t.progress.lastFive(acc >= 0 ? "▲" : "▼", Math.abs(acc))}</small>}</div>
    <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="clock" size={15} /> {t.progress.avgTime}</span><b>{kpis.avgTimeMs === null ? "—" : formatSeconds(kpis.avgTimeMs)}</b>
      {time === null || Math.abs(time) < 50 ? <small>{t.progress.perAnswer}</small> : <small className={time < 0 ? "up" : "down"}>{t.progress.perAnswerDelta(time < 0 ? "▼" : "▲", formatSeconds(Math.abs(time)))}</small>}</div>
  </div>;
}

// ---------- pilares ----------
function PillarCardView({ pillar, onTrain }: { pillar: PillarCard; onTrain: () => void }) {
  const icon = pillar.key === "bandeiras" ? "flag" : pillar.key === "mapa" ? "map" : "pin";
  const empty = pillar.scorePct === null;
  return <article data-fam={pillar.key} className={`pr-pillar${pillar.earned ? " is-earned" : ""}${empty ? " is-empty" : ""}`}>
    <header>
      <span className="pr-picon"><Glyph name={icon} size={24} /></span>
      <div><h3>{pillar.label}</h3><small>{pillar.title}</small></div>
      <span className={`pr-status is-${pillar.tone}`}>{pillar.tone === "earned" && <Glyph name="trophy" size={13} stroke={2} />}{pillar.status}</span>
    </header>
    <div className="pr-acc"><b>{empty ? "—" : `${pillar.scorePct}%`}</b><span>{t.progress.ofAccuracy}</span></div>
    <div className="pr-goal" role="img" aria-label={empty ? t.progress.noRounds : t.progress.goalAria(pillar.scorePct ?? 0, pillar.goalPct)}><i style={{ width: `${pillar.scorePct ?? 0}%` }} /><s style={{ left: `${pillar.goalPct}%` }}><em>{pillar.goalPct}%</em></s></div>
    <p className="pr-goal-text">
      {empty ? <>{t.progress.playToMeasure(pillar.label, pillar.title)}<b>{TITLE_GOAL}%</b>.</>
        : pillar.earned ? (pillar.scorePct !== null && pillar.scorePct < pillar.goalPct
          ? <>{t.progress.alreadyTitle(pillar.title, pillar.scorePct)}</>
          : <>{t.progress.goalBeaten(pillar.goalPct, pillar.title)}</>)
        : (() => { const [a, pts, b] = t.progress.missingPts(pillar.gapPts); return <>{a}<b>{pts}</b>{b}{pillar.title}.</>; })()}
      {!empty && <span className="pr-raw">{t.progress.raw(pillar.correct, pillar.seen)}</span>}
    </p>
    <dl className="pr-pstats">
      <div><dt>{t.progress.coverage}</dt><dd>{pillar.coverage}<em>{t.progress.ofCountries(pillar.coverageTotal)}</em></dd></div>
      <div><dt>{t.progress.recentForm}</dt><dd>{pillar.formPct === null ? "—" : `${pillar.formPct}%`}{pillar.formDelta !== null && pillar.formDelta !== 0 && <em className={pillar.formDelta > 0 ? "up" : "down"}>{pillar.formDelta > 0 ? "▲" : "▼"} {Math.abs(pillar.formDelta)}</em>}</dd></div>
    </dl>
    <p className={`pr-write ${pillar.writing ? (pillar.writing.ok ? "ok" : "no") : "na"}`}>
      {pillar.writing ? <><Glyph name={pillar.writing.ok ? "check" : "lock"} size={14} stroke={2.2} /> {pillar.writing.ok ? t.progress.writingOk(pillar.writing.count) : t.progress.writingMissing(pillar.writing.needed - pillar.writing.count)}</>
        : <><Glyph name="check" size={14} stroke={2.2} /> {t.progress.noWriting}</>}
    </p>
    <button type="button" className="pr-link" onClick={onTrain}>{empty ? t.progress.start : t.progress.train} {pillar.label} <Glyph name="arrow" size={16} /></button>
  </article>;
}

function Pillars({ pillars, onTrain }: { pillars: PillarCard[]; onTrain: (family: TrainFamily) => void }) {
  const [active, setActive] = useState(0);
  return <section aria-labelledby="pr-pilares">
    <h2 className="pr-sec" id="pr-pilares">{t.progress.pillars} <small>{t.progress.pillarsSub}</small></h2>
    <div className="pr-pillars" onScroll={(event) => {
      const list = event.currentTarget;
      const first = list.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 12 : 1;
      setActive(Math.min(pillars.length - 1, Math.max(0, Math.round(list.scrollLeft / step))));
    }}>{pillars.map((pillar) => <PillarCardView key={pillar.key} pillar={pillar} onTrain={() => onTrain(pillar.key)} />)}</div>
    <div className="pr-dots" aria-hidden="true">{pillars.map((pillar, index) => <i key={pillar.key} className={index === active ? "on" : ""} />)}</div>
  </section>;
}

// ---------- recortes ----------
function Regions({ rows, onOpen }: { rows: RegionRow[]; onOpen: (region: Region) => void }) {
  const [measure, setMeasure] = useState<"domain" | "found">("domain");
  return <section className="pr-card pr-regions" aria-labelledby="pr-recortes">
    <header>
      <div><h2 id="pr-recortes">{measure === "domain" ? t.progress.domainByRegion : t.progress.foundByRegion}</h2><p>{measure === "domain" ? t.progress.domainHint : t.progress.foundHint}</p></div>
      <div className="pr-seg" role="group" aria-label={t.progress.measure}><button type="button" aria-pressed={measure === "domain"} onClick={() => setMeasure("domain")}>{t.progress.domain}</button><button type="button" aria-pressed={measure === "found"} onClick={() => setMeasure("found")}>{t.progress.found}</button></div>
    </header>
    <ul>{rows.map((row) => {
      const value = measure === "domain" ? row.found : row.discovered;
      const pct = row.total ? Math.round((value / row.total) * 100) : 0;
      const tag = measure === "domain" ? row.tag : null;
      return <li key={row.key} className={row.world ? "is-world" : ""}>
        <button type="button" className={tag === "warn" ? "has-tag-warn" : ""} onClick={() => onOpen(row.key as Region)} aria-label={t.progress.regionAria(row.label, value, row.total, pct)}>
          <span className="pr-rname"><b>{row.label}</b><small>{t.progress.valueOf(value, row.total)}{tag && <span className={`pr-tag ${tag}`}>{tag === "good" ? t.progress.best : t.progress.startHere}</span>}</small></span>
          <span className="pr-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <strong>{pct}%</strong>
          <span className="pr-chev"><Glyph name="chevron" size={16} stroke={2} /></span>
        </button>
      </li>;
    })}</ul>
  </section>;
}

// ---------- para revisar ----------
function Review({ review, flagOf }: { review: Dashboard["review"]; flagOf: FlagOf }) {
  const [all, setAll] = useState(false);
  const items: ReviewItem[] = all ? review.items : review.items.slice(0, 5);
  return <section className="pr-card pr-review" aria-labelledby="pr-revisar">
    <header><div><h2 id="pr-revisar">{t.progress.review}</h2><p>{review.total > 0 ? t.progress.reviewCount(review.total) : t.progress.reviewNone}</p></div></header>
    {review.total === 0
      ? <div className="pr-empty"><Glyph name="check" size={40} stroke={1.4} /><b>{t.progress.reviewEmpty}</b><p>{t.progress.reviewEmptyHint}</p></div>
      : <ul className={all ? "is-all" : undefined}>{items.map((item) => {
        const src = flagOf(item.flag);
        return <li key={item.id}>
          {src ? <img className="pr-flag" src={src} alt="" width={44} height={30} loading="lazy" decoding="async" /> : <span className="pr-flag" />}
          <div className="pr-rv-name"><b>{item.name}</b><small>{item.place}</small>{item.weak.length > 0 && <em>{t.progress.weakIn(item.weak.join(" · "))}</em>}</div>
          <div className="pr-rv-acc"><b>{item.pct}%</b><small>{t.progress.valueOf(item.correct, item.tries)}</small></div>
        </li>;
      })}</ul>}
    {review.total > 5 && <button type="button" className="pr-link pr-link-center" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? t.progress.showWorst : t.progress.showAll(review.items.length, review.total > review.items.length)}</button>}
  </section>;
}

// ---------- atividade ----------
const heatClass = (rounds: number) => (rounds < 0 ? "hlf" : rounds === 0 ? "hl0" : rounds < 10 ? "hl1" : rounds < 25 ? "hl2" : rounds < 50 ? "hl3" : "hl4");
const DAYS = t.progress.days;
function Activity({ activity }: { activity: Dashboard["activity"] }) {
  const [range, setRange] = useState<12 | 5>(12);
  const total = activity.weeks.length;
  const from = total - range;
  const weeks = activity.weeks.slice(from);
  const months = activity.months.slice(from).map((label, index) => (index === 0 && !label ? activity.months.slice(0, from + 1).reverse().find(Boolean) ?? "" : label));
  const pct = activity.daysTotal ? Math.round((activity.activeDays / activity.daysTotal) * 100) : 0;
  return <section className="pr-card pr-activity" aria-labelledby="pr-atividade">
    <header>
      <div><h2 id="pr-atividade">{t.progress.activity}</h2><p>{t.progress.activityHint(range)}</p></div>
      <div className="pr-seg" role="group" aria-label={t.progress.period}><button type="button" aria-pressed={range === 12} onClick={() => setRange(12)}>{t.progress.weeks(12)}</button><button type="button" aria-pressed={range === 5} onClick={() => setRange(5)}>{t.progress.weeks(5)}</button></div>
    </header>
    <div className="pr-act-body">
      <div className="pr-heat" style={{ ["--weeks" as string]: range }}>
        <div className="pr-months" aria-hidden="true">{months.map((label, index) => <span key={index}>{label}</span>)}</div>
        <div className="pr-heat-grid">
          <div className="pr-days" aria-hidden="true">{DAYS.map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className="pr-cells" role="img" aria-label={t.progress.activeDaysAria(activity.activeDays)}>{weeks.flatMap((week, weekIndex) => week.map((rounds, dayIndex) => {
            const stamp = addDays(activity.start, (from + weekIndex) * 7 + dayIndex);
            return <i key={`${weekIndex}-${dayIndex}`} className={heatClass(rounds)} title={rounds < 0 ? undefined : t.progress.dayRounds(formatShortDate(stamp), rounds)} />;
          }))}</div>
        </div>
        <div className="pr-heat-legend" aria-hidden="true"><span>{t.progress.less}</span><i className="hl0" /><i className="hl1" /><i className="hl2" /><i className="hl3" /><i className="hl4" /><span>{t.progress.more}</span></div>
      </div>
      <dl className="pr-act-stats">
        <div><dt>{t.progress.streak}</dt><dd><span className="pr-big">{activity.streak}<em>{t.progress.daysUnit(activity.streak)}</em></span><small>{t.progress.bestDays(activity.bestStreak)}</small></dd></div>
        <div><dt>{t.progress.thisWeek}</dt><dd><span className="pr-big">{activity.weekRounds}<em>{t.progress.roundsUnit(activity.weekRounds)}</em></span><small>{activity.weekAccuracy === null ? t.progress.noMatchesYet : t.progress.pctAccuracy(activity.weekAccuracy)}</small></dd></div>
        <div><dt>{t.progress.activeDays}</dt><dd><span className="pr-big">{activity.activeDays}<em>{t.progress.ofDays(activity.daysTotal)}</em></span><small>{t.progress.pctOfWeeks(pct)}</small></dd></div>
      </dl>
    </div>
  </section>;
}

// ---------- recordes ----------
function Records({ records }: { records: Dashboard["records"] }) {
  const tiles: Array<[string, string, string, string]> = [
    ["flame", t.progress.bestStreak, records.bestStreak ? String(records.bestStreak.value) : "—", records.bestStreak ? t.progress.bestStreakSub(records.bestStreak.when) : t.progress.noMark],
    ["target", t.progress.bestMatch, records.bestSession ? `${records.bestSession.pct}%` : "—", records.bestSession ? t.progress.bestMatchSub(records.bestSession.rounds, records.bestSession.when) : t.progress.noMark],
    ["bolt", t.progress.fastest, records.fastest ? formatSeconds(records.fastest.ms) : "—", records.fastest ? `${records.fastest.family} · ${records.fastest.when}` : t.progress.noMark],
    ["map", t.progress.lowestError, records.bestMapError ? `${Math.round(records.bestMapError.km)} km` : "—", records.bestMapError ? t.progress.mapWhen(records.bestMapError.when) : t.progress.noMark],
  ];
  return <section className="pr-card pr-records" aria-labelledby="pr-recordes">
    <header><div><h2 id="pr-recordes">{t.progress.records}</h2><p>{t.progress.recordsHint}</p></div></header>
    <div className="pr-rec-grid">{tiles.map(([icon, label, value, sub]) => <div className="pr-rec" key={label}><span className="pr-ricon"><Glyph name={icon} size={20} /></span><small>{label}</small><b>{value}</b><em>{sub}</em></div>)}</div>
  </section>;
}

// ---------- evolução ----------
function EvolutionChart({ points, width, height, ticks, className }: { points: Array<{ pct: number; when: string }>; width: number; height: number; ticks: boolean; className: string }) {
  const gradient = `pr-evg-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pl = 34, pr = 14, pt = 14, pb = 26;
  const x = (index: number) => pl + (points.length > 1 ? (index * (width - pl - pr)) / (points.length - 1) : 0);
  const y = (value: number) => pt + ((100 - value) / 60) * (height - pt - pb);
  const clamp = (value: number) => Math.max(40, Math.min(100, value));
  const coords = points.map((point, index) => [x(index), y(clamp(point.pct))] as const);
  const line = coords.map(([cx, cy], index) => `${index ? "L" : "M"}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height - pb} L${pl} ${height - pb}Z`;
  const avg = points.reduce((sum, point) => sum + point.pct, 0) / points.length;
  const last = coords[coords.length - 1];
  return <svg viewBox={`0 0 ${width} ${height}`} className={`pr-chart ${className}`} role="img" aria-label={t.progress.chartAria(points.length, points[0].pct, points[points.length - 1].pct)}>
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2F6F6A" stopOpacity=".28" /><stop offset="1" stopColor="#2F6F6A" stopOpacity="0" /></linearGradient></defs>
    {[40, 60, 80, 100].map((value) => <g key={value}><line x1={pl} x2={width - pr} y1={y(value)} y2={y(value)} stroke="rgba(199,182,143,.6)" strokeDasharray={value === 100 ? "0" : "3 4"} /><text x={pl - 8} y={y(value) + 4} textAnchor="end">{value}%</text></g>)}
    <path d={area} fill={`url(#${gradient})`} />
    <line x1={pl} x2={width - pr} y1={y(clamp(avg))} y2={y(clamp(avg))} stroke="#AB7A1A" strokeWidth="1.5" strokeDasharray="6 5" />
    <text x={pl + 8} y={y(clamp(avg)) - 7} className="avg">{t.progress.average(Math.round(avg))}</text>
    <path d={line} fill="none" stroke="#2F6F6A" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    {coords.map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index === coords.length - 1 ? 5.5 : 3.4} fill={index === coords.length - 1 ? "#2F6F6A" : "var(--paper)"} stroke="#2F6F6A" strokeWidth="2"><title>{`${points[index].when}: ${points[index].pct}%`}</title></circle>)}
    <text x={last[0] - 4} y={last[1] - 12} textAnchor="end" className="lastv">{points[points.length - 1].pct}%</text>
    <text x={pl} y={height - 6} textAnchor="start">{points[0].when}</text>
    {ticks && points.length > 4 && <text x={(width + pl) / 2} y={height - 6} textAnchor="middle">{t.progress.matchN(Math.ceil(points.length / 2))}</text>}
    <text x={width - pr} y={height - 6} textAnchor="end">{t.progress.today}</text>
  </svg>;
}
function Evolution({ evolution }: { evolution: Dashboard["evolution"] }) {
  const { delta } = evolution;
  return <section className="pr-card pr-evo" aria-labelledby="pr-evolucao">
    <header>
      <div><h2 id="pr-evolucao">{t.progress.evolution}</h2><p>{t.progress.evolutionHint}</p></div>
      {delta !== null && <span className={`pr-delta${delta < 0 ? " down" : ""}`}>{delta >= 0 ? "▲ +" : "▼ −"}{Math.abs(delta)} pts <small>{t.progress.vsFirst(evolution.deltaOver)}</small></span>}
    </header>
    {evolution.points.length >= 2
      ? <><EvolutionChart points={evolution.points} width={600} height={178} ticks className="pr-chart-d" /><EvolutionChart points={evolution.points} width={330} height={168} ticks={false} className="pr-chart-m" /></>
      : <div className="pr-empty"><Glyph name="trend" size={40} stroke={1.3} /><b>{t.progress.curveEmpty}</b><p>{t.progress.curveEmptyHint}</p></div>}
  </section>;
}

// ---------- partidas recentes ----------
function Recent({ rows, onHistory, onGoHub }: { rows: SessionRow[]; onHistory: () => void; onGoHub: () => void }) {
  return <section className="pr-card pr-recent" aria-labelledby="pr-recentes">
    <header><div><h2 id="pr-recentes">{t.progress.recent}</h2></div></header>
    {rows.length === 0
      ? <div className="pr-empty"><b>{t.progress.noMatches}</b><p>{t.progress.noMatchesHint}</p><button type="button" className="pr-cta-line" onClick={onGoHub}>{t.progress.goModes} <Glyph name="arrow" size={16} /></button></div>
      : <ul>{rows.map((row) => <li key={row.id} className={row.duel ? "is-duel" : undefined}>
        <RowIcon row={row} />
        <div className="pr-s-main"><RowTitle row={row} /><small><RowMeta row={row} when={row.duel ? row.when : undefined} /></small></div>
        {row.duel
          ? <div className={`pr-s-res pr-duel-res is-${row.duel.outcome}`} role="img" aria-label={t.progress.duelAria(t.progress.duelOutcome[row.duel.outcome], row.duel.playerCorrect, row.duel.botCorrect, row.duel.deltaText ?? "")}><b>{row.duel.playerCorrect} × {row.duel.botCorrect}</b>{row.duel.deltaText && <small>{row.duel.deltaText}</small>}</div>
          : <div className={`pr-s-res${row.pct !== null && row.pct < 60 ? " low" : ""}`}><b>{row.pct ?? 0}%</b><div className="pr-mini"><i style={{ width: `${row.pct ?? 0}%` }} /></div><small>{row.when}</small></div>}
      </li>)}</ul>}
    {rows.length > 0 && <button type="button" className="pr-link pr-link-center" onClick={onHistory}>{t.progress.allHistory} <Glyph name="arrow" size={16} /></button>}
  </section>;
}

// ---------- histórico ----------
const PAGE = 20;
function SessionItem({ row, group, open, onToggle, flagOf }: { row: SessionRow; group: string; open: boolean; onToggle: () => void; flagOf: FlagOf }) {
  const when = group === "hoje" || group === "ontem" ? formatClock(row.startedAt) : formatShortDate(row.startedAt);
  const pct = row.pct ?? 0;
  return <article className={`pr-sess${open ? " is-open" : ""}`}>
    <button type="button" className={`pr-sess-row${row.duel ? " is-duel" : ""}`} aria-expanded={open} onClick={onToggle}>
      <RowIcon row={row} />
      <span className="pr-s-main"><RowTitle row={row} /><small><RowMeta row={row} when={when} flagIncomplete /></small></span>
      {row.duel
        ? <span className={`pr-s-res pr-duel-res is-${row.duel.outcome}`} role="img" aria-label={t.progress.duelAria(t.progress.duelOutcome[row.duel.outcome], row.duel.playerCorrect, row.duel.botCorrect, row.duel.deltaText ?? "")}><b>{row.duel.playerCorrect} × {row.duel.botCorrect}</b>{row.duel.deltaText && <small>{row.duel.deltaText}</small>}</span>
        : <span className={`pr-s-res${pct < 60 ? " low" : ""}`}><b>{pct}%</b><span className="pr-mini"><i style={{ width: `${pct}%` }} /></span></span>}
      <span className={`pr-chev${open ? " down" : ""}`}><Glyph name="chevron" size={18} stroke={2} /></span>
    </button>
    {open && row.duel && <DuelDetail row={row} duel={row.duel} flagOf={flagOf} />}
    {open && !row.duel && <div className="pr-sess-detail">
      <div className="pr-sd-top">
        {row.pattern && <div className="pr-strip" role="img" aria-label={t.progress.stripAria(row.pattern.split("").filter((c) => c === "1").length, row.pattern.length)}>{row.pattern.split("").map((c, index) => <i key={index} className={c === "1" ? "ok" : "no"} />)}</div>}
        <dl>
          <div><dt>{t.progress.avgTime}</dt><dd>{row.avgTimeMs === null ? "—" : formatSeconds(row.avgTimeMs)}</dd></div>
          <div><dt>{t.progress.longestStreak}</dt><dd>{row.bestStreak}</dd></div>
          <div><dt>{t.progress.duration}</dt><dd>{row.duration ?? "—"}</dd></div>
        </dl>
      </div>
      <div className="pr-sd-miss">{row.misses.length === 0
        ? <span>{row.pattern ? t.progress.noErrors : t.progress.oldSession}</span>
        : <><span>{t.progress.youMissed}</span>{row.misses.slice(0, 8).map((miss) => { const src = flagOf(miss.flag); return <span className="pr-miss" key={miss.id}>{src ? <img className="pr-flag" src={src} alt="" width={26} height={18} loading="lazy" decoding="async" /> : null}{miss.name}</span>; })}{row.misses.length > 8 && <span>+{row.misses.length - 8}</span>}</>}</div>
    </div>}
  </article>;
}

function DuelDetail({ row, duel, flagOf }: { row: SessionRow; duel: NonNullable<SessionRow["duel"]>; flagOf: FlagOf }) {
  return <div className="pr-sess-detail pr-duel-detail">
    <p className="pr-duel-vs"><b>{duel.botName}</b>{(duel.botLeague || duel.botStyle) && <span>{[duel.botLeague, duel.botStyle].filter(Boolean).join(" · ")}</span>}</p>
    {duel.tiebreak && <p className="pr-duel-note">{t.duel.result.tiebreak}</p>}
    <div className="pr-duel-legs">{duel.legs.map((leg, index) => <div className="pr-duel-leg" key={index}>
      <div className="pr-duel-leg-h"><b>{duel.legs.length > 1 ? t.duel.result.legTitle(index + 1, leg.mode) : leg.mode}</b><div className="pr-duel-leg-r"><span>{leg.playerCorrect} × {leg.botCorrect}</span>{leg.playerMs !== null ? <small>{clockOf(leg.playerMs)}</small> : null}</div></div>
      {leg.pattern && <div className="pr-strip" role="img" aria-label={t.progress.stripAria(leg.pattern.split("").filter((c) => c === "1").length, leg.pattern.length)}>{leg.pattern.split("").map((c, i) => <i key={i} className={c === "1" ? "ok" : "no"} />)}</div>}
      {leg.pattern && <div className="pr-sd-miss">{leg.misses.length === 0
        ? <span>{t.progress.noErrors}</span>
        : <><span>{t.progress.youMissed}</span>{leg.misses.slice(0, 8).map((miss) => { const src = flagOf(miss.flag); return <span className="pr-miss" key={miss.id}>{src ? <img className="pr-flag" src={src} alt="" width={26} height={18} loading="lazy" decoding="async" /> : null}{miss.name}</span>; })}{leg.misses.length > 8 && <span>+{leg.misses.length - 8}</span>}</>}</div>}
    </div>)}</div>
    <div className="pr-sd-top"><dl>
      {duel.deltaLabel !== null && <div><dt>{duel.deltaLabel}</dt><dd>{signed(duel.delta)}</dd></div>}
      {duel.playerMs !== null && <div><dt>{t.progress.duelYourTime}</dt><dd>{clockOf(duel.playerMs)}</dd></div>}
      {duel.botMs !== null && <div><dt>{t.progress.duelBotTime(duel.botName)}</dt><dd>{clockOf(duel.botMs)}</dd></div>}
      {row.avgTimeMs !== null && <div><dt>{t.progress.avgTime}</dt><dd>{formatSeconds(row.avgTimeMs)}</dd></div>}
    </dl></div>
  </div>;
}

function History({ rows, now, flagOf }: { rows: SessionRow[]; now: number; flagOf: FlagOf }) {
  const [filter, setFilter] = useState<"todas" | "duelo" | SessionGroup>("todas");
  const [region, setRegion] = useState("todos");
  const [onlyComplete, setOnlyComplete] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null);
  const counts = useMemo(() => {
    const map = new Map<SessionGroup, number>();
    rows.forEach((row) => map.set(row.group, (map.get(row.group) ?? 0) + 1));
    return map;
  }, [rows]);
  const regions = useMemo(() => [...new Set(rows.map((row) => row.region))].sort(compareText), [rows]);
  const duelCount = useMemo(() => rows.filter((row) => row.duel).length, [rows]);
  const filtered = useMemo(() => rows.filter((row) => (filter === "todas" || (filter === "duelo" ? Boolean(row.duel) : row.group === filter)) && (region === "todos" || row.region === region) && (!onlyComplete || row.complete)), [rows, filter, region, onlyComplete]);
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const groups: HistoryGroup[] = useMemo(() => groupHistory(shown, now), [shown, now]);
  const chips: Array<{ key: "todas" | "duelo" | SessionGroup; label: string; icon?: string; count: number }> = [
    { key: "todas", label: t.progress.all, count: rows.length },
    { key: "bandeiras", label: t.sessions.groups.bandeiras, icon: "flag", count: counts.get("bandeiras") ?? 0 },
    { key: "mapa", label: t.sessions.groups.mapa, icon: "map", count: counts.get("mapa") ?? 0 },
    { key: "capitais", label: t.sessions.groups.capitais, icon: "pin", count: counts.get("capitais") ?? 0 },
    { key: "historicas", label: t.sessions.groups.historicas, count: counts.get("historicas") ?? 0 },
    { key: "idiomas", label: t.sessions.groups.idiomas, count: counts.get("idiomas") ?? 0 },
    { key: "duelo", label: t.progress.duelChip, count: duelCount },
  ];
  if (rows.length === 0) return <div className="pr-card"><div className="pr-empty"><b>{t.progress.noMatches}</b><p>{t.progress.historyEmptyHint}</p></div></div>;
  return <>
    <div className="pr-hist-bar">
      <div className="pg-chips pr-filters" role="group" aria-label={t.progress.filterByMode}>{chips.filter((chip) => chip.key === "todas" || chip.count > 0).map((chip) => <button key={chip.key} type="button" className="pg-chip" aria-pressed={filter === chip.key} onClick={() => { setFilter(chip.key); setVisible(PAGE); }}>{chip.icon && <Glyph name={chip.icon} size={16} />}{chip.label} <em>{chip.count}</em></button>)}</div>
      <div className="pr-hist-right">
        <label className="pr-select-wrap"><span className="sr-only">{t.progress.regionLabel}</span><select className="pr-select" value={region} onChange={(event) => { setRegion(event.target.value); setVisible(PAGE); }}><option value="todos">{t.progress.regionAll}</option>{regions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="pr-toggle"><input type="checkbox" checked={onlyComplete} onChange={(event) => { setOnlyComplete(event.target.checked); setVisible(PAGE); }} /><i /> {t.progress.onlyComplete}</label>
      </div>
    </div>
    {groups.length === 0 && <div className="pr-card"><div className="pr-empty"><b>{t.progress.noFiltered}</b><p>{t.progress.noFilteredHint}</p></div></div>}
    {groups.map((group) => <div className="pr-day" key={group.key}>
      <h2>{group.label} <small>{t.progress.groupSummary(group.sessions, group.rounds)}{group.pct !== null ? ` · ${group.pct}%` : ""}</small></h2>
      {group.rows.map((row) => <SessionItem key={row.id} row={row} group={group.key} open={openId === row.id} onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))} flagOf={flagOf} />)}
    </div>)}
    {filtered.length > visible && <button type="button" className="pr-link pr-link-center pr-more" onClick={() => setVisible((value) => value + PAGE)}>{t.progress.loadOlder(filtered.length - visible)}</button>}
  </>;
}

// ---------- perfil novo ----------
function EmptySummary({ dashboard, onTrain }: { dashboard: Dashboard; onTrain: (family: TrainFamily) => void }) {
  const { kpis, hero } = dashboard;
  return <>
    <div className="pr-kpis">
      <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="trend" size={15} /> {t.progress.level}</span><b>{kpis.level}</b><div className="pr-mini"><i style={{ width: 0 }} /></div><small>{t.progress.xpToLevel(kpis.xpInLevel, kpis.xpSpan, kpis.level + 1)}</small></div>
      <div className="pr-kpi" data-fam="capitais"><span className="pr-k"><Glyph name="coll" size={15} /> {t.progress.collection}</span><b>{kpis.album.discovered}<em>/{kpis.album.total}</em></b><div className="pr-stack" aria-hidden="true"><i style={{ flex: 1, background: LEVEL_COLORS[0] }} /></div><small>{t.progress.cardsFound}</small></div>
      <div className="pr-kpi" data-fam="mapa"><span className="pr-k"><Glyph name="world" size={15} /> {t.progress.matches}</span><b>{kpis.sessions}</b><small>{t.progress.noRoundsYet}</small></div>
      <div className="pr-kpi" data-fam="bandeiras"><span className="pr-k"><Glyph name="target" size={15} /> {t.progress.accuracy}</span><b>—</b><small>{t.progress.afterFirst}</small></div>
      <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="clock" size={15} /> {t.progress.avgTime}</span><b>—</b><small>{t.progress.perAnswer}</small></div>
    </div>
    <Pillars pillars={dashboard.pillars} onTrain={onTrain} />
    <div className="pr-card pr-first"><div className="pr-empty"><Glyph name="compass" size={44} stroke={1.2} /><b>{t.progress.firstMatch}</b><p>{t.progress.firstMatchHint} {hero.next ? t.progress.toReach(hero.next.name, hero.missing ?? 0) : ""}</p></div></div>
  </>;
}

// ---------- como funciona ----------
function HowDialog({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return <dialog ref={dialog} className="pr-dialog" aria-labelledby="pr-how-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="pr-dialog-body">
      <header><h2 id="pr-how-title">{t.progress.howTitle}</h2><button type="button" className="pr-x" aria-label={t.progress.close} onClick={() => dialog.current?.close()}><Glyph name="x" size={20} stroke={2} /></button></header>
      <dl>
        <div><dt>{t.progress.howDominated}</dt><dd>{t.progress.howDominatedText}</dd></div>
        <div><dt>{t.progress.howStages}</dt><dd>{t.progress.howStagesText}</dd></div>
        <div><dt>{t.progress.howTitles}</dt><dd>{t.progress.howTitlesText(TITLE_GOAL)}</dd></div>
        <div><dt>{t.progress.howXp}</dt><dd>{t.progress.howXpText}</dd></div>
        <div><dt>{t.progress.howReview}</dt><dd>{t.progress.howReviewText}</dd></div>
      </dl>
    </div>
  </dialog>;
}

// ---------- tela ----------
export function ProgressView({ state, data, economy, onTrain, onOpenCollection, onGoHub }: Props) {
  const [tab, setTab] = useState<"resumo" | "historico">("resumo");
  const [flags, setFlags] = useState<FlagCatalog>({});
  const howRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); }, []);
  const now = useMemo(() => Date.now(), [state]);
  const dashboard = useMemo(() => buildProgressDashboard({
    now,
    sessions: state.sessions,
    duels: state.duels,
    pvpMatches: state.pvpMatches,
    records: state.progress.records ?? [],
    meta: data.meta,
    universe: data.mapEntityIds,
    dominatedIds: state.dominatedIds,
    titleIds: state.achievements.filter((item) => item.unlocked && TITLE_IDS.includes(item.id)).map((item) => item.id),
    pillars: state.progress.pillars,
    album: { discovered: state.progress.discovered, total: state.progress.total, distribution: state.progress.distribution },
    economy,
  }), [now, state, data, economy]);
  const flagOf: FlagOf = (code) => { const value = code ? flags[code.toLowerCase()] : undefined; return value ? flagSource(value) : undefined; };
  const { hero } = dashboard;
  const openCollection = () => onOpenCollection("mundo");

  return <section className="pr" aria-label={t.progress.aria}>
    <ProgressHero
      value={hero.pct} total={100} ringValue={`${hero.pct}%`} ringCaption={t.progress.ringCaption} ringLabel={t.progress.ringLabel(hero.pct)}
      eyebrow={t.progress.eyebrow} title={t.progress.title}
      summary={<>{heroSummary(hero)}<button type="button" className="pr-how" onClick={() => howRef.current?.showModal()}><Glyph name="info" size={16} /> <span className="pr-d">{t.progress.howTitle}</span><span className="pr-m">{t.progress.howShort}</span></button></>}
      legendLabel={t.progress.pillarTitles} legendClassName="pr-titles"
      legend={hero.titles.map((title) => <li key={title.id} className={title.earned ? "is-earned" : "is-locked"}><span className="pr-medal"><Glyph name={title.earned ? "trophy" : "lock"} size={14} stroke={2} /></span><b>{title.label}</b><span className="sr-only">{title.earned ? t.progress.earned : t.progress.locked}</span></li>)}
      footer={<StageTrack hero={hero} />}
    />
    <div className="pg-chips pr-tabs" role="group" aria-label={t.progress.sections}>
      <button type="button" className="pg-chip" aria-pressed={tab === "resumo"} onClick={() => setTab("resumo")}><Glyph name="bars" size={17} /> {t.progress.summary}</button>
      <button type="button" className="pg-chip" aria-pressed={tab === "historico"} onClick={() => setTab("historico")}><Glyph name="clock" size={17} /> {t.progress.history} {dashboard.history.length > 0 && <em>{dashboard.history.length}</em>}</button>
    </div>
    {tab === "historico" ? <History rows={dashboard.history} now={now} flagOf={flagOf} />
      : dashboard.empty ? <EmptySummary dashboard={dashboard} onTrain={onTrain} />
      : <>
        <Kpis kpis={dashboard.kpis} onOpenCollection={openCollection} />
        <Pillars pillars={dashboard.pillars} onTrain={onTrain} />
        <div className="pr-row pr-row-a"><Regions rows={dashboard.regions} onOpen={onOpenCollection} /><Review review={dashboard.review} flagOf={flagOf} /></div>
        <div className="pr-row pr-row-b"><Activity activity={dashboard.activity} /><Records records={dashboard.records} /></div>
        <div className="pr-row pr-row-c"><Evolution evolution={dashboard.evolution} /><Recent rows={dashboard.recent} onHistory={() => setTab("historico")} onGoHub={onGoHub} /></div>
      </>}
    <HowDialog dialog={howRef} />
  </section>;
}
