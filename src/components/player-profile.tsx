import { useState } from "react";
import { Icon } from "./icons";
import { PlayerInitial } from "./friends-screen";
import { LADDERS } from "../domain/duel-modes";
import { leagueLabel } from "../domain/duel-labels";
import { leagueOf } from "../domain/league";
import type { PvpServerMatch, PvpTally } from "../domain/pvp";
import { winRate, type PlayerProfile } from "../domain/pvp-social";
import { formatNumber, intlLocale, t } from "../domain/i18n";

const dateOf = (at: number) => new Date(at).toLocaleDateString(intlLocale, { day: "2-digit", month: "short", year: "numeric" });
const modeLabel = (mode: string) => (mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked);

// Perfil de um jogador: primeiro o duelo contra pessoas (liga e troféus por escada, placar, confronto direto e últimos duelos), depois o resumo do resto
// do jogo (o que o aparelho dele informou). Ações de amizade e o desafio direto no topo.
export function PlayerProfileScreen({ profile, loading, error, busy, onAdd, onRespond, onRemove, onChallenge, onBack }: {
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onAdd: () => void;
  onRespond: (accept: boolean) => void;
  onRemove: () => void;
  /** Desafiar (só amigo com o app aberto): leva à tela de Amigos com o desafio. */
  onChallenge: () => void;
  onBack: () => void;
}) {
  // desfazer a amizade pede um segundo toque (sem diálogo): o primeiro só troca o texto do botão
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!profile) {
    return (
      <main className="content rv-page pvp-page pp-page">
        <button type="button" className="back" onClick={onBack}>{t.social.back}</button>
        <section className="rv-card pvp-card">{error ? <p className="pvp-error" role="alert">{error}</p> : <p className="pvp-hint" role="status">{loading ? t.social.loading : t.social.notFound}</p>}</section>
      </main>
    );
  }
  const self = profile.friendship === "self";
  const summary = profile.summary;
  const games = (tally: PvpTally) => tally.wins + tally.losses + tally.draws;
  return (
    <main className="content rv-page pvp-page pp-page">
      <button type="button" className="back" onClick={onBack}>{t.social.back}</button>
      <section className="rv-card pvp-card pp-head" aria-labelledby="pp-name">
        <PlayerInitial name={profile.name} online={self ? undefined : profile.online} size="lg" />
        <div className="pp-id">
          <span className="eyebrow">{self ? t.social.yourProfile : t.social.profileEyebrow}</span>
          <h1 id="pp-name">{profile.name}</h1>
          <p>{[summary ? t.social.level(summary.level) : null, self ? null : profile.online ? t.social.online : t.social.offline, t.social.since(dateOf(profile.since))].filter(Boolean).join(" · ")}</p>
        </div>
        {!self && <div className="pp-actions">
          {profile.friendship === "friends" && <>
            <button type="button" className="rs-btn primary" disabled={busy || !profile.online} title={profile.online ? undefined : t.social.challengeOffline} onClick={onChallenge}><Icon type="swords" />{t.social.challenge}</button>
            <button type="button" className="rs-btn" disabled={busy} onClick={() => { if (confirmRemove) { setConfirmRemove(false); onRemove(); } else setConfirmRemove(true); }}>{confirmRemove ? t.social.removeConfirm : t.social.remove}</button>
          </>}
          {profile.friendship === "none" && <button type="button" className="rs-btn primary" disabled={busy} onClick={onAdd}>{t.social.add}</button>}
          {profile.friendship === "outgoing" && <>
            <span className="pp-state">{t.social.pending}</span>
            <button type="button" className="rs-btn" disabled={busy} onClick={onRemove}>{t.social.cancel}</button>
          </>}
          {profile.friendship === "incoming" && <>
            <span className="pp-state">{t.social.askedYou}</span>
            <button type="button" className="rs-btn primary" disabled={busy} onClick={() => onRespond(true)}>{t.social.accept}</button>
            <button type="button" className="rs-btn" disabled={busy} onClick={() => onRespond(false)}>{t.social.decline}</button>
          </>}
        </div>}
      </section>
      {error && <p className="pvp-error" role="alert">{error}</p>}

      <section className="rv-card pvp-card pp-pvp" aria-labelledby="pp-pvp-title">
        <h2 id="pp-pvp-title">{t.social.pvpTitle}</h2>
        <div className="pp-ladders">
          {LADDERS.map((ladder) => {
            const trophies = profile.ladders?.[ladder].trophies ?? 0;
            const status = leagueOf(trophies);
            return <div key={ladder} className="pp-ladder" data-league={status.league}>
              <span className="rv-k">{t.duel.ladders[ladder]}</span>
              <strong>{formatNumber(trophies)}</strong>
              <small>{t.duel.league.trophies} · {leagueLabel(status.league, status.division)}</small>
            </div>;
          })}
        </div>
        <div className="pp-tallies">
          <Tally label={t.pvp.modeRanked} tally={profile.pvp.ranked} />
          <Tally label={t.pvp.modeFriendly} tally={profile.pvp.friendly} />
        </div>
        {!self && <div className="pp-h2h">
          <h3>{t.social.h2hTitle(profile.name)}</h3>
          {games(profile.headToHead.ranked) + games(profile.headToHead.friendly) === 0
            ? <p className="pvp-hint">{t.social.h2hEmpty}</p>
            : <>
              <div className="pp-tallies">
                <Tally label={t.pvp.modeRanked} tally={profile.headToHead.ranked} />
                <Tally label={t.pvp.modeFriendly} tally={profile.headToHead.friendly} />
              </div>
              <MatchList matches={profile.headToHead.recent} />
            </>}
        </div>}
        <h3>{self ? t.social.recentMine : t.social.recentTitle(profile.name)}</h3>
        {profile.recent.length === 0 ? <p className="pvp-hint">{t.social.recentEmpty}</p> : <MatchList matches={profile.recent} />}
      </section>

      <section className="rv-card pvp-card pp-summary" aria-labelledby="pp-sum-title">
        <h2 id="pp-sum-title">{t.social.summaryTitle}</h2>
        {!summary
          ? <p className="pvp-hint">{t.social.noSummary}</p>
          : <>
            <dl className="pp-stats">
              <Stat label={t.social.stats.level} value={formatNumber(summary.level)} note={`${formatNumber(summary.xp)} XP`} />
              <Stat label={t.social.stats.mastery} value={`${summary.mastery}%`} note={t.social.stats.dominatedNote(summary.dominated)} />
              <Stat label={t.social.stats.collection} value={formatNumber(summary.collection.discovered)} note={t.social.stats.ofTotal(formatNumber(summary.collection.total))} />
              <Stat label={t.social.stats.achievements} value={formatNumber(summary.achievements.unlocked)} note={t.social.stats.ofTotal(formatNumber(summary.achievements.total))} />
              <Stat label={t.social.stats.sessions} value={formatNumber(summary.sessions)} note={t.social.stats.roundsNote(formatNumber(summary.rounds))} />
              <Stat label={t.social.stats.botDuels} value={formatNumber(games(summary.botDuels))} note={t.social.record(summary.botDuels.wins, summary.botDuels.losses, summary.botDuels.draws)} />
            </dl>
            {profile.summaryAt && <p className="pvp-hint">{t.social.summaryAt(dateOf(profile.summaryAt))}</p>}
          </>}
      </section>
    </main>
  );
}

function Tally({ label, tally }: { label: string; tally: PvpTally }) {
  const rate = winRate(tally);
  return (
    <div className="pp-tally">
      <span className="rv-k">{label}</span>
      <strong>{t.social.record(tally.wins, tally.losses, tally.draws)}</strong>
      <small>{rate === null ? t.social.noGames : t.social.winRate(rate)}</small>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="pp-stat"><dt>{label}</dt><dd><b>{value}</b><small>{note}</small></dd></div>;
}

function MatchList({ matches }: { matches: readonly PvpServerMatch[] }) {
  return (
    <ul className="pp-matches">
      {matches.map((match) => <li key={`${match.code}:${match.at}`} className={`is-${match.you.outcome}`}>
        <span className="pp-res">{t.duel.league[match.you.outcome]}</span>
        <span className="pp-m"><b>{t.social.vs(match.opponent.name)}</b><small>{t.duel.ladders[match.ladder]} · {modeLabel(match.mode)} · {dateOf(match.at)}</small></span>
        <span className="pp-score">{match.you.totals.correct} x {match.opponent.totals.correct}</span>
      </li>)}
    </ul>
  );
}
