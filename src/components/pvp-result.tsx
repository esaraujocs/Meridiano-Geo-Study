import { Icon } from "./icons";
import { LEG_ROUNDS } from "../domain/duel-modes";
import { sideTotals, type PvpRoomView } from "../domain/pvp";
import { t } from "../domain/i18n";

const msLabel = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);

// Resultado do duelo com amigo: os dois placares lado a lado, ao vivo enquanto o amigo ainda está jogando (o servidor só fecha o resultado quando os
// dois terminam), e a mudança de força quando foi valendo.
export function PvpResult({ room, ratingDelta, onRematch, onHome }: {
  room: PvpRoomView;
  /** Quanto a força do valendo mudou (null no amistoso, ou enquanto o resultado não sai). */
  ratingDelta: number | null;
  onRematch: () => void;
  onHome: () => void;
}) {
  const you = sideTotals(room.you.legs, room.you.forfeited);
  const opponent = sideTotals(room.opponent?.legs ?? [[], []], room.opponent?.forfeited ?? false);
  const total = LEG_ROUNDS * 2;
  const done = Boolean(room.result);
  const outcome = room.result?.outcome ?? null;
  const title = outcome === "win" ? t.pvp.result.win : outcome === "loss" ? t.pvp.result.loss : outcome === "draw" ? t.pvp.result.draw : t.pvp.result.title;
  return (
    <main className="content rv-page">
      <section className={`rv-card pvp-card pvp-result${outcome ? ` is-${outcome}` : ""}`}>
        <span className="eyebrow">{t.pvp.subtitle(t.duel.ladders[room.ladder])} · {room.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked}</span>
        <h1>{title}</h1>
        {room.result?.tiebreak && <p className="pvp-note">{t.pvp.result.tiebreakNote}</p>}
        <div className="pvp-score">
          <div className={`pvp-side${outcome === "win" ? " is-win" : ""}`}>
            <strong>{t.pvp.result.you}</strong>
            <b>{you.correct}<small>/{total}</small></b>
            <span>{msLabel(you.ms)}</span>
            {you.forfeited && <em>{t.pvp.result.youLeft}</em>}
          </div>
          <span className="rv-x">×</span>
          <div className={`pvp-side${outcome === "loss" ? " is-win" : ""}`}>
            <strong>{room.opponent?.name ?? t.pvp.result.opponent}</strong>
            <b>{opponent.correct}<small>/{total}</small></b>
            <span>{msLabel(opponent.ms)}</span>
            {room.opponent?.forfeited && <em>{t.pvp.result.opponentLeft}</em>}
          </div>
        </div>
        {!done && <p className="pvp-status">{t.pvp.result.waitingOpponent}</p>}
        {done && room.mode === "ranked" && ratingDelta !== null && <p className="pvp-rating">{t.pvp.result.ratingChange(ratingDelta)}</p>}
        {done && room.mode === "friendly" && <p className="pvp-note">{t.pvp.result.friendlyNote}</p>}
        <div className="pvp-actions">
          <button type="button" className="rs-btn primary" onClick={onRematch}><Icon type="swords" />{t.pvp.result.rematch}</button>
          <button type="button" className="rs-btn" onClick={onHome}>{t.pvp.result.home}</button>
        </div>
      </section>
    </main>
  );
}
