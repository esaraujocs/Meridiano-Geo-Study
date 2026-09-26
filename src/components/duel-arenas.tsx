import { Icon } from "./icons";
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

// Hub em Duelo: uma arena por escada (liga, forma recente e modos do sorteio) e o painel dos próximos prêmios.
export function DuelArenas({ cards, next, formatReady, formatCost, onDuel, onLeague }: {
  cards: readonly LadderCard[];
  next: readonly Milestone[];
  formatReady: boolean;
  formatCost: number;
  onDuel: (ladder: Ladder) => void;
  onLeague?: () => void;
}) {
  return (
    <div className="arena-grid" role="region" aria-label={t.duel.modeDuel}>
      {cards.map((card) => <Arena key={card.ladder} card={card} formatReady={formatReady} formatCost={formatCost} onDuel={onDuel} />)}
      <aside className="pr-card prize" aria-label={t.duel.arenas.prizesTitle}>
        <header><div><h2>{t.duel.arenas.prizesTitle}</h2><p>{t.duel.arenas.prizesSub}</p></div></header>
        {next.length === 0
          ? <p className="pz-done">{t.duel.arenas.prizesDone}</p>
          : <ul>{next.map((milestone) => <li key={milestone.id} className={milestone.kind === "league" ? "is-big" : ""}>
            <span className="pz-ico"><Icon type={milestone.kind === "league" ? "star" : "achievements"} size={16} /></span>
            <span className="pz-t"><b>{milestoneLabel(milestone)}</b><small>{milestone.ladder ? t.duel.ladders[milestone.ladder] : t.duel.arenas.anyLadder} · {money(milestone.at)}</small></span>
            <strong>{t.duel.arenas.prizeCoins(money(milestone.coins))}</strong>
          </li>)}</ul>}
        <p className="pz-note">{t.duel.arenas.themeNote}</p>
        {onLeague && <button type="button" className="pr-link" onClick={onLeague}>{t.duel.arenas.seeLeague} <Icon type="arrow" size={16} /></button>}
      </aside>
    </div>
  );
}

function Arena({ card, formatReady, formatCost, onDuel }: { card: LadderCard; formatReady: boolean; formatCost: number; onDuel: (ladder: Ladder) => void }) {
  const { ladder, status } = card;
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
      <div className="ar-foot">
        <button type="button" className="ar-go" style={{ background: COLOR[ladder] }} onClick={() => onDuel(ladder)}><Icon type="swords" size={18} /> {t.duel.arenas.duel}{!formatReady && <Icon type="lock" size={13} />}</button>
        <button type="button" className="ar-friend" disabled title={t.duel.arenas.friendTitle} aria-label={`${t.duel.arenas.friend} · ${t.duel.arenas.friendSoon}`}><Icon type="swords" size={16} /><span className="ar-friend-t"> {t.duel.arenas.friend} </span><em>{t.duel.arenas.friendSoon}</em></button>
        <small className={formatReady ? "ar-format" : "ar-need"}>{formatReady ? t.duel.arenas.format : t.duel.arenas.needFormat(money(formatCost))}</small>
      </div>
    </article>
  );
}
