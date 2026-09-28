// Amigos e perfil de jogador (duelo entre pessoas): tipos e regras puras, compartilhados pelo servidor (server/pvp-friends.ts, pvp-http.ts) e pelo app.
// Quem é quem para os outros: o **código de amigo** (6 letras, o mesmo alfabeto dos convites), nunca o id do aparelho. O perfil mistura o que o servidor
// sabe de verdade (duelos entre pessoas, amizades) e o resumo que o aparelho de cada um informa (nível, coleção, conquistas, troféus): dá para mentir,
// aceitável entre amigos, como os troféus da transição.
import { LADDERS, type Ladder } from "./duel-modes.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isPvpMode, normalizeRoomCode, type LadderStandings, type PvpMode, type PvpServerMatch, type PvpTally } from "./pvp.js";

export const FRIEND_CODE_LENGTH = ROOM_CODE_LENGTH;
export const normalizeFriendCode = normalizeRoomCode;
export const isFriendCode = (code: unknown): code is string =>
  typeof code === "string" && code.length === FRIEND_CODE_LENGTH && [...code].every((char) => ROOM_CODE_ALPHABET.includes(char));
/** Limites por pessoa (proteção do servidor, não regra de jogo). */
export const FRIENDS_MAX = 200;
export const PENDING_MAX = 50;
/** Quantos duelos o perfil mostra (os do jogador e os entre os dois). */
export const PROFILE_RECENT = 5;

// ---- O resumo que o aparelho informa (tudo o que só ele sabe) ----
export type PlayerSummary = {
  level: number;
  xp: number;
  /** Maestria (0 a 100) e países dominados agora. */
  mastery: number;
  dominated: number;
  rounds: number;
  sessions: number;
  collection: { discovered: number; total: number };
  achievements: { unlocked: number; total: number };
  /** Duelos contra bot (as duas escadas juntas). */
  botDuels: PvpTally;
};
const count = (value: unknown, max = 10_000_000) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0; };
const pair = (value: unknown, a: string, b: string) => {
  const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { [a]: count(item[a]), [b]: count(item[b]) };
};
/** Confere o resumo que chega do aparelho (números fora do lugar viram 0; sem objeto, null). */
export function parseSummary(input: unknown): PlayerSummary | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const tally = (raw.botDuels && typeof raw.botDuels === "object" ? raw.botDuels : {}) as Record<string, unknown>;
  return {
    level: Math.max(1, count(raw.level, 10_000)), xp: count(raw.xp), mastery: count(raw.mastery, 100), dominated: count(raw.dominated, 10_000),
    rounds: count(raw.rounds), sessions: count(raw.sessions),
    collection: pair(raw.collection, "discovered", "total") as PlayerSummary["collection"],
    achievements: pair(raw.achievements, "unlocked", "total") as PlayerSummary["achievements"],
    botDuels: { wins: count(tally.wins), losses: count(tally.losses), draws: count(tally.draws) },
  };
}

// ---- Amizade ----
/** Como o jogador que pergunta está em relação a outro. */
export type FriendshipState = "self" | "friends" | "incoming" | "outgoing" | "none";
export type FriendView = {
  code: string;
  name: string;
  /** Está com o app aberto agora (canal do jogador ligado). */
  online: boolean;
  /** Troféus e MMR que o aparelho dele informou por último (null se nunca informou). */
  ladders: LadderStandings | null;
  /** Desde quando são amigos (ou quando o pedido saiu). */
  since: number;
};
export type FriendsView = { code: string; friends: FriendView[]; incoming: FriendView[]; outgoing: FriendView[] };

/** O perfil de um jogador, do ponto de vista de quem pergunta (GET /players/:code). */
export type PlayerProfile = {
  code: string;
  name: string;
  /** Quando apareceu no servidor. */
  since: number;
  online: boolean;
  friendship: FriendshipState;
  ladders: LadderStandings | null;
  pvp: { ranked: PvpTally; friendly: PvpTally };
  /** Duelos entre vocês dois (do ponto de vista de quem pergunta; vazio no próprio perfil). */
  headToHead: { ranked: PvpTally; friendly: PvpTally; recent: PvpServerMatch[] };
  /** Os duelos mais recentes do jogador (contra qualquer um), do ponto de vista DELE. */
  recent: PvpServerMatch[];
  summary: PlayerSummary | null;
  summaryAt: number | null;
};

// ---- Avisos em tempo real (canal do jogador, SSE /me/events, evento "social") ----
export type SocialEvent =
  | { kind: "request"; from: { code: string; name: string }; at: number }
  | { kind: "accepted"; from: { code: string; name: string }; at: number }
  | { kind: "challenge"; from: { code: string; name: string }; at: number; room: string; ladder: Ladder; mode: PvpMode };
export const isSocialEvent = (value: unknown): value is SocialEvent => {
  const item = value as Partial<SocialEvent> | null;
  if (!item || typeof item !== "object" || !item.from || typeof item.from.code !== "string" || typeof item.at !== "number") return false;
  if (item.kind === "request" || item.kind === "accepted") return true;
  return item.kind === "challenge" && typeof (item as { room?: unknown }).room === "string" && LADDERS.includes((item as { ladder: Ladder }).ladder) && isPvpMode((item as { mode?: unknown }).mode);
};

/** Placar entre dois jogadores a partir dos duelos (do ponto de vista de quem pergunta), separado por modo. */
export function tallyMatches(matches: readonly Pick<PvpServerMatch, "mode" | "you">[]): { ranked: PvpTally; friendly: PvpTally } {
  const ranked: PvpTally = { wins: 0, losses: 0, draws: 0 }, friendly: PvpTally = { wins: 0, losses: 0, draws: 0 };
  for (const match of matches) {
    const target = match.mode === "ranked" ? ranked : friendly;
    if (match.you.outcome === "win") target.wins += 1;
    else if (match.you.outcome === "loss") target.losses += 1;
    else target.draws += 1;
  }
  return { ranked, friendly };
}
/** Aproveitamento (0 a 100) de um placar; null sem jogos. */
export const winRate = (tally: PvpTally) => {
  const games = tally.wins + tally.losses + tally.draws;
  return games ? Math.round(((tally.wins + tally.draws / 2) / games) * 100) : null;
};
