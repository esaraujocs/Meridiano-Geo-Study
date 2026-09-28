import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeSpoils, type Pace, type Tier } from "../domain/spoils";
import { supplyApplies, type SupplyCounts, type SupplyId } from "../domain/supplies";
import type { AnyQuizVariant } from "../domain/types";
import { Icon, type IconType } from "./icons";
import { formatNumber as money, t } from "../domain/i18n";

/** Uma rodada já respondida, como o topo do jogo precisa dela (certa/errada) e como o espólio pendente é calculado. */
export type RoundResult = { correct: boolean; tier?: Tier; weight?: number };

/**
 * Registro das rodadas da partida em curso, só para a interface: os segmentos do topo e as moedas pendentes.
 * (O registro de verdade, que vai para o histórico, continua no learning-store.)
 */
export function useRoundLog(variant: AnyQuizVariant, pace: Pace) {
  const [results, setResults] = useState<RoundResult[]>([]);
  const push = useCallback((result: RoundResult) => setResults((current) => [...current, result]), []);
  const reset = useCallback(() => setResults([]), []);
  // Moedas que cairiam na carteira se a partida terminasse agora (acertos e sequência; cartas novas e bônus só aparecem no fim).
  const pending = useMemo(
    () => (results.length ? computeSpoils({ variant, pace, rounds: results, complete: false, newCards: 0, levelUps: 0 }).total : 0),
    [results, variant, pace],
  );
  return { results, push, reset, pending };
}

const MAX_SEGMENTS = 20;

/**
 * Topo único de todos os modos: sair, progresso (um segmento por rodada, certa ou errada), sequência e moedas pendentes.
 * Com muitas rodadas (ex.: baralho completo) os segmentos viram uma barra contínua com o contador.
 */
export function GameTopBar({ results, total, streak, pending, onExit, meta, children }: {
  results: readonly RoundResult[];
  total: number;
  streak: number;
  pending: number;
  onExit: () => void;
  /** Nome do modo e do recorte, sob a barra. */
  meta: string;
  /** O cronômetro da pergunta (RoundTimer), que fica logo abaixo do nome do modo. */
  children?: ReactNode;
}) {
  const done = results.length;
  const hits = results.filter((result) => result.correct).length;
  const segmented = total > 0 && total <= MAX_SEGMENTS;
  return <header className="gs-head">
    <div className="gs-top">
    <button type="button" className="gs-x" aria-label={t.shell.exit} onClick={onExit}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
    </button>
    <div className="gs-progress" role="img" aria-label={t.shell.progressAria(Math.min(done + 1, total), total, hits)}>
      {segmented
        ? Array.from({ length: total }, (_, index) => {
          const state = index < done ? (results[index].correct ? "ok" : "miss") : index === done ? "now" : "";
          return <i key={index} className={state} />;
        })
        : <><span className="gs-track"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span><b>{done}/{total}</b></>}
    </div>
    <span className="gs-chip gs-streak" title={t.shell.streakTitle} aria-label={t.shell.streakAria(streak)}>
      <svg width="14" height="16" viewBox="0 0 24 28" aria-hidden="true"><path fill="currentColor" d="M12 1c1 5 7 7.5 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2 1.2 3 2.2 3.5C10 9 10.5 5 12 1z" /></svg>
      {streak}
    </span>
    <span className="gs-chip gs-coins" title={t.shell.coinsTitle} aria-label={t.shell.coinsAria(money(pending))}>
      <b aria-hidden="true">$</b>{money(pending)}
    </span>
    </div>
    <div className="gs-meta">{meta}</div>
    <div className="gs-timer">{children}</div>
  </header>;
}

const SUPPLY_ICON: Record<SupplyId, IconType> = { ampulheta: "hourglass", bussola: "compass", lupa: "search" };

/**
 * Suprimentos de expedição disponíveis nesta rodada: só aparece com estoque > 0 e num modo em que o item faz sentido
 * (supplyApplies). Some da tela quando não sobra nenhum aplicável, sem cadeado nem "0" — a Loja é onde se aprende que existem.
 */
export function SupplyTray({ variant, counts, usedThisRound, disabled, onUse }: {
  variant: AnyQuizVariant;
  counts: SupplyCounts;
  /** Suprimentos já usados nesta rodada (cada um só pode ser usado uma vez por rodada). */
  usedThisRound: ReadonlySet<SupplyId>;
  disabled?: boolean;
  onUse: (id: SupplyId) => void;
}) {
  const available = (Object.keys(counts) as SupplyId[]).filter((id) => counts[id] > 0 && supplyApplies(id, variant));
  if (!available.length) return null;
  return (
    <div className="gs-supplies" role="group" aria-label={t.supplies.trayAria}>
      {available.map((id) => {
        const used = usedThisRound.has(id);
        return (
          <button
            key={id} type="button" className="gs-supply" disabled={disabled || used}
            aria-label={t.supplies.useAria(t.supplies[id].name, counts[id])} title={t.supplies[id].detail}
            onClick={() => onUse(id)}
          >
            <Icon type={SUPPLY_ICON[id]} size={15} />
            <span>{t.supplies[id].short}</span>
            <b>{counts[id]}</b>
          </button>
        );
      })}
    </div>
  );
}

/** Botão "Continuar" do retorno de um erro: enche durante o prazo e pula se tocado. */
export function ContinueBar({ holdMs, onSkip }: { holdMs: number | null; onSkip: () => void }) {
  return <button type="button" className="gs-continue" onClick={() => onSkip()}>
    {holdMs !== null && <i style={{ animationDuration: `${holdMs}ms` }} aria-hidden="true" />}
    <span>{t.common.continue}</span>
    <kbd aria-hidden="true">Enter</kbd>
  </button>;
}

/** Atalhos do teclado no computador: 1–4 escolhem a alternativa; Esc abre a saída. Não age com a confirmação aberta nem digitando. */
export function useGameKeys({ choose, exit, enabled = true }: { choose?: (index: number) => void; exit: () => void; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      const typing = event.target instanceof HTMLElement && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
      if (event.key === "Escape") { exit(); return; }
      if (choose && !typing && /^[1-9]$/.test(event.key)) choose(Number(event.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, exit, enabled]);
}

/** Classe de tamanho para o estímulo em texto grande (nomes longos encolhem para caber). */
export const bigClass = (text: string | undefined) => {
  const length = (text ?? "").length;
  return length > 26 ? "gs-big xlong" : length > 15 ? "gs-big long" : "gs-big";
};
