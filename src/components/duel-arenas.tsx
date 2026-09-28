import { useMemo } from "react";
import { Icon } from "./icons";
import { useElapsed } from "./pvp-offer";
import { playersLeaderboard, rankWindow } from "../domain/leaderboard";
import type { LeaderboardRow, PvpQueueView } from "../domain/pvp";
import { LADDER_BASE, LADDER_BASE_GROUP, type Ladder } from "../domain/duel-modes";
import type { Milestone } from "../domain/duel-rewards";
import type { LadderCard } from "../domain/duel-view";
import { streakBonus } from "../domain/duel";
import { DIVISION_SPAN, divisionRoman } from "../domain/league";
import { leagueLabel, milestoneLabel, nextStep } from "../domain/duel-labels";
import { baseCoins } from "../domain/spoils";
import { formatNumber as money, t } from "../domain/i18n";

const COLOR: Record<Ladder, string> = { mapas: "#2B8378", bandeiras: "#B04A33" };
const FAM: Record<Ladder, string> = { mapas: "mapa", bandeiras: "bandeiras" };

/** Progresso dentro da divisão atual (0 a 100). */
const divisionProgress = (card: LadderCard) => {
  const { status } = card;
  if (status.nextDivisionAt === null || status.division === null) return 100;
  const start = status.floor + (status.division - 1) * DIVISION_SPAN;
  return Math.min(100, Math.max(0, ((card.trophies - start) / (status.nextDivisionAt - start)) * 100));
};

/** O que a arena faz com a fila de pessoas. "Duelar" busca uma pessoa (valendo) na escada; enquanto espera dá para duelar contra um bot (vale
 *  troféu, na transição) e, se alguém aparecer, a proposta chega em qualquer tela (aceitar anula o duelo contra o bot). */
export type ArenaSearch = {
  queue: PvpQueueView;
  /** Erro ao entrar na fila (sem conexão, por exemplo), na escada em que foi pedido: a arena oferece o bot direto. */
  error: { ladder: Ladder; message: string } | null;
  busy: boolean;
  onSearch: (ladder: Ladder) => void;
  onCancel: () => void;
  onBot: (ladder: Ladder) => void;
  onFriendly: (ladder: Ladder) => void;
};

