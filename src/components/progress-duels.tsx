// Aba "Duelos" do Progresso (22/10/2026, mock ../mockups-carta-cega/duelo-stats): o desempenho contra os bots, por escada (força estimada,
// desempenho, retrospecto, você × bots por modo, evolução, contra cada jeito e os rivais) e contra as pessoas. Contas em domain/duel-stats.ts.
import { useContext, useMemo, useState } from "react";
import type { DuelRecord } from "../domain/duel";
import type { LadderCard } from "../domain/duel-view";
import type { Ladder } from "../domain/duel-modes";
import type { LadderEntry } from "../domain/pvp-trophies";
import type { PvpMatchRecord } from "../domain/pvp-store";
import type { BotStyle } from "../domain/bots";
import { botById } from "../domain/bots";
import { leagueLabel, styleLabel } from "../domain/duel-labels";
import { estimatedSkill, ladderStats, peopleStats } from "../domain/duel-stats";
import { formatSeconds } from "../domain/session-view";
import { formatNumber, t } from "../domain/i18n";
import { OpenPlayerContext } from "./progress-view";

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const styleName = (style: BotStyle) => (style === "especialista" ? t.profile.duelTab.styleSpecialist : style === "regional" ? t.profile.duelTab.styleRegional : styleLabel(style, null));

