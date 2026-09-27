// Duelo entre pessoas (PvP), ao vivo: tipos e regras puras compartilhadas entre o servidor (server/pvp-*.ts) e o app. Cada jogador joga o MESMO duelo (semente da sala,
// mesmos 2 tempos de 10 rodadas, ver duel-modes.ts) no seu ritmo, e os dois veem o progresso um do outro em tempo real. O servidor só guarda a sala e repassa o que cada um
// relata (as respostas são avaliadas no aparelho, como no resto do jogo); a regra do vencedor é a mesma do duelo contra bot: mais acertos vence, empate no menor tempo total.
import { LEGS, LEG_ROUNDS, isLadder, type Ladder } from "./duel-modes.js";

/** Amistoso: sem troféus nem MMR, moedas reduzidas e sem exigir o corte de 20 rodadas. Valendo: troféus e MMR como no duelo contra bot, contra o rating do amigo. */
export type PvpMode = "friendly" | "ranked";
export const PVP_MODES: readonly PvpMode[] = ["friendly", "ranked"];
export const isPvpMode = (value: unknown): value is PvpMode => value === "friendly" || value === "ranked";
/** Fator das moedas dos tempos de um duelo amistoso (o Treino também paga 50%). */
export const FRIENDLY_COIN_FACTOR = 0.5;

