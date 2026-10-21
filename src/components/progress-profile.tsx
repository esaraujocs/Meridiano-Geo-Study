// Progresso refeito (20/10/2026, mock ../mockups-carta-cega/progresso-v1, aprovado pelo Enzo): o cabeçalho "Seu perfil", as peças do Resumo
// (Seu mapa, Pilares, Duelo, Números, a evolução do domínio) e a aba Modos. O Seu ritmo mora em progress-rhythm.tsx.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Feature, Geometry, Position } from "geojson";
import type { Dashboard, RegionRow } from "../domain/progress-dashboard";
import type { LadderCard } from "../domain/duel-view";
import { leagueLabel, leaguePip, nextStep } from "../domain/duel-labels";
import { geometryIndex } from "../domain/legacy-geometry";
import { formatSeconds } from "../domain/session-view";
import type { ModeOverview, ReflexItem, ReflexMode, RhythmFamily } from "../domain/rhythm";
import { RHYTHM_FAMILIES } from "../domain/rhythm";
import type { Region } from "../domain/types";
import { formatNumber, t } from "../domain/i18n";

const pctOf = (value: number) => Math.round(value * 100);

// ---------- cabeçalho ----------
export function ProfileHero({ hero, kpis, name, ladders }: { hero: Dashboard["hero"]; kpis: Dashboard["kpis"]; name: string; ladders: readonly LadderCard[] }) {
  const xpPct = kpis.xpSpan > 0 ? Math.min(100, (kpis.xpInLevel / kpis.xpSpan) * 100) : 0;
  const r = 42, c = 2 * Math.PI * r;
  const title = hero.cosmographer ? t.titles.cosmografo : hero.stageTitle;
  const reached = hero.cosmographer ? hero.stages.length - 1 : hero.stageIndex;
  return <section className="pr-card pf-hero" aria-labelledby="pf-title">
    <div className="pf-id">
      <div className="pf-ring" aria-hidden="true">
        <svg viewBox="0 0 96 96"><circle cx="48" cy="48" r={r} className="pf-ring-bg" /><circle cx="48" cy="48" r={r} className="pf-ring-fg" strokeDasharray={`${(c * xpPct) / 100} ${c}`} transform="rotate(-90 48 48)" /></svg>
        <b>{kpis.level}</b><small>{t.profile.level}</small>
      </div>
      <div className="pf-name">
        <span className="pf-k">{name || t.profile.eyebrow}</span>
        <h1 id="pf-title">{title}</h1>
        <p>{t.profile.xpTo(formatNumber(kpis.xpInLevel), formatNumber(kpis.xpSpan), kpis.level + 1)}</p>
        <div className="pf-xp" aria-hidden="true"><i style={{ width: `${xpPct}%` }} /></div>
      </div>
    </div>
    <div className="pf-mastery">
      <span className="pf-k">{t.profile.mastery}</span>
      <div className="pf-big"><b>{hero.pct}%</b><span><strong>{formatNumber(hero.dominated)}</strong> {t.profile.ofCountries(hero.total)}</span></div>
    </div>
    <div className="pf-badges">
      {ladders.filter((card) => card.duels > 0).map((card) => <div className="pf-badge" key={card.ladder}>
        <span className="pf-pip" data-league={card.status.league} aria-hidden="true">{leaguePip(card.status.league, card.status.division)}</span>
        <div><b>{formatNumber(card.trophies)}</b><small>{t.profile.ladder(t.duel.ladders[card.ladder], leagueLabel(card.status.league, card.status.division))}</small></div>
      </div>)}
      {hero.titles.some((item) => item.earned) && <ul className="pf-medals" aria-label={t.progress.pillarTitles}>{hero.titles.filter((item) => item.earned).map((item) => <li key={item.id}>{item.label}</li>)}</ul>}
    </div>
    <ol className="pf-track" style={{ "--p": `${Math.min(1, reached / (hero.stages.length - 1))}` } as CSSProperties}>
      {hero.stages.map((stage, index) => <li key={stage.name} className={`${index <= reached ? "on" : ""}${index === reached ? " cur" : ""}${index === reached + 1 ? " next" : ""}`} aria-current={index === reached ? "step" : undefined}>
        <i aria-hidden="true" /><span>{stage.name}<small>{stage.at}</small></span>
      </li>)}
    </ol>
  </section>;
}