export function DuelsTab({ duels, entries, pvpMatches, ladders }: { duels: readonly DuelRecord[]; entries: readonly LadderEntry[]; pvpMatches: readonly PvpMatchRecord[]; ladders: readonly LadderCard[] }) {
  const T = t.profile.duelTab;
  const played = (ladder: Ladder) => duels.some((duel) => duel.ladder === ladder);
  const [ladder, setLadder] = useState<Ladder>(() => (played("bandeiras") || !played("mapas") ? "bandeiras" : "mapas"));
  const stats = useMemo(() => ladderStats(duels, entries, ladder), [duels, entries, ladder]);
  // a força pelos acertos e pelo tempo: uma simulação com semente fixa (~50 ms), só da escada à vista
  const skill = useMemo(() => estimatedSkill(duels.filter((duel) => duel.ladder === ladder).sort((a, b) => a.at - b.at).slice(-20)), [duels, ladder]);
  const people = useMemo(() => peopleStats(pvpMatches), [pvpMatches]);
  const openPlayer = useContext(OpenPlayerContext);
  const card = ladders.find((item) => item.ladder === ladder);
  const maxMs = Math.max(1, ...stats.modes.map((mode) => (mode.msRounds ? Math.max(mode.youMs, mode.botMs) / mode.msRounds : 0)));
  const windows = stats.windows;
  const low = Math.min(...windows.map((w) => w.perf)) - 80, high = Math.max(...windows.map((w) => w.perf)) + 80;
  const x = (index: number) => (index / Math.max(1, windows.length - 1)) * 300;
  const y = (perf: number) => 70 - ((perf - low) / Math.max(1, high - low)) * 60;
  return <div className="pd">
    <div className="pd-top">
      <div><h2>{T.title}</h2><p>{T.sub}</p></div>
      <div className="pg-chips" role="group" aria-label={T.title}>
        {(["bandeiras", "mapas"] as const).map((key) => <button key={key} type="button" className="pg-chip" aria-pressed={ladder === key} onClick={() => setLadder(key)}>{t.duel.ladders[key]}</button>)}
      </div>
    </div>
    {!stats.duels ? <p className="pr-card pd-empty">{T.empty}</p> : <>
      <div className="pd-kpis">
        <div className="pd-kpi"><small>{T.trophies}</small><b>{formatNumber(card?.trophies ?? 0)}</b><span>{card ? leagueLabel(card.status.league, card.status.division) : ""}</span></div>
        <div className="pd-kpi is-key"><small>{T.skill}</small><b>{skill === null ? "—" : formatNumber(skill)}</b><span>{skill === null ? T.skillNone : T.skillNote}</span></div>
        <div className="pd-kpi"><small>{T.perf}</small><b>{stats.perf20 === null ? "—" : formatNumber(stats.perf20)}</b><span>{T.perfNote(stats.last20.wins, stats.last20.duels)}</span></div>
        <div className="pd-kpi"><small>{T.record}</small><b>{stats.wins}–{stats.losses}</b><span>{T.recordNote(pct(stats.wins, stats.duels), stats.tiebreakWins)}</span></div>
      </div>
      <div className="pd-grid">
        <section className="pr-card pd-card pd-modes" aria-labelledby="pd-modes">
          <header className="pf-head"><div><h2 id="pd-modes">{T.modesTitle}</h2><p>{T.modesSub}</p></div></header>
          <div className="pd-mh" aria-hidden="true"><span /><span>{T.colAccuracy}</span><span>{T.colTime}</span><span>{T.colLegs}</span></div>
          {stats.modes.map((mode) => <div className="pd-mr" key={mode.group}>
            <b>{t.duel.groups[mode.group]}<small>{T.rounds(formatNumber(mode.rounds))}</small></b>
            <span className="pd-pair" aria-label={`${T.colAccuracy}: ${T.pairAria(`${pct(mode.you, mode.rounds)}%`, `${pct(mode.bot, mode.rounds)}%`)}`}><i className="you">{pct(mode.you, mode.rounds)}%</i><i className="bot">{pct(mode.bot, mode.rounds)}%</i></span>
            {mode.msRounds
              ? <span className="pd-bars" aria-label={`${T.colTime}: ${T.pairAria(formatSeconds(mode.youMs / mode.msRounds), formatSeconds(mode.botMs / mode.msRounds))}`}>
                <em className="you" style={{ width: `${(mode.youMs / mode.msRounds / maxMs) * 100}%` }}><u>{formatSeconds(mode.youMs / mode.msRounds)}</u></em>
                <em className="bot" style={{ width: `${(mode.botMs / mode.msRounds / maxMs) * 100}%` }}><u>{formatSeconds(mode.botMs / mode.msRounds)}</u></em>
              </span>
              : <small className="pd-notime">{T.noTime}</small>}
            <span className="pd-win"><strong>{pct(mode.legWins, mode.legs)}%</strong><small>{T.legsOf(mode.legWins, mode.legs)}</small></span>
          </div>)}
          <p className="pd-legend"><i className="you" aria-hidden="true" />{T.you} <i className="bot" aria-hidden="true" />{T.bots}</p>
        </section>
        <section className="pr-card pd-card" aria-labelledby="pd-evo">
          <header className="pf-head"><div><h2 id="pd-evo">{T.evoTitle}</h2><p>{T.evoSub}</p></div></header>
          {windows.length >= 2 ? <>
            <svg viewBox="-8 0 316 80" className="pd-spark" role="img" aria-label={T.evoAria(formatNumber(windows[0].perf), formatNumber(windows[windows.length - 1].perf))}>
              <polyline points={windows.map((w, i) => `${x(i)},${y(w.perf)}`).join(" ")} />
              {windows.map((w, i) => <circle key={w.at} cx={x(i)} cy={y(w.perf)} r={3} />)}
            </svg>
            <div className="pd-spark-x" aria-hidden="true"><span>{formatNumber(windows[0].perf)}</span><span>{T.evoNow(formatNumber(windows[windows.length - 1].perf))}</span></div>
          </> : <p className="pd-few">{T.evoFew}</p>}
        </section>
        <section className="pr-card pd-card" aria-labelledby="pd-styles">
          <header className="pf-head"><div><h2 id="pd-styles">{T.stylesTitle}</h2><p>{T.stylesSub}</p></div></header>
          <ul className="pd-styles">{stats.styles.map((style) => <li key={style.style}>
            <b>{styleName(style.style)}</b>
            <i style={{ ["--p" as string]: `${pct(style.wins, style.duels)}%` }} aria-hidden="true" />
            <small>{T.styleLine(pct(style.wins, style.duels), style.duels)}</small>
          </li>)}</ul>
        </section>
        <section className="pr-card pd-card" aria-labelledby="pd-rivals">
          <header className="pf-head"><div><h2 id="pd-rivals">{T.rivalsTitle}</h2><p>{T.rivalsSub}</p></div></header>
          <ol className="pd-rivals">{stats.rivals.map((rival) => {
            const bot = botById(rival.botId);
            return <li key={rival.botId}>
              <b>{bot?.name || rival.botId}<small>{bot ? `${leagueLabel(bot.league)} · ${styleLabel(bot.style, bot.specialty, bot.region)}` : ""}</small></b>
              <span className="pd-wl">{rival.wins}–{rival.losses}</span>
              <span className={`pd-delta ${rival.delta >= 0 ? "up" : "down"}`}>{rival.delta >= 0 ? "+" : "−"}{formatNumber(Math.abs(rival.delta))}</span>
            </li>;
          })}</ol>
        </section>
      </div>
    </>}
    <div className="pd-people">
      <section className="pr-card pd-card" aria-labelledby="pd-people">
        <header className="pf-head"><div><h2 id="pd-people">{T.peopleTitle}</h2><p>{people.duels ? T.peopleSub(people.duels, people.ranked) : T.peopleNone}</p></div></header>
        {people.duels > 0 && <>
          <div className="pd-vs"><div><b>{people.wins}</b><small>{T.wins}</small></div><em aria-hidden="true">×</em><div><b>{people.losses}</b><small>{T.losses}</small></div></div>
          <table className="pd-ptable">
            <thead><tr><th scope="col"><span className="sr-only">{T.peopleTitle}</span></th><th scope="col">{T.you}</th><th scope="col">{T.them}</th></tr></thead>
            <tbody>
              <tr><th scope="row">{T.perDuel}</th><td><i className="you">{people.you.toFixed(1).replace(".", ",")}</i></td><td><i className="bot">{people.them.toFixed(1).replace(".", ",")}</i></td></tr>
              {people.youMs !== null && people.themMs !== null && <tr><th scope="row">{T.perAnswer}</th><td><i className="you">{formatSeconds(people.youMs)}</i></td><td><i className="bot">{formatSeconds(people.themMs)}</i></td></tr>}
            </tbody>
          </table>
        </>}
      </section>
      {people.rivals.length > 0 && <section className="pr-card pd-card" aria-labelledby="pd-plist">
        <header className="pf-head"><div><h2 id="pd-plist">{T.peopleListTitle}</h2><p>{T.peopleListSub}</p></div></header>
        <ol className="pd-rivals">{people.rivals.map((rival) => <li key={rival.code ?? rival.name}>
          {rival.code && openPlayer ? <button type="button" className="pd-person" onClick={() => openPlayer(rival.code as string)}>{rival.name}</button> : <b>{rival.name}</b>}
          <span className="pd-wl">{rival.wins}–{rival.losses}</span>
          <span className="pd-delta">{T.timesFaced(rival.duels)}</span>
        </li>)}</ol>
      </section>}
    </div>
    <p className="pd-note">{T.note}</p>
  </div>;
}