// ---- Sala e convite ----
export const ROOM_CODE_LENGTH = 6;
/** Sem I, O, 0 e 1 (confundem no papel e no ditado). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const normalizeRoomCode = (input: string) => String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isValidRoomCode = (code: unknown): code is string => typeof code === "string" && code.length === ROOM_CODE_LENGTH && [...code].every((char) => ROOM_CODE_ALPHABET.includes(char));
/** Link do convite: a página inicial com o código da sala. */
export const inviteLink = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/?duelo=${code}`;
/** O código de um link de convite (ou o próprio código digitado); null se não for um código válido. */
export function parseInvite(input: string): string | null {
  const text = String(input ?? "").trim();
  const match = /[?&]duelo=([A-Za-z0-9]+)/.exec(text);
  const code = normalizeRoomCode(match ? match[1] : text);
  return isValidRoomCode(code) ? code : null;
}

export const PLAYER_NAME_MAX = 20;
/** Apelido limpo: sem espaços sobrando nem caracteres de controle, no máximo PLAYER_NAME_MAX; vazio se não sobrar nada. */
export const cleanPlayerName = (input: unknown) => String(input ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, PLAYER_NAME_MAX);

// ---- Tempos do protocolo (ms) ----
/** Contagem regressiva entre "os dois prontos" e o início do 1º tempo. */
export const COUNTDOWN_MS = 4000;
/** Quanto tempo uma conexão pode ficar fora antes de o servidor tratar como saída (no jogo vale desistência, no lobby some da sala). */
export const GRACE_MS = 30000;
/** Sala aberta esperando o amigo. */
export const OPEN_TTL_MS = 20 * 60 * 1000;
/** Duelo em andamento: passou disso, encerra com o que já foi jogado. */
export const PLAYING_TTL_MS = 30 * 60 * 1000;
/** O resultado fica disponível por este tempo depois do fim. */
export const DONE_TTL_MS = 10 * 60 * 1000;
/** Uma resposta não pode ser mais rápida que isso nem mais lenta que isso (limites de sanidade do que o aparelho relata). */
export const MIN_ROUND_MS = 250;
export const MAX_ROUND_MS = 120000;

// ---- Visão da sala (o que o servidor manda a cada jogador) ----
export type PvpPhase = "open" | "lobby" | "countdown" | "playing" | "done" | "closed";
export type PvpClosedReason = "expired" | "host-left" | "cancelled";
export type RoundReport = { correct: boolean; ms: number };
export type PvpOutcome = "win" | "loss" | "draw";

export type SideTotals = {
  correct: number;
  /** Tempo total; null se algum tempo ficou incompleto (aí o empate fica empate). */
  ms: number | null;
  /** Um item por tempo: acertos e tempo (null se o tempo ficou incompleto) e as rodadas respondidas. */
  legs: { correct: number; ms: number | null; answered: number }[];
  forfeited: boolean;
};
export type PvpResult = { you: SideTotals; opponent: SideTotals; outcome: PvpOutcome; tiebreak: boolean };

export type PvpPlayerView = {
  name: string;
  /** MMR e troféus que o aparelho informou ao entrar (o servidor não confere: serve para o matchmaking amigável e para a conta do valendo). */
  rating: number;
  trophies: number;
  ready: boolean;
  connected: boolean;
  forfeited: boolean;
  /** Rodadas já respondidas por tempo (as do adversário aparecem ao vivo, com acerto e tempo). */
  legs: RoundReport[][];
};

export type PvpRoomView = {
  code: string;
  ladder: Ladder;
  mode: PvpMode;
  phase: PvpPhase;
  closedReason: PvpClosedReason | null;
  /** Só aparece na contagem regressiva em diante, para o anfitrião não ver as perguntas antes. */
  seed: string | null;
  /** Instante (relógio do servidor) em que o 1º tempo começa. */
  startAt: number | null;
  serverNow: number;
  /** Cresce a cada mudança da sala: quem recebe ignora visão mais velha que a que já tem. */
  rev: number;
  host: boolean;
  you: PvpPlayerView;
  opponent: PvpPlayerView | null;
  result: PvpResult | null;
};

/** Convite visto antes de entrar na sala (sem identidade): o suficiente para a tela "Fulano te desafiou". */
export type PvpInvite = { code: string; phase: PvpPhase; ladder: Ladder; mode: PvpMode; hostName: string; hostTrophies: number; full: boolean };

// ---- Mensagens ----
/** Comandos do jogador (POST). `round` relata uma rodada respondida (inclui o tempo esgotado como erro); o servidor soma os tempos a partir delas. */
export type PvpCommand =
  | { type: "ready"; ready: boolean }
  | { type: "round"; leg: number; round: number; correct: boolean; ms: number }
  | { type: "leave" }
  | { type: "ping" };

export type PvpErrorCode = "bad_request" | "unauthorized" | "not_found" | "room_full" | "wrong_phase" | "forbidden" | "too_many";

// ---- Regras ----
/** Totais de um lado a partir das rodadas relatadas. Tempo incompleto (menos de LEG_ROUNDS rodadas) não tem tempo total. */
export function sideTotals(legs: readonly (readonly RoundReport[])[], forfeited = false): SideTotals {
  const per = Array.from({ length: LEGS }, (_, index) => {
    const rounds = legs[index] ?? [];
    const complete = rounds.length >= LEG_ROUNDS;
    return { correct: rounds.filter((round) => round.correct).length, ms: complete ? rounds.reduce((sum, round) => sum + round.ms, 0) : null, answered: rounds.length };
  });
  return { correct: per.reduce((sum, leg) => sum + leg.correct, 0), ms: per.every((leg) => leg.ms !== null) ? per.reduce((sum, leg) => sum + (leg.ms as number), 0) : null, legs: per, forfeited };
}

/** Quem venceu: mais acertos; empate, o menor tempo total (sem tempo dos dois lados, empate). A mesma regra do duelo contra bot. */
export function settlePvp(a: SideTotals, b: SideTotals): { a: PvpOutcome; b: PvpOutcome; tiebreak: boolean } {
  if (a.correct !== b.correct) return a.correct > b.correct ? { a: "win", b: "loss", tiebreak: false } : { a: "loss", b: "win", tiebreak: false };
  if (a.ms !== null && b.ms !== null && a.ms !== b.ms) return a.ms < b.ms ? { a: "win", b: "loss", tiebreak: true } : { a: "loss", b: "win", tiebreak: true };
  return { a: "draw", b: "draw", tiebreak: false };
}

/** O duelo acabou para um lado quando todos os tempos foram respondidos ou ele desistiu. */
export const sideFinished = (legs: readonly (readonly RoundReport[])[], forfeited: boolean) => forfeited || Array.from({ length: LEGS }).every((_, index) => (legs[index]?.length ?? 0) >= LEG_ROUNDS);

/** Confere um comando vindo da rede e devolve o comando limpo, ou null. */
export function parseCommand(input: unknown): PvpCommand | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.type === "ready" && typeof raw.ready === "boolean") return { type: "ready", ready: raw.ready };
  if (raw.type === "leave") return { type: "leave" };
  if (raw.type === "ping") return { type: "ping" };
  if (raw.type === "round" && Number.isInteger(raw.leg) && Number.isInteger(raw.round) && typeof raw.correct === "boolean" && typeof raw.ms === "number" && Number.isFinite(raw.ms)) {
    return { type: "round", leg: raw.leg as number, round: raw.round as number, correct: raw.correct, ms: Math.round(raw.ms) };
  }
  return null;
}

export const isRoomSetup = (input: unknown): input is { ladder: Ladder; mode: PvpMode } => Boolean(input) && typeof input === "object" && isLadder((input as { ladder?: unknown }).ladder) && isPvpMode((input as { mode?: unknown }).mode);
