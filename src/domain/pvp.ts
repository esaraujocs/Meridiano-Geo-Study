// Duelo entre pessoas (PvP), ao vivo: tipos e regras puras compartilhadas entre o servidor (server/pvp-*.ts) e o app. Cada jogador joga o MESMO duelo (semente da sala,
// mesmos 2 tempos de 10 rodadas, ver duel-modes.ts) no seu ritmo, e os dois veem o progresso um do outro em tempo real. O servidor só guarda a sala e repassa o que cada um
// relata (as respostas são avaliadas no aparelho, como no resto do jogo); a regra do vencedor é a mesma do duelo contra bot: mais acertos vence, empate no menor tempo total.
import { LADDERS, LEGS, LEG_ROUNDS, isLadder, type Ladder } from "./duel-modes.js";

/** Amistoso: sem troféus nem MMR, moedas cheias e sem exigir o corte de 20 rodadas. Valendo: troféus e MMR da mesma escada do duelo contra bot
 *  (pvp-trophies.ts), com o MMR do adversário no lugar do rating do bot. */
export type PvpMode = "friendly" | "ranked";
export const PVP_MODES: readonly PvpMode[] = ["friendly", "ranked"];
export const isPvpMode = (value: unknown): value is PvpMode => value === "friendly" || value === "ranked";
/** Fator das moedas dos tempos de um duelo amistoso: era 0,5 até 28/09, quando o Enzo pediu moedas cheias (a diferença para o valendo é só o troféu). */
export const FRIENDLY_COIN_FACTOR = 1;

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
/** Sala vinda da fila: os dois já aceitaram a proposta, então ela nasce "pronto/pronto" e só conta este tempo (dá para ver o adversário e os 2 modos). */
export const MATCH_COUNTDOWN_MS = 10000;
/** Uma resposta não pode ser mais rápida que isso nem mais lenta que isso (limites de sanidade do que o aparelho relata). */
export const MIN_ROUND_MS = 250;
export const MAX_ROUND_MS = 120000;

// ---- Visão da sala (o que o servidor manda a cada jogador) ----
export type PvpPhase = "open" | "lobby" | "countdown" | "playing" | "done" | "closed";
/** "opponent-left": sala vinda da fila em que o outro saiu antes de começar (quem ficou volta para a fila). */
export type PvpClosedReason = "expired" | "host-left" | "cancelled" | "opponent-left";
/** De onde veio a sala: convite por código/link ou a fila ("Buscar duelo"). */
export type PvpRoomOrigin = "invite" | "queue";
export type RoundReport = { correct: boolean; ms: number };
export type PvpOutcome = "win" | "loss" | "draw";
/** A força (Elo do valendo) antes e depois de um duelo, calculada pelo servidor. */
export type RatingChange = { before: number; after: number };

export type SideTotals = {
  correct: number;
  /** Tempo total; null se algum tempo ficou incompleto (aí o empate fica empate). */
  ms: number | null;
  /** Um item por tempo: acertos e tempo (null se o tempo ficou incompleto) e as rodadas respondidas. */
  legs: { correct: number; ms: number | null; answered: number }[];
  forfeited: boolean;
};
export type PvpResult = {
  you: SideTotals; opponent: SideTotals; outcome: PvpOutcome; tiebreak: boolean;
  /** Força antes e depois, dos dois lados (só no valendo; null no amistoso). O servidor calcula e guarda: o aparelho só mostra. */
  rating: { you: RatingChange; opponent: RatingChange } | null;
};

export type PvpPlayerView = {
  name: string;
  /** Força do valendo, vinda do perfil guardado no servidor (não do que o aparelho informa). */
  rating: number;
  /** Troféus e MMR da escada da sala, informados pelo aparelho (só ele conhece): o servidor não confere; o aparelho do adversário usa o MMR na conta dos troféus. */
  trophies: number;
  mmr: number;
  ready: boolean;
  connected: boolean;
  forfeited: boolean;
  /** Rodadas já respondidas por tempo (as do adversário aparecem ao vivo, com acerto e tempo). */
  legs: RoundReport[][];
};