// Hub em Duelo: uma arena por escada (liga, forma recente e modos do sorteio) e o painel dos próximos prêmios com o ranking (só gente de verdade).
export function DuelArenas({ cards, next, formatReady, formatCost, search, boards, onLeague, onFriends, onOpenPlayer }: {
  cards: readonly LadderCard[];
  next: readonly Milestone[];
  formatReady: boolean;
  formatCost: number;
  search: ArenaSearch;
  /** O ranking de cada escada vindo do servidor (null enquanto não chegou ou sem conexão). */
  boards: Record<Ladder, readonly LeaderboardRow[] | null>;
  onLeague?: () => void;
  onFriends?: () => void;
  /** Abre o perfil de quem está no ranking. */
  onOpenPlayer?: (code: string) => void;
}) {
  // o ranking do painel é o da escada em que a pessoa está mais alta
  const best = cards.reduce((top, card) => (card.trophies > top.trophies ? card : top), cards[0]);
  const bestBoard = boards[best.ladder];
  const rank = useMemo(() => rankWindow(playersLeaderboard(bestBoard ?? [], best.trophies), 3), [bestBoard, best.trophies]);
  return (
    <div className="arena-grid" role="region" aria-label={t.duel.modeDuel}>
      {cards.map((card) => <Arena key={card.ladder} card={card} formatReady={formatReady} formatCost={formatCost} search={search} />)}
      <aside className="pr-card prize" aria-label={t.duel.arenas.prizesTitle}>
        <header><div><h2>{t.duel.arenas.prizesTitle}</h2><p>{t.duel.arenas.prizesSub}</p></div></header>
        {next.length === 0
          ? <p className="pz-done">{t.duel.arenas.prizesDone}</p>
          : <ul>{next.map((milestone) => <li key={milestone.id} className={milestone.kind === "league" ? "is-big" : ""}>
            <span className="pz-ico"><Icon type={milestone.kind === "league" ? "star" : "achievements"} size={16} /></span>
            <span className="pz-t"><b>{milestoneLabel(milestone)}</b><small>{milestone.ladder ? t.duel.ladders[milestone.ladder] : t.duel.arenas.anyLadder} · {money(milestone.at)}</small></span>
            <strong>{t.duel.arenas.prizeCoins(money(milestone.coins))}</strong>
          </li>)}</ul>}
        <section className="pz-rank" aria-label={t.duel.rank.title(t.duel.ladders[best.ladder])}>
          <h3>{t.duel.rank.title(t.duel.ladders[best.ladder])}</h3>
          <ol>{rank.map((line, index) => "gap" in line
            ? <li key={`gap${index}`} className="rk-gap" aria-hidden="true">⋯</li>
            : <li key={line.id} className={line.you ? "is-you" : ""} data-league={line.league}>
              <span className="rk-n">{line.pos}</span>
              {!line.you && line.code && onOpenPlayer
                ? <button type="button" className="rk-nm rk-open" onClick={() => onOpenPlayer(line.code as string)} aria-label={t.social.openProfile(line.name)}>{line.name}</button>
                : <span className="rk-nm">{line.you ? t.duel.rank.you : line.name}{line.bot && <em>{t.duel.rank.bot}</em>}</span>}
              <strong>{money(line.trophies)}</strong>
            </li>)}</ol>
          {rank.length <= 1 && <p className="pz-note">{bestBoard === null ? t.duel.rank.offline : t.duel.rank.alone}</p>}
        </section>
        <div className="pz-links">
          {onLeague && <button type="button" className="pr-link" onClick={onLeague}>{t.duel.arenas.seeLeague} <Icon type="arrow" size={16} /></button>}
          {onFriends && <button type="button" className="pr-link" onClick={onFriends}>{t.social.friendsButton} <Icon type="arrow" size={16} /></button>}
        </div>
      </aside>
    </div>
  );
}

