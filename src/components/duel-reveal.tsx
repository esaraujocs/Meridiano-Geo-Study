import { Icon } from "./icons";
import { useEnterKey } from "./use-enter-key";
import { stakesRange, streakBonus } from "../domain/duel";
import { BASE_WIN, LEAD_BONUS, WIN_CAP_EXTRA } from "../domain/mmr";
import { previewLegs, type DuelRun } from "../domain/duel-run";
import { LADDER_BASE_GROUP, groupsOfLadder, type ModeGroup } from "../domain/duel-modes";
import { botLabel, leagueLabel, styleLabel } from "../domain/duel-labels";
import { policyFor } from "../domain/economy-rules";
import { LEAGUES, divisionRoman, leagueOf } from "../domain/league";
import { baseCoins } from "../domain/spoils";
import { formatNumber as money, t } from "../domain/i18n";

// Revelação do duelo: quem é o adversário, os dois tempos (com a regra de moedas dos modos de prévia) e o que está em jogo.
// O modo e o adversário são sorteados; aqui a pessoa só descobre e começa.
export function DuelReveal({ run, unlocked, balance, formatOwned, formatCost, busy, onStart, onBack, onBuyFormat, debug }: {
  run: DuelRun;
  unlocked: readonly string[];
  balance: number;
  /** O corte de 20 rodadas da Loja, exigido para duelar. */
  formatOwned: boolean;
  formatCost: number;
  busy: boolean;
  onStart: () => void;
  onBack: () => void;
  onBuyFormat: () => void;
  /** Só com ?debug=1: escolher os modos dos tempos para testar. */
  debug?: { onPick: (index: number, group: ModeGroup) => void };
}) {
  const player = leagueOf(run.trophiesBefore);
  const playerLabel = leagueLabel(player.league, player.division);
  const lead = Math.max(0, LEAGUES.indexOf(run.bot.league) - player.index);
  const stakes = stakesRange(run.trophiesBefore, run.mmr, run.streak, lead);
  const legs = previewLegs(run, unlocked);
  const baseGroupLabel = t.duel.groups[LADDER_BASE_GROUP[run.ladder]];
  const canBuy = balance >= formatCost;
  // Enter começa o duelo (comprar o corte de 20 rodadas continua sendo um clique deliberado)
  useEnterKey(() => { if (formatOwned && !busy) onStart(); });
  return (
    <main className="content rv-page" data-league={player.league}>
      <button type="button" className="back" onClick={onBack}>← {t.duel.reveal.cancel}</button>
      <section className="rv-card">
        <span className="eyebrow">{t.duel.reveal.eyebrow(t.duel.ladders[run.ladder])}</span>
        <h1>{t.duel.reveal.title}</h1>
        <div className="rv-vs">
          <div className="rv-side">
            <div className="ar-emblem lg-frame" data-league={player.league}><Icon type="achievements" size={34} /><span className="lg-pip">{divisionRoman(player.division) || "M"}</span></div>
            <strong>{t.duel.reveal.you}</strong>
            <small>{playerLabel} · {money(run.trophiesBefore)}</small>
          </div>
          <span className="rv-x">VS</span>
          <div className="rv-side">
            <div className="rv-bot" data-league={run.bot.league}><b>{run.bot.name.charAt(0)}</b></div>
            <strong>{botLabel(run.bot)}</strong>
            <small>{t.duel.opponentMeta(leagueLabel(run.bot.league), styleLabel(run.bot.style, run.bot.specialty))}</small>
          </div>
        </div>
        <ul className="rv-legs">
          {legs.map(({ index, leg, owned, coin }) => {
            const price = policyFor(leg.family, leg.variant, "mundo")?.cost ?? 0;
            return <li key={index} className={`rv-leg${owned ? "" : " is-prev"}`}>
              <span className="rv-n">{index + 1}º</span>
              <span className="rv-mode">
                <b>{t.duel.groups[leg.group]}</b>
                <small>{owned ? t.duel.reveal.ownLine(leg.rounds, baseCoins(coin.variant)) : t.duel.reveal.previewLine(leg.rounds, baseGroupLabel, baseCoins(coin.variant))}</small>
              </span>
              <span className="rv-tag">{!owned && <Icon type="lock" size={12} />}{owned ? t.duel.reveal.ownMode : t.duel.reveal.preview}</span>
              {!owned && price > 0 && <span className="rv-buy">{t.duel.reveal.getMode(money(price))}</span>}
            </li>;
          })}
        </ul>
        {debug && <div className="rv-debug" role="group" aria-label={t.duel.reveal.debug}>
          <small>{t.duel.reveal.debug}</small>
          {legs.map(({ index, leg }) => <div key={index} className="cv-chips">
            {groupsOfLadder(run.ladder).map((def) => <button type="button" key={def.group} className="cv-chip" aria-pressed={leg.group === def.group} onClick={() => debug.onPick(index, def.group)}><span className="cv-l"><span>{t.duel.groups[def.group]}</span></span></button>)}
          </div>)}
        </div>}
        <div className="rv-stakes">
          <span className="up">{t.duel.reveal.winRange(money(stakes.win[0]), money(stakes.win[1]))}</span>
          <span className="down">{stakes.loss[1] === 0 ? t.duel.reveal.noLoss : t.duel.reveal.loseRange(money(Math.abs(stakes.loss[0])), money(Math.abs(stakes.loss[1])))}</span>
          {lead > 0 && <span className="fire">{lead >= 2 ? t.duel.reveal.higherBot2(BASE_WIN + WIN_CAP_EXTRA + (LEAD_BONUS[2] ?? 0)) : t.duel.reveal.higherBot}</span>}
          {run.streak > 0 && <span className="fire">{t.duel.reveal.streakStake(run.streak, streakBonus(run.streak))}</span>}
        </div>
        {!formatOwned && <p className="rv-note" role="status">{t.duel.reveal.needFormat}</p>}
        <button type="button" className="rs-btn primary rv-go" disabled={busy || (!formatOwned && !canBuy)} onClick={formatOwned ? onStart : onBuyFormat}>
          <Icon type="swords" />
          {formatOwned ? t.duel.reveal.start : `${t.config.unlockFor}${t.config.unlockForTail} ${money(formatCost)}`}
        </button>
      </section>
    </main>
  );
}