export type PvpRoomView = {
  code: string;
  origin: PvpRoomOrigin;
  ladder: Ladder;
  mode: PvpMode;
  phase: PvpPhase;
  closedReason: PvpClosedReason | null;
  /** Só aparece a partir do lobby (o amigo já entrou), para o anfitrião sozinho não ver os modos antes de alguém aceitar o convite. */
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

// ---- Fila ("Buscar duelo") ----
// Uma camada fina sobre as salas (server/pvp-queue.ts): quando dois pedidos combinam, o servidor faz uma proposta aos dois e, com os dois aceitando,
// cria uma sala comum (origin "queue") já pronto/pronto — daí em diante é o mesmo duelo do convite. Com pouca gente, ninguém fica preso à própria escolha:
// sem par exato, o servidor propõe uma TROCA (escada e/ou modo), primeiro no que pediu quem espera há mais tempo e, se o outro não quiser trocar, o inverso.
/** O que a pessoa busca: escada e modo. */
export type QueuePrefs = { ladder: Ladder; mode: PvpMode };
export const isQueuePrefs = (input: unknown): input is QueuePrefs => isRoomSetup(input);
export const samePrefs = (a: QueuePrefs, b: QueuePrefs) => a.ladder === b.ladder && a.mode === b.mode;
/** Tempo para responder a uma proposta. Quem não responde sai da fila (provavelmente largou o aparelho); quem aceitou volta ao lugar que tinha. */
export const OFFER_TTL_MS = 20000;
/** Quanto o pedido mais novo espera por um par exato antes de receber uma proposta de troca. Zero = na hora (decisão do Enzo, 28/09): com pouca gente
 *  quase nunca chega um par exato em segundos, e recusar a troca não tira ninguém da fila. Se a fila encher, subir para alguns segundos. */
export const CROSS_DELAY_MS = 0;
/** A busca encerra sozinha depois disto (a pessoa é avisada e pode buscar de novo). */
export const QUEUE_TTL_MS = 60 * 60 * 1000;
/** Depois de uma recusa ou de uma proposta sem resposta, o mesmo par não é oferecido de novo por este tempo. */
export const REOFFER_COOLDOWN_MS = 2 * 60 * 1000;
/** Quanto tempo o "achamos a sala X" continua na visão da fila (quem recarrega a página ainda acha a sala). */
export const MATCHED_TTL_MS = 5 * 60 * 1000;

export type PvpQueueState = "idle" | "waiting" | "offer" | "matched";
/**
 * Avisos da fila (cada um com o instante, para o aparelho mostrar uma vez só):
 * opponent-declined — o outro recusou; você voltou ao seu lugar na fila.   opponent-timeout — o outro não respondeu; você voltou ao seu lugar.
 * you-timeout — você não respondeu a tempo e saiu da fila.                 switch-declined — o outro preferiu não trocar; a busca continua.
 * opponent-left — a sala da fila fechou antes de começar; você voltou à fila.   search-expired — a busca passou do tempo máximo e foi encerrada.
 * connection-lost — o aparelho ficou sem conexão com a fila e o pedido caiu.
 */
export type PvpQueueNoticeKind = "opponent-declined" | "opponent-timeout" | "you-timeout" | "switch-declined" | "opponent-left" | "search-expired" | "connection-lost";
export type PvpQueueNotice = { kind: PvpQueueNoticeKind; at: number };

export type PvpOfferView = {
  id: string;
  ladder: Ladder;
  mode: PvpMode;
  /** Proposta de troca: o que muda em relação ao que VOCÊ buscou (falso nos dois = exatamente o que você pediu). */
  switchLadder: boolean;
  switchMode: boolean;
  /** `trophies`: os troféus do adversário na escada da proposta (informados pelo aparelho dele). */
  opponent: { name: string; rating: number; trophies: number };
  /** Instante (relógio do servidor) em que a proposta expira. */
  expiresAt: number;
  youAccepted: boolean;
  opponentAccepted: boolean;
};

export type PvpQueueView = {
  state: PvpQueueState;
  /** O que você está buscando (null fora da fila). */
  prefs: QueuePrefs | null;
  /** Desde quando está na fila (relógio do servidor). */
  since: number | null;
  serverNow: number;
  /** Quantas pessoas estão na fila agora (você incluído). */
  waiting: number;
  offer: PvpOfferView | null;
  /** A sala criada quando os dois aceitaram (estado "matched"). */
  room: string | null;
  notice: PvpQueueNotice | null;
  rev: number;
};

export const IDLE_QUEUE_VIEW: PvpQueueView = { state: "idle", prefs: null, since: null, serverNow: 0, waiting: 0, offer: null, room: null, notice: null, rev: 0 };

// ---- Perfil e histórico guardados no servidor ----
// O servidor é a fonte da força do valendo e do histórico de duelos entre pessoas (dados que dependem dos dois lados). O resto do progresso (coleção,
// XP, moedas, troféus contra bot) continua só no aparelho.
export type PvpTally = { wins: number; losses: number; draws: number };
// ---- Onde cada um está nas escadas (declarado pelo aparelho) e o ranking ----
/** Troféus e MMR escondido de uma escada. Na transição (28/09) quem calcula é o aparelho (bots e pessoas na mesma conta), então o servidor só
 *  guarda o que ele informa: vale para o ranking, para a proposta e para a conta do adversário. Dá para mentir; aceitável entre amigos, por ora. */
export type LadderStanding = { trophies: number; mmr: number };
export type LadderStandings = Record<Ladder, LadderStanding>;
const standingNumber = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(99_999, Math.round(n))) : 0; };
/** Lê `{ladders: {mapas: {trophies, mmr}, bandeiras: {...}}}`; um aparelho antigo manda só `trophies` (número), que vale para as duas escadas. */
export function parseStandings(body: unknown): LadderStandings {
  const input = (body && typeof body === "object" ? body : {}) as { ladders?: unknown; trophies?: unknown };
  const ladders = (input.ladders && typeof input.ladders === "object" ? input.ladders : {}) as Record<string, unknown>;
  const fallback = standingNumber(input.trophies);
  return Object.fromEntries(LADDERS.map((ladder) => {
    const item = (ladders[ladder] && typeof ladders[ladder] === "object" ? ladders[ladder] : null) as { trophies?: unknown; mmr?: unknown } | null;
    const trophies = item ? standingNumber(item.trophies) : fallback;
    return [ladder, { trophies, mmr: item && item.mmr !== undefined ? standingNumber(item.mmr) : trophies }];
  })) as LadderStandings;
}
export const EMPTY_STANDINGS: LadderStandings = { mapas: { trophies: 0, mmr: 0 }, bandeiras: { trophies: 0, mmr: 0 } };
/** Uma linha do ranking (GET /leaderboard): só gente de verdade, com os troféus que o aparelho de cada um informou por último. */
export type LeaderboardRow = { name: string; trophies: number; you: boolean };
export const LEADERBOARD_LIMIT = 50;

export type PvpProfileView = { name: string; rating: number; ranked: PvpTally; friendly: PvpTally; since: number };
export type PvpMatchSide = { name: string; totals: SideTotals; outcome: PvpOutcome; rating: RatingChange | null };
/** Um duelo terminado, do ponto de vista de quem pede (GET /me/matches). */
export type PvpServerMatch = { code: string; at: number; origin: PvpRoomOrigin; ladder: Ladder; mode: PvpMode; seed: string; tiebreak: boolean; you: PvpMatchSide; opponent: PvpMatchSide };

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

/** Resposta a uma proposta da fila, vinda da rede: `{ id, accept }`, ou null. */
export function parseOfferResponse(input: unknown): { id: string; accept: boolean } | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  return typeof raw.id === "string" && /^[A-Za-z0-9]{6,32}$/.test(raw.id) && typeof raw.accept === "boolean" ? { id: raw.id, accept: raw.accept } : null;
}

export const isRoomSetup = (input: unknown): input is { ladder: Ladder; mode: PvpMode } => Boolean(input) && typeof input === "object" && isLadder((input as { ladder?: unknown }).ladder) && isPvpMode((input as { mode?: unknown }).mode);