function Arena({ card, formatReady, formatCost, search }: { card: LadderCard; formatReady: boolean; formatCost: number; search: ArenaSearch }) {
  const { ladder, status } = card;
  const { queue } = search;
  const searchingHere = queue.state !== "idle" && queue.prefs?.ladder === ladder;
  const errorHere = !searchingHere && search.error?.ladder === ladder ? search.error.message : null;
  const step = nextStep(status);
  const baseGroup = t.duel.groups[LADDER_BASE_GROUP[ladder]];
  const rate = baseCoins(LADDER_BASE[ladder].variant);
  const label = leagueLabel(status.league, status.division);
  return (
    <article className="family arena" id={`arena-${ladder}`} data-fam={FAM[ladder]} data-league={status.league}>
      <div className="ar-head">
        <span className="ar-ico" style={{ color: COLOR[ladder] }}><Icon type={ladder === "mapas" ? "map" : "flag"} size={22} /></span>
        <div><h3>{t.duel.ladders[ladder]}</h3><p>{t.duel.arenas.sub[ladder]}</p></div>
        <span className="ar-tag">{label}</span>
      </div>
      <div className="ar-league">
        <div className="ar-emblem lg-frame" role="img" aria-label={t.duel.frameAria(label)}><b>{money(card.trophies)}</b><small>{t.duel.league.trophies}</small><span className="lg-pip">{divisionRoman(status.division) || "M"}</span></div>
        <div className="ar-lgtext">
          <strong>{step ? t.duel.arenas.toNext(money(step.remaining), step.label) : t.duel.arenas.topLeague}</strong>
          <span className="pr-bar"><i style={{ width: `${divisionProgress(card)}%`, background: "var(--lg)" }} /></span>
          <div className="ar-formrow">
            <small>{t.duel.arenas.lastFive}</small>
            {card.form.length === 0
              ? <small>{t.duel.arenas.noDuelsYet}</small>
              : <span className="ar-form">{card.form.map((outcome, index) => <i key={index} className={outcome} role="img" aria-label={t.duel.arenas.formAria[outcome]}>{t.duel.arenas.form[outcome]}</i>)}</span>}
          </div>
          {card.streak > 0 && <small className="ar-streak">{t.duel.arenas.streak(card.streak, streakBonus(card.streak))}</small>}
        </div>
      </div>
      <div className="ar-modes-wrap">
        <small className="ar-k">{t.duel.arenas.inTheDraw}</small>
        <div className="ar-modes">{card.groups.map(({ group, owned }) => <span key={group} className={`ar-chip${owned ? "" : " is-prev"}`} title={owned ? undefined : t.duel.arenas.preview}>{t.duel.groups[group]}{!owned && <><Icon type="lock" size={12} /><span className="sr-only">{t.duel.arenas.preview}</span></>}</span>)}</div>
        <p className="ar-rule"><Icon type="info" size={16} /><span>{t.duel.arenas.previewRule(baseGroup, rate)}</span></p>
      </div>
      {searchingHere
        ? <ArenaSearching ladder={ladder} search={search} formatReady={formatReady} formatCost={formatCost} />
        : <div className="ar-foot">
          <button type="button" className="ar-go" style={{ background: COLOR[ladder] }} disabled={search.busy} onClick={() => search.onSearch(ladder)}><Icon type="swords" size={18} /> {t.duel.arenas.duel}</button>
          <button type="button" className="ar-friend is-text" onClick={() => search.onFriendly(ladder)}><Icon type="swords" size={16} /><span className="ar-friend-t"> {t.duel.arenas.friendly} </span></button>
          <small className="ar-format">{t.duel.arenas.duelNote}</small>
          {errorHere && <div className="ar-search-err" role="alert">
            <p className="pvp-error">{errorHere}</p>
            <button type="button" className="ar-friend is-text" onClick={() => search.onBot(ladder)}><Icon type="swords" size={16} /><span className="ar-friend-t"> {t.duel.arenas.botNow} </span>{!formatReady && <Icon type="lock" size={13} />}</button>
          </div>}
        </div>}
    </article>
  );
}

/** A arena enquanto a pessoa espera um adversário (estilo "fila com treino" do Street Fighter 6): o tempo de busca, o bot opcional e cancelar. */
function ArenaSearching({ ladder, search, formatReady, formatCost }: { ladder: Ladder; search: ArenaSearch; formatReady: boolean; formatCost: number }) {
  const { queue } = search;
  const wait = useElapsed(queue.since, queue.serverNow);
  const mode = queue.prefs?.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked;
  const status = queue.state === "offer" ? t.pvp.home.offerOpen : queue.state === "matched" ? t.pvp.home.matched : t.duel.arenas.searching;
  return (
    <div className="ar-foot ar-foot-search">
      <div className="pvp-waiting ar-search" role="status" aria-live="polite">
        <span className="pvp-waiting-dot" aria-hidden="true" />
        <div><b>{status}</b><small>{t.duel.arenas.searchingDetail(mode, wait, queue.waiting)}</small></div>
      </div>
      <button type="button" className="ar-go" style={{ background: COLOR[ladder] }} disabled={queue.state === "matched"} onClick={() => search.onBot(ladder)}><Icon type="swords" size={18} /> {t.duel.arenas.botWhileWaiting}{!formatReady && <Icon type="lock" size={13} />}</button>
      <button type="button" className="ar-friend is-text" disabled={search.busy || queue.state === "matched"} onClick={search.onCancel}><span className="ar-friend-t">{t.pvp.home.cancel}</span></button>
      <small className={formatReady ? "ar-format" : "ar-need"}>{formatReady ? t.duel.arenas.searchNote : t.duel.arenas.needFormat(money(formatCost))}</small>
    </div>
  );
}