// ---------- Seu mapa ----------
// Equal Earth (Šavrič, Patterson e Jenny, 2018): o mundo inteiro numa forma só, sem o exagero dos polos do Mercator
const equalEarth = (lon: number, lat: number): [number, number] => {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180, th = Math.asin(M * Math.sin(phi)), t2 = th * th, t6 = t2 * t2 * t2;
  return [(lam * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), -th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
};
const MAP_W = 760, MAP_H = 330, SCALE = MAP_W / 5.5, OX = MAP_W / 2, OY = MAP_H * 0.44, SOUTH = -58;
const point = (lon: number, lat: number) => { const [x, y] = equalEarth(lon, Math.max(SOUTH, lat)); return `${(OX + x * SCALE).toFixed(1)},${(OY + y * SCALE).toFixed(1)}`; };
// cada anel é desenrolado (sem o salto de 360° do antimeridiano): a Rússia e Fiji passam um pouco da borda, que o recorte do globo esconde
const ringPath = (ring: Position[]) => { let prev: number | null = null; return `M${ring.map(([lon, lat]) => { let x = lon; if (prev !== null) { while (x - prev > 180) x -= 360; while (prev - x > 180) x += 360; } prev = x; return point(x, lat); }).join("L")}Z`; };
const shapePath = (feature: Feature<Geometry>) => {
  const geometry = feature.geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.map((polygon) => polygon.map(ringPath).join("")).join("");
};
const globe = (() => { const edge: string[] = []; for (let lat = SOUTH; lat <= 84; lat += 2) edge.push(point(-180, lat)); for (let lat = 84; lat >= SOUTH; lat -= 2) edge.push(point(180, lat)); return `M${edge.join("L")}Z`; })();
let shapesCache: Array<{ id: string; d: string }> | null = null;

export type MapMeasure = "domain" | "collection";
export function WorldMap({ measure, dominated, conquered, levels, regions, onOpen, onMeasure }: {
  measure: MapMeasure; dominated: ReadonlySet<string>; conquered: ReadonlySet<string>; levels: ReadonlyMap<string, number>;
  regions: readonly RegionRow[]; onOpen: (region: Region) => void; onMeasure: (measure: MapMeasure) => void;
}) {
  const [shapes, setShapes] = useState(shapesCache);
  useEffect(() => {
    if (shapesCache) return;
    let alive = true;
    void geometryIndex().then(({ features }) => {
      shapesCache = [...features].filter(([id]) => id !== "10").map(([id, feature]) => ({ id, d: shapePath(feature) })).filter((shape) => shape.d);
      if (alive) setShapes(shapesCache);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const stateOf = (id: string) => {
    if (measure === "collection") { const level = levels.get(id) ?? 0; return level > 0 ? `c${level}` : "unseen"; }
    if (dominated.has(id)) return "dominated";
    if (conquered.has(id)) return "conquered";
    return (levels.get(id) ?? 0) > 0 ? "seen" : "unseen";
  };
  const counts = { dominated: 0, conquered: 0, seen: 0, unseen: 0 };
  for (const id of levels.keys()) { const state = stateOf(id); if (state in counts) counts[state as keyof typeof counts] += 1; }
  return <section className="pr-card pf-map" aria-labelledby="pf-map-title">
    <header className="pf-head">
      <div><h2 id="pf-map-title">{t.profile.mapTitle}</h2><p>{t.profile.mapSub}</p></div>
      <div className="pr-seg" role="group" aria-label={t.progress.measure}>
        <button type="button" aria-pressed={measure === "domain"} onClick={() => onMeasure("domain")}>{t.profile.mapDomain}</button>
        <button type="button" aria-pressed={measure === "collection"} onClick={() => onMeasure("collection")}>{t.profile.mapCollection}</button>
      </div>
    </header>
    <svg className="pf-world" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={t.profile.mapAria(dominated.size, levels.size)}>
      <defs><clipPath id="pf-globe"><path d={globe} /></clipPath></defs>
      <path d={globe} className="pf-sea" />
      <g clipPath="url(#pf-globe)">{shapes?.map((shape) => <path key={shape.id} d={shape.d} className={`pf-land is-${stateOf(shape.id)}`} />)}</g>
    </svg>
    {measure === "domain"
      ? <ul className="pf-legend">{(["dominated", "conquered", "seen", "unseen"] as const).map((key) => <li key={key}><i className={`is-${key}`} aria-hidden="true" />{t.profile[key]} <b>{counts[key]}</b></li>)}</ul>
      : <ul className="pf-legend">{[0, 1, 2, 3, 4, 5].map((level) => <li key={level}><i className={`is-${level ? `c${level}` : "unseen"}`} aria-hidden="true" />{level ? t.profile.cardLevel(level) : t.profile.unseen}</li>)}</ul>}
    <ul className="pf-regions">{regions.map((row) => {
      const value = measure === "domain" ? row.found : row.discovered;
      const pct = row.total ? Math.round((value / row.total) * 100) : 0;
      return <li key={row.key}><button type="button" onClick={() => onOpen(row.key as Region)}>
        <b><span>{row.label}</span> <em>{pct}%</em></b><span className="pf-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span><small>{t.profile.regionCount(value, row.total)}</small><span className="sr-only"> · {t.profile.regionOpen}</span>
      </button></li>;
    })}</ul>
  </section>;
}

// ---------- Pilares (compactos) ----------
const PILLAR_ICON: Record<string, string> = { bandeiras: "⚑", mapa: "◳", capitais: "◉" };
export function PillarsCompact({ pillars }: { pillars: Dashboard["pillars"] }) {
  return <section className="pr-card pf-pillars" aria-labelledby="pf-pillars">
    <header className="pf-head"><div><h2 id="pf-pillars">{t.profile.pillarsTitle}</h2><p>{t.profile.pillarsSub}</p></div></header>
    <ul>{pillars.map((pillar) => <li key={pillar.key} data-fam={pillar.key}>
      <span className="pf-pillar-ic" aria-hidden="true">{PILLAR_ICON[pillar.key]}</span>
      <div className="pf-pillar-body">
        <b>{pillar.label}{pillar.earned && <span className="pf-earned">✓ {pillar.title}</span>}</b>
        <span className="pf-meter" aria-hidden="true"><i style={{ width: `${pillar.domainPct}%` }} /><u style={{ left: `${pillar.goalPct}%` }} /></span>
        <small>{t.profile.pillarCountries(pillar.domainDone, pillar.domainTotal)} · {t.profile.goal(pillar.goalPct)}</small>
      </div>
      <strong>{pillar.domainPct}%<small>{t.profile.domain}</small></strong>
    </li>)}</ul>
  </section>;
}

// ---------- Duelo ----------
export type LadderTally = { wins: number; losses: number };
export function DuelCard({ ladders, tally, onOpenLeague }: { ladders: readonly LadderCard[]; tally: Record<string, LadderTally>; onOpenLeague?: () => void }) {
  const played = ladders.filter((card) => card.duels > 0);
  const duels = ladders.reduce((sum, card) => sum + card.duels, 0);
  const wins = Object.values(tally).reduce((sum, item) => sum + item.wins, 0);
  return <section className="pr-card pf-duel" aria-labelledby="pf-duel">
    <header className="pf-head"><div><h2 id="pf-duel">{t.profile.duelTitle}</h2><p>{played.length ? t.profile.duelSub(duels, wins) : t.profile.noDuels}</p></div></header>
    <ul>{played.map((card) => {
      const step = nextStep(card.status);
      const mine = tally[card.ladder] ?? { wins: 0, losses: 0 };
      const games = mine.wins + mine.losses;
      return <li key={card.ladder}>
        <span className="pf-pip is-big" data-league={card.status.league} aria-hidden="true">{leaguePip(card.status.league, card.status.division)}</span>
        <div>
          <b>{t.profile.ladder(t.duel.ladders[card.ladder], leagueLabel(card.status.league, card.status.division))}</b>
          <small>{t.profile.duelRecord(mine.wins, mine.losses, games ? Math.round((mine.wins / games) * 100) : 0)}{step ? ` · ${t.profile.duelNext(step.remaining, step.label)}` : ""}</small>
          <span className="pf-form" aria-hidden="true">{card.form.map((outcome, index) => <i key={index} className={`is-${outcome}`} />)}</span>
        </div>
        <strong>{formatNumber(card.trophies)}<small>{t.profile.trophies}</small></strong>
      </li>;
    })}</ul>
    {onOpenLeague && played.length > 0 && <button type="button" className="pf-link" onClick={onOpenLeague}>{t.profile.openLeague} →</button>}
  </section>;
}

// ---------- evolução do domínio ----------
export function DomainChart({ timeline, stages }: { timeline: ReadonlyArray<{ day: string; dominated: number }>; stages: ReadonlyArray<{ name: string; at: number }> }) {
  const W = 540, H = 190, max = Math.max(250, ...timeline.map((point) => point.dominated));
  const x = (i: number) => 34 + (timeline.length > 1 ? (i / (timeline.length - 1)) * (W - 44) : (W - 44) / 2);
  const y = (v: number) => H - 24 - (v / max) * (H - 44);
  if (!timeline.length) return null;
  const line = timeline.map((point, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(point.dominated).toFixed(1)}`).join("");
  const area = `${line}L${x(timeline.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const first = timeline[0], last = timeline[timeline.length - 1];
  const label = (day: string) => { const [, m, d] = day.split("-"); return `${d}/${m}`; };
  return <svg className="pf-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.profile.evolutionAria(first.dominated, last.dominated)}>
    {[0, 50, 100, 150, 200, 250].filter((v) => v <= max).map((v) => <g key={v}><line x1="34" x2={W - 10} y1={y(v)} y2={y(v)} className="pf-grid" /><text x="0" y={y(v) + 4} className="pf-axis">{v}</text></g>)}
    {stages.map((stage) => <g key={stage.name}><line x1="34" x2={W - 10} y1={y(stage.at)} y2={y(stage.at)} className="pf-goal" /><text x="40" y={y(stage.at) - 5} className="pf-axis pf-goal-t">{stage.name}</text></g>)}
    <path d={area} className="pf-area" /><path d={line} className="pf-line" />
    <circle cx={x(timeline.length - 1)} cy={y(last.dominated)} r="5" className="pf-dot" />
    <text x="34" y={H - 4} className="pf-axis">{label(first.day)}</text><text x={W - 10} y={H - 4} textAnchor="end" className="pf-axis">{t.profile.today}</text>
  </svg>;
}

// ---------- Números ----------
export function NumbersCard({ items, since }: { items: ReadonlyArray<{ key: string; label: string; value: string; note: ReactNode }>; since: string | null }) {
  return <section className="pr-card pf-numbers" aria-labelledby="pf-numbers">
    <header className="pf-head"><div><h2 id="pf-numbers">{t.profile.numbersTitle}</h2>{since && <p>{t.profile.since(since)}</p>}</div></header>
    <dl>{items.map((item) => <div key={item.key}><dt>{item.label}</dt><dd><b>{item.value}</b><small>{item.note}</small></dd></div>)}</dl>
  </section>;
}

// ---------- Modos ----------
const FAMILY_ICON: Record<RhythmFamily, string> = { bandeiras: "⚑", mapa: "◳", capitais: "◉", povos: "✦", divisoes: "▦", epocas: "⟲" };
const modeName = (mode: string) => (t.modes as Record<string, readonly string[] | undefined>)[mode]?.[0] ?? mode;
/** O nome do modo; fora do cartão da família (os picos do Seu ritmo), com a família na frente ("Capitais · Clicar no mapa"). */
export const modeLabel = (overview: Pick<ModeOverview, "family" | "mode">, withFamily = false) =>
  (withFamily ? `${t.profile.families[overview.family]} · ${modeName(overview.mode)}` : modeName(overview.mode));
export function ModesTab({ modes, after }: { modes: readonly ModeOverview[]; after?: ReactNode }) {
  const total = modes.reduce((sum, mode) => sum + mode.rounds, 0);
  const groups = RHYTHM_FAMILIES.map((family) => ({ family, list: modes.filter((mode) => mode.family === family) })).filter((group) => group.list.length);
  if (!total) return null;
  const top = Math.max(...modes.map((mode) => mode.rounds));
  const when = (at: number) => { const d = new Date(at); return `${t.profile.weekdays[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}, ${d.getHours()}h`; };
  return <div className="pf-modes">
    <section className="pr-card pf-share" aria-labelledby="pf-share">
      <header className="pf-head"><div><h2 id="pf-share">{t.profile.modesTitle}</h2><p>{t.profile.modesSub(formatNumber(total), modes.length)}</p></div></header>
      <div className="pf-stack" aria-hidden="true">{groups.flatMap((group) => group.list.map((mode, index) => <i key={`${mode.family}:${mode.mode}`} data-fam={group.family} style={{ width: `${(mode.rounds / total) * 100}%`, opacity: 1 - (index % 3) * 0.22 }} title={modeLabel(mode, true)} />))}</div>
      <ul className="pf-legend">{groups.map((group) => <li key={group.family}><i data-fam={group.family} aria-hidden="true" />{t.profile.families[group.family]} <b>{pctOf(group.list.reduce((sum, mode) => sum + mode.rounds, 0) / total)}%</b></li>)}</ul>
    </section>
    {after}
    <div className="pf-fams">{groups.map((group) => {
      const rounds = group.list.reduce((sum, mode) => sum + mode.rounds, 0);
      const acc = group.list.reduce((sum, mode) => sum + mode.acc * mode.rounds, 0) / rounds;
      return <section className="pr-card pf-fam" key={group.family} data-fam={group.family} aria-labelledby={`pf-fam-${group.family}`}>
        <header className="pf-fam-h">
          <span className="pf-fam-ic" aria-hidden="true">{FAMILY_ICON[group.family]}</span>
          <div><h3 id={`pf-fam-${group.family}`}>{t.profile.families[group.family]}</h3><small>{t.profile.famLine(group.list.length, pctOf(rounds / total))}</small></div>
          <p><b>{formatNumber(rounds)}</b><small>{t.profile.famTotal(pctOf(acc))}</small></p>
        </header>
        <table className="pf-table">
          <thead><tr><th scope="col">{t.profile.colMode}</th><th scope="col">{t.profile.colRounds}</th><th scope="col">{t.profile.colAccuracy}</th><th scope="col" className="pf-opt">{t.profile.colTime}</th><th scope="col" className="pf-opt">{t.profile.colPeaks}</th></tr></thead>
          <tbody>{group.list.map((mode) => <tr key={mode.mode}>
            <th scope="row"><b>{modeLabel(mode)}</b><small>{mode.duel ? t.profile.inDuel(formatNumber(mode.duel)) : t.profile.soloOnly}{mode.training ? ` · ${t.profile.inTraining(formatNumber(mode.training))}` : ""}</small></th>
            <td><span className="pf-vol"><span className="pf-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, (mode.rounds / top) * 100)}%` }} /></span><b>{formatNumber(mode.rounds)}</b></span></td>
            <td className="pf-acc">{pctOf(mode.acc)}%</td>
            <td className="pf-time pf-opt">{mode.med ? formatSeconds(mode.med) : "—"}</td>
            <td className="pf-peak pf-opt">{mode.streak ? <span>{t.profile.streak(formatNumber(mode.streak.len))}</span> : "—"}{mode.best && <span>{t.profile.bestWindow(pctOf(mode.best.acc), mode.best.med ? formatSeconds(mode.best.med) : "—")} <small>({when(mode.best.from)})</small></span>}</td>
          </tr>)}</tbody>
        </table>
      </section>;
    })}</div>
  </div>;
}

/** Os anéis e as linhas que se medem por nível de carta (0 a 5) na Coleção. */
export const levelsOf = (cards: ReadonlyArray<{ id: string; mastery: number }>) => new Map(cards.map((card) => [card.id, card.mastery]));
export const useSet = (ids: readonly string[] | undefined) => useMemo(() => new Set(ids ?? []), [ids]);

// ---------- Seus reflexos (21/10/2026, mock ../mockups-carta-cega/progresso-v2) ----------
export type ReflexLookup = {
  name: (id: string) => string;
  flag: (id: string) => string | undefined;
  /** A linha de baixo de cada alvo (a capital, na escrita da capital). */
  sub?: (id: string, mode: ReflexMode) => string | undefined;
  /** O que a pessoa escreve, quando foge da grafia esperada (o "spain"); sem nada, não mostra. */
  typed?: (item: ReflexItem, mode: ReflexMode) => string | undefined;
};
export function ReflexesCard({ data, lookup, onTrain }: { data: readonly ReflexMode[]; lookup: ReflexLookup; onTrain?: (mode: ReflexMode) => void }) {
  const [key, setKey] = useState(data[0]?.key);
  const mode = data.find((item) => item.key === key) ?? data[0];
  if (!mode) return null;
  const max = Math.max(...mode.slow.map((item) => item.med));
  const label = modeLabel(mode, true);
  const row = (item: ReflexItem, kind: "fast" | "slow") => {
    const flag = lookup.flag(item.id);
    const sub = lookup.sub?.(item.id, mode);
    const typed = lookup.typed?.(item, mode);
    return <li key={item.id} className={kind}>
      {flag ? <img src={flag} alt="" loading="lazy" decoding="async" /> : <span className="pf-rx-noflag" aria-hidden="true" />}
      <span className="pf-rx-name"><b>{lookup.name(item.id)}</b><small>{sub ? `${sub} · ` : ""}{typed ? <>{t.profile.reflexTyped} <em>{typed}</em> · </> : null}{t.profile.reflexHits(item.n)}</small></span>
      <span className="pf-rx-bar" aria-hidden="true"><i style={{ width: `${(item.med / max) * 100}%` }} /><u style={{ left: `${Math.min(100, (mode.median / max) * 100)}%` }} /></span>
      <strong>{formatSeconds(item.med)}</strong>
    </li>;
  };
  return <section className="pr-card pf-rx" aria-labelledby="pf-rx">
    <header className="pf-head"><div><h2 id="pf-rx">{t.profile.reflexTitle}</h2><p>{t.profile.reflexSub}</p></div></header>
    <div className="pf-filter pf-rx-modes" role="group" aria-label={t.profile.reflexMode}>
      {data.map((item) => <button key={item.key} type="button" aria-pressed={item.key === mode.key} onClick={() => setKey(item.key)}>{modeLabel(item, true)} <small>{item.count}</small></button>)}
    </div>
    <div className="pf-rx-cols">
      <div><h3><span>{t.profile.reflexFast}</span><span>{t.profile.reflexMedian}</span></h3><ol>{mode.fast.map((item) => row(item, "fast"))}</ol></div>
      <div><h3><span>{t.profile.reflexSlow}</span><span>{t.profile.reflexMedian}</span></h3><ol>{mode.slow.map((item) => row(item, "slow"))}</ol></div>
    </div>
    <footer className="pf-rx-foot"><span>{t.profile.reflexNormal(label, formatSeconds(mode.median), mode.count)}</span>{onTrain && <button type="button" onClick={() => onTrain(mode)}>{t.profile.reflexTrain}</button>}</footer>
  </section>;
}
