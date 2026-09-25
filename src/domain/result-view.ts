// Tela de resultado da partida: transforma a sessão encerrada em textos e números prontos para exibir. Lógica pura.
import type { AnyQuizVariant } from "./types";
import type { Pace, Spoils } from "./spoils";
import { MAP_ERROR_GOAL_KM, meanMapErrorKm } from "./map-error.js";
import { levelForXp, xpForLevel } from "./player-level.js";

export type ResultSessionLike = {
  variant: AnyQuizVariant;
  startedAt: number;
  endedAt: number | null;
  complete: boolean;
  rounds: readonly { correct: boolean; timedOut?: boolean; distanceKm?: number | null }[];
  pace?: Pace;
  timerSeconds?: number | null;
};
export type EconomyLike = { balance: number; xp: number; level: number };

export type ResultChip = { key: "cards" | "levels" | "streak" | "timeouts"; text: string };
export type ResultLine = { key: "hits" | "streak" | "cards" | "levels" | "completion"; label: string; note: string; coins: number };
export type ResultView = {
  title: string;
  eyebrow: string;
  correct: number;
  total: number;
  pct: number;
  duration: string;
  paceLabel: string;
  training: boolean;
  coins: number;
  balanceBefore: number;
  balanceAfter: number;
  xpBefore: number;
  xpAfter: number;
  xpGain: number;
  levelBefore: number;
  levelAfter: number;
  chips: ResultChip[];
  lines: ResultLine[];
  /** Só nos modos de clicar no mapa: distância média do toque ao território (acerto = 0 km). */
  mapError: { km: number; goalKm: number | null } | null;
};

const VARIANT_LABEL: Record<AnyQuizVariant, string> = {
  mapa: "Mapa",
  silhueta: "Silhueta · escrita",
  "silhueta-opcoes": "Silhueta · alternativas",
  travel: "Travel",
  "bandeira-nome": "Bandeira → nome",
  "nome-bandeira": "Nome → bandeira",
  "capital-pais": "Capital → país",
  "pais-capital": "País → capital",
  "escrita-pais": "Escrita · país",
  "escrita-capital": "Escrita · capital",
  "historica-nome": "Histórica → nome",
  "nome-historica": "Nome → histórica",
  "idioma-nome": "Idioma → nome",
  "idioma-pais": "Idioma → países",
};
export const variantLabel = (variant: AnyQuizVariant) => VARIANT_LABEL[variant] ?? variant;

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}
const formatSeconds = (seconds: number) => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

// Níveis: a curva vive em player-level.ts (a mesma da economia).
export const levelBase = (level: number) => xpForLevel(level);
export const levelNext = (level: number) => xpForLevel(level + 1);
export const levelAt = (xp: number) => {
  return levelForXp(xp);
};

export type XpSegment = { level: number; span: number; from: number; to: number; levelUp: boolean };
/** Trechos da barra de XP entre dois totais; cada subida de nível vira um trecho que enche a barra e outro que recomeça. */
export function xpSegments(fromXp: number, toXp: number): XpSegment[] {
  const segments: XpSegment[] = [];
  let xp = Math.max(0, fromXp);
  let level = levelAt(xp);
  for (;;) {
    const base = levelBase(level);
    const next = levelNext(level);
    const levelUp = toXp >= next;
    segments.push({ level, span: next - base, from: xp - base, to: Math.min(toXp, next) - base, levelUp });
    if (!levelUp) return segments;
    xp = next;
    level += 1;
  }
}

export function buildResultView(input: {
  session: ResultSessionLike;
  spoils: Spoils | null;
  before: EconomyLike;
  after: EconomyLike;
  regionLabel: string;
}): ResultView {
  const { session, spoils, before, after } = input;
  const training = session.pace === "training";
  const total = session.rounds.length;
  const correct = session.rounds.filter((round) => round.correct).length;
  const timeouts = session.rounds.filter((round) => round.timedOut).length;
  const unit = session.variant === "travel" ? "por rota" : "por pergunta";
  const paceLabel = training
    ? "Treino · sem tempo"
    : session.timerSeconds ? `Partida · ${formatSeconds(session.timerSeconds)} ${unit}` : "Partida";
  const factor = spoils?.factor ?? 1;
  const perCard = (coins: number) => Math.round(coins * factor);

  const lines: ResultLine[] = [];
  const chips: ResultChip[] = [];
  if (spoils) {
    if (spoils.hits.count > 0) {
      lines.push({ key: "hits", label: "Acertos", note: `${spoils.hits.count} × ~${Math.round(spoils.hits.coins / spoils.hits.count)}`, coins: spoils.hits.coins });
    }
    if (spoils.streak.coins > 0) {
      lines.push({ key: "streak", label: "Sequência", note: `melhor série: ${spoils.streak.best}`, coins: spoils.streak.coins });
    }
    if (spoils.newCards.count > 0) {
      lines.push({ key: "cards", label: "Cartas novas", note: `${spoils.newCards.count} × ${perCard(60)}`, coins: spoils.newCards.coins });
      chips.push({ key: "cards", text: `${spoils.newCards.count} ${spoils.newCards.count === 1 ? "carta nova" : "cartas novas"}` });
    }
    if (spoils.levelUps.count > 0) {
      lines.push({ key: "levels", label: "Cartas que subiram", note: `${spoils.levelUps.count} × ${perCard(30)}`, coins: spoils.levelUps.coins });
      chips.push({ key: "levels", text: `${spoils.levelUps.count} ${spoils.levelUps.count === 1 ? "subiu de nível" : "subiram de nível"}` });
    }
    if (spoils.completion.coins > 0) {
      lines.push({ key: "completion", label: "Bônus de partida", note: `${spoils.completion.pct}% de acerto`, coins: spoils.completion.coins });
    }
    if (spoils.streak.best >= 2) chips.push({ key: "streak", text: `Melhor sequência ${spoils.streak.best}` });
  }
  if (timeouts > 0) chips.push({ key: "timeouts", text: `${timeouts} ${timeouts === 1 ? "tempo esgotado" : "tempos esgotados"}` });

  const kind = training ? "Treino" : "Partida";
  const tapMode = session.variant === "mapa" || session.variant === "capital-pais";
  const error = tapMode ? meanMapErrorKm(session.rounds) : null;
  return {
    title: session.complete ? `${kind} concluíd${training ? "o" : "a"}` : `${kind} encerrad${training ? "o" : "a"}`,
    eyebrow: `${variantLabel(session.variant)} · ${input.regionLabel}`,
    correct,
    total,
    pct: total ? Math.round((correct / total) * 100) : 0,
    duration: formatDuration((session.endedAt ?? session.startedAt) - session.startedAt),
    paceLabel,
    training,
    coins: spoils?.total ?? 0,
    balanceBefore: before.balance,
    balanceAfter: after.balance,
    xpBefore: before.xp,
    xpAfter: after.xp,
    xpGain: Math.max(0, after.xp - before.xp),
    levelBefore: before.level,
    levelAfter: after.level,
    chips,
    lines,
    // a meta do troféu "Mão firme" vale só para o modo "Clicar no mapa" (país)
    mapError: error ? { km: error.km, goalKm: session.variant === "mapa" ? MAP_ERROR_GOAL_KM : null } : null,
  };
}
