import { useState } from "react";
import { Icon } from "./icons";
import { trophiesByLadder, type DuelRecord } from "../domain/duel";
import { LADDERS, type Ladder } from "../domain/duel-modes";
import { botById, botProfile, botsOfLeague } from "../domain/bots";
import { botLabel, styleLabel } from "../domain/duel-labels";
import { leaderboard, rankWindow } from "../domain/leaderboard";
import { BASE_WIN, LEAD_BONUS, PERF_MAX, WIN_CAP_EXTRA, baseStakes } from "../domain/mmr";
import { LEAGUES, LEAGUE_SPAN, MASTER_AT, divisionRoman, leagueFloor, leagueOf, type LeagueKey } from "../domain/league";
import { formatNumber, t } from "../domain/i18n";

const signed = (value: number) => (value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(Math.abs(value))}` : "0");
const nameOf = (league: LeagueKey, division: 1 | 2 | 3 | null = null) => t.duel.leagueName(t.duel.leagues[league], divisionRoman(division));
const when = (at: number) => new Date(at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
/** Posição na régua (0 a 100): o Mestre é a ponta direita. */
const along = (trophies: number) => Math.min(100, (trophies / MASTER_AT) * 100);
const RING = 2 * Math.PI * 58;

// Tela da Liga: uma aba por escada (Mapas e Bandeiras, cada uma com a sua liga) com troféus, régua de ligas e divisões,
// adversários (bots), últimos duelos da escada; as molduras do nível valem a melhor das duas.
export function LeagueScreen({ duels, initialLadder, onBack }: { duels: readonly DuelRecord[]; initialLadder?: Ladder; onBack: () => void }) {
  const byLadder = trophiesByLadder(duels);
  const best = LADDERS.reduce((top, item) => (byLadder[item] > byLadder[top] ? item : top), LADDERS[0]);
  const [ladder, setLadder] = useState<Ladder>(initialLadder ?? best);
  const trophies = byLadder[ladder];
  const bestTrophies = byLadder[best];
  const status = leagueOf(trophies);
  const title = nameOf(status.league, status.division);
  const nextName = status.toNextDivision === null ? null : status.division === 3
    ? nameOf(LEAGUES[status.index + 1])
    : nameOf(status.league, ((status.division ?? 1) + 1) as 2 | 3);
  const ringFraction = status.toNextLeague === null ? 1 : (trophies - status.floor) / LEAGUE_SPAN;
  const rank = rankWindow(leaderboard(ladder, trophies), 10);
  const recent = duels.filter((duel) => duel.ladder === ladder).sort((a, b) => b.at - a.at).slice(0, 6);
  return (
    <main className="content surface" data-surface="progress">
      <button className="back" onClick={onBack}>{t.common.backHub}</button>
      <section className="pr lg-page" aria-label={t.duel.league.title}>
        <div className="lg-tabs" role="group" aria-label={t.duel.league.tabsAria}>
          <div className="mode-switch">
            {LADDERS.map((item) => {
              const itemStatus = leagueOf(byLadder[item]);
              return <button type="button" key={item} aria-pressed={ladder === item} onClick={() => setLadder(item)}><Icon type={item === "mapas" ? "map" : "flag"} size={15} />{t.duel.ladders[item]}<small>{nameOf(itemStatus.league, itemStatus.division)}</small></button>;
            })}
          </div>
        </div>
        <div className="pg-hero" data-league={status.league} data-ladder={ladder}>
          <div className="pg-hero-main">
            <div className="pg-ring lg-ring lg-frame" role="img" aria-label={t.duel.frameAria(title)}>
              <svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="58" fill="var(--paper)" stroke="rgba(199,182,143,.7)" strokeWidth="8" /><circle cx="66" cy="66" r="58" fill="none" stroke="var(--lg)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${RING * ringFraction} ${RING}`} transform="rotate(-90 66 66)" /></svg>
              <div><b>{formatNumber(trophies)}</b><span>{t.duel.league.trophies}</span></div>
              <span className="lg-pip">{divisionRoman(status.division) || "M"}</span>
            </div>
            <div className="pg-title">
              <span className="pg-eyebrow">{t.duel.league.eyebrow(t.duel.ladders[ladder])}</span>
              <h1>{title}</h1>
              <p>{nextName && status.toNextDivision !== null ? <b>{t.duel.league.toNext(formatNumber(status.toNextDivision), nextName)}</b> : t.duel.league.top}</p>
            </div>
          </div>
          <div className="pr-track" role="group" aria-label={t.duel.league.railAria}>
            <div className="pr-rail-wrap"><div className="pr-rail">
              <i style={{ width: `${along(trophies)}%` }} />
              <span className="pr-you" style={{ left: `${along(trophies)}%` }}><em>{t.duel.league.youAt(formatNumber(trophies))}</em></span>
              {LEAGUES.map((league, index) => {
                const start = leagueFloor(index);
                const reached = trophies >= start;
                const now = status.index === index;
                return <span key={league}>
                  <span className={`pr-node${reached ? " done" : ""}${now ? " now" : ""}`} aria-current={now ? "step" : undefined} style={{ left: `${along(start)}%` }}>
                    {reached && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5l10-10" /></svg>}
                    <span className="pr-node-label"><b>{t.duel.leagues[league]}</b><small>{formatNumber(start)}</small></span>
                  </span>
                  {index < LEAGUES.length - 1 && [1, 2].map((division) => {
                    const mark = start + division * 167;
                    return <span key={division} className={`lg-tick${trophies >= mark ? " on" : ""}`} style={{ left: `${along(mark)}%` }}><i>{divisionRoman((division + 1) as 2 | 3)}</i></span>;
                  })}
                </span>;
              })}
            </div></div>
          </div>
        </div>

        <div className="pr-row pr-row-a" style={{ marginTop: 18 }}>
          <section className="pr-card">
            <header><div><h2>{t.duel.league.botsTitle}</h2><p>{t.duel.league.botsSub}</p></div></header>
            <ul className="rk">
              {botsOfLeague(status.league).map((bot) => {
                const profile = botProfile(bot, { division: status.division, family: null });
                return <li key={bot.id} className="rk-li lg-bot" data-league={bot.league}>
                  <span className="rk-av lg-badge" aria-hidden="true">{bot.name.charAt(0)}</span>
                  <span className="pr-rname"><b>{bot.name}</b><small>{t.duel.league.botLine(styleLabel(bot.style, bot.specialty), Math.round(profile.accuracy * 100), t.time.seconds(Math.round(profile.avgMs / 1000)))}</small></span>
                  <strong className="rk-val">{Math.round(profile.accuracy * 100)}%</strong>
                </li>;
              })}
            </ul>
          </section>
          <section className="pr-card pr-recent">
            <header><div><h2>{t.duel.league.recentTitle}</h2><p>{t.duel.league.recentSub}</p></div></header>
            {recent.length === 0
              ? <p className="lg-empty">{t.duel.league.recentEmpty}</p>
              : <ul>{recent.map((duel) => {
                const bot = botById(duel.botId);
                return <li key={duel.id}>
                  <span className="rk-av lg-badge" data-league={bot?.league} aria-hidden="true"><Icon type="swords" size={16} /></span>
                  <span className="pr-rname"><b>{t.duel.league[duel.outcome]} · {bot ? botLabel(bot) : "—"}</b><small>{duel.playerCorrect} x {duel.botCorrect} · {when(duel.at)}</small></span>
                  <span className="pr-s-res"><b className={duel.delta >= 0 ? "rk-win" : "rk-loss"}>{signed(duel.delta)}</b></span>
                </li>;
              })}</ul>}
          </section>
        </div>

        <section className="pr-card lg-rank" style={{ marginTop: 16 }}>
          <header><div><h2>{t.duel.rank.title(t.duel.ladders[ladder])}</h2><p>{t.duel.rank.sub}</p></div></header>
          <ol className="rk">{rank.map((line, index) => "gap" in line
            ? <li key={`gap${index}`} className="rk-gap" aria-hidden="true">⋯</li>
            : <li key={line.id} className={`rk-li${line.you ? " is-you" : ""}`} data-league={line.league}>
              <span className="rk-n">{line.pos}</span>
              <span className="pr-rname"><b>{line.you ? t.duel.rank.you : line.name}{line.bot && <em className="rk-bot">{t.duel.rank.bot}</em>}</b><small>{t.duel.leagues[line.league]}</small></span>
              <strong className="rk-val">{formatNumber(line.trophies)}</strong>
            </li>)}</ol>
        </section>

        <section className="pr-card lg-how" style={{ marginTop: 16 }}>
          <details>
            <summary><h2>{t.duel.league.howTitle}</h2><Icon type="chevron" size={16} /></summary>
            <p>{t.duel.league.howLead}</p>
            <table>
              <thead><tr><th>{t.duel.league.howCols.league}</th><th>{t.duel.league.howCols.win}</th><th>{t.duel.league.howCols.loss}</th></tr></thead>
              <tbody>{LEAGUES.map((league, index) => {
                const start = baseStakes(leagueFloor(index));
                const falling = baseStakes(leagueFloor(index) + LEAGUE_SPAN - 1).win < start.win || start.win < BASE_WIN;
                return <tr key={league} className={league === status.league ? "is-now" : ""}>
                  <th scope="row">{t.duel.leagues[league]}</th>
                  <td>{falling ? t.duel.league.howFalling(start.win) : t.duel.league.howWin(start.win, start.win + WIN_CAP_EXTRA)}</td>
                  <td>{falling ? t.duel.league.howRising(start.loss) : start.loss}</td>
                </tr>;
              })}</tbody>
            </table>
            <ul>{t.duel.league.howPoints(BASE_WIN, PERF_MAX, WIN_CAP_EXTRA, BASE_WIN + WIN_CAP_EXTRA + (LEAD_BONUS[LEAD_BONUS.length - 1] ?? 0)).map((point, index) => <li key={index}>{point}</li>)}</ul>
          </details>
        </section>

        <section className="pr-card" style={{ marginTop: 16 }}>
          <header><div><h2>{t.duel.league.framesTitle}</h2><p>{t.duel.league.framesSub}</p></div></header>
          <div className="lg-frames">
            {LEAGUES.map((league, index) => {
              const reached = bestTrophies >= leagueFloor(index);
              return <div key={league} className={`lg-frame-item${reached ? "" : " is-locked"}`}>
                <div className="hub-level lg-frame" data-league={league}><strong>20</strong><span className="lg-pip">{league === "mestre" ? "M" : "I"}</span></div>
                <b>{t.duel.leagues[league]}</b>
                <small>{reached ? t.duel.league.unlocked : t.duel.league.from(formatNumber(leagueFloor(index)))}</small>
              </div>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
