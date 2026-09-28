// Cliente do duelo entre pessoas: identidade do aparelho (sem login, ver server/pvp-players.ts) e a rede (HTTP + SSE) para /api/pvp.
// Toca localStorage, fetch e EventSource: só funciona no navegador (não em scripts/test-pvp.mjs, que testa o servidor puro).
import type { LadderStandings, LeaderboardRow, PvpCommand, PvpErrorCode, PvpInvite, PvpMode, PvpProfileView, PvpQueueView, PvpRoomView, PvpServerMatch, QueuePrefs } from "./pvp.js";
import type { Ladder } from "./duel-modes.js";
import { isSocialEvent, type FriendsView, type PlayerProfile, type PlayerSummary, type SocialEvent } from "./pvp-social.js";

const BASE = "/api/pvp";
const ID_KEY = "carta-pvp-id";
const SECRET_KEY = "carta-pvp-secret";
const NAME_KEY = "carta-pvp-name";

export class PvpClientError extends Error {
  constructor(readonly code: PvpErrorCode | "network", message: string) { super(message); this.name = "PvpClientError"; }
}

function randomToken(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

/** Id e segredo deste aparelho: sorteados uma vez, guardados em localStorage. Sem eles, sem duelo entre pessoas. */
export function pvpIdentity(): { id: string; secret: string } | null {
  try {
    let id = localStorage.getItem(ID_KEY);
    let secret = localStorage.getItem(SECRET_KEY);
    if (!id) { id = `p${randomToken(16)}`; localStorage.setItem(ID_KEY, id); }
    if (!secret) { secret = randomToken(32); localStorage.setItem(SECRET_KEY, secret); }
    return { id, secret };
  } catch { return null; }
}

/** Este aparelho já tem identidade do PvP (já usou o duelo com pessoas)? Não cria uma: quem nunca entrou no PvP não é registrado no servidor à toa. */
export function hasPvpIdentity(): boolean {
  try { return Boolean(localStorage.getItem(ID_KEY) && localStorage.getItem(SECRET_KEY)); } catch { return false; }
}

export function pvpName(): string { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } }
export function setPvpName(name: string) { try { localStorage.setItem(NAME_KEY, name.slice(0, 20)); } catch { /* sem armazenamento */ } }

type Payload = { room?: PvpRoomView; invite?: PvpInvite; queue?: PvpQueueView; profile?: PvpProfileView | PlayerProfile; matches?: PvpServerMatch[]; leaderboard?: LeaderboardRow[]; friends?: FriendsView; result?: string };

async function request(method: "GET" | "POST", path: string, identity: { id: string; secret: string } | null, body?: unknown): Promise<Payload> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(identity ? { "x-pvp-player": identity.id, "x-pvp-secret": identity.secret } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PvpClientError("network", "Sem conexão com o servidor do duelo.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PvpClientError((payload?.error as PvpErrorCode) ?? "network", payload?.message ?? "Não deu para falar com o servidor do duelo.");
  return payload ?? {};
}

function requireIdentity() {
  const identity = pvpIdentity();
  if (!identity) throw new PvpClientError("network", "Sem armazenamento neste navegador.");
  return identity;
}

/** Cria o convite. A força não vai junto: o servidor usa a do perfil dele. Troféus e MMR das duas escadas vão junto (a sala mostra os da escada dela
 *  e o aparelho do adversário usa o MMR na conta dos troféus). */
export async function pvpCreateRoom(ladder: Ladder, mode: PvpMode, name: string, ladders: LadderStandings): Promise<PvpRoomView> {
  const { room } = await request("POST", "/rooms", requireIdentity(), { ladder, mode, name, ladders });
  return room as PvpRoomView;
}

export async function pvpGetInvite(code: string): Promise<PvpInvite> {
  const { invite } = await request("GET", `/rooms/${code}/invite`, null);
  return invite as PvpInvite;
}

export async function pvpJoinRoom(code: string, name: string, ladders: LadderStandings): Promise<PvpRoomView> {
  const { room } = await request("POST", `/rooms/${code}/join`, requireIdentity(), { name, ladders });
  return room as PvpRoomView;
}

export async function pvpGetRoom(code: string): Promise<PvpRoomView> {
  const identity = pvpIdentity();
  if (!identity) throw new PvpClientError("network", "Sem armazenamento neste navegador.");
  const { room } = await request("GET", `/rooms/${code}`, identity);
  return room as PvpRoomView;
}

export async function pvpCommand(code: string, command: PvpCommand): Promise<PvpRoomView | null> {
  const identity = pvpIdentity();
  if (!identity) throw new PvpClientError("network", "Sem armazenamento neste navegador.");
  const { room } = await request("POST", `/rooms/${code}/command`, identity, command);
  return room ?? null;
}

// ---- Fila ("Buscar duelo") e perfil guardado no servidor ----
export async function pvpQueueGet(): Promise<PvpQueueView> {
  const { queue } = await request("GET", "/queue", requireIdentity());
  return queue as PvpQueueView;
}
export async function pvpQueueJoin(prefs: QueuePrefs, name: string, ladders: LadderStandings): Promise<PvpQueueView> {
  const { queue } = await request("POST", "/queue", requireIdentity(), { ladder: prefs.ladder, mode: prefs.mode, name, ladders });
  return queue as PvpQueueView;
}
export async function pvpQueueLeave(): Promise<PvpQueueView> {
  const { queue } = await request("POST", "/queue/leave", requireIdentity(), {});
  return queue as PvpQueueView;
}
export async function pvpQueueRespond(offerId: string, accept: boolean): Promise<PvpQueueView> {
  const { queue } = await request("POST", "/queue/offer", requireIdentity(), { id: offerId, accept });
  return queue as PvpQueueView;
}
/** Força do valendo e vitórias/derrotas, como o servidor guarda. */
export async function pvpProfile(): Promise<PvpProfileView> {
  const { profile } = await request("GET", "/me", requireIdentity());
  return profile as PvpProfileView;
}

// ---- Amigos e perfil de jogador (identidade criada na hora, se ainda não existe: abrir Amigos é usar o duelo com pessoas) ----
export async function pvpFriends(): Promise<FriendsView> {
  const { friends } = await request("GET", "/friends", requireIdentity());
  return friends as FriendsView;
}
/** Pede amizade pelo código; se o outro já tinha pedido, vira amizade na hora. */
export async function pvpFriendRequest(code: string, name = ""): Promise<{ result: string; friends: FriendsView }> {
  const { result, friends } = await request("POST", "/friends", requireIdentity(), { code, ...(name.trim() ? { name: name.trim() } : {}) });
  return { result: result ?? "sent", friends: friends as FriendsView };
}
export async function pvpFriendRespond(code: string, accept: boolean, name = ""): Promise<FriendsView> {
  const { friends } = await request("POST", "/friends/respond", requireIdentity(), { code, accept, ...(name.trim() ? { name: name.trim() } : {}) });
  return friends as FriendsView;
}
/** Desfaz a amizade ou cancela um pedido. */
export async function pvpFriendRemove(code: string): Promise<FriendsView> {
  const { friends } = await request("POST", "/friends/remove", requireIdentity(), { code });
  return friends as FriendsView;
}
/** Desafia um amigo com o app aberto: cria o convite (você é o anfitrião) e o servidor avisa o amigo na hora. */
export async function pvpChallenge(code: string, ladder: Ladder, mode: PvpMode, name: string, ladders: LadderStandings): Promise<PvpRoomView> {
  const { room } = await request("POST", "/friends/challenge", requireIdentity(), { code, ladder, mode, name, ladders });
  return room as PvpRoomView;
}
/** O perfil de um jogador pelo código de amigo (o próprio também). */
export async function pvpPlayer(code: string): Promise<PlayerProfile> {
  const { profile } = await request("GET", `/players/${encodeURIComponent(code)}`, requireIdentity());
  return profile as PlayerProfile;
}
/** Informa nome, onde a pessoa está nas escadas (o ranking sai disto) e o resumo do perfil. Só para quem já tem identidade: não registra ninguém à toa. */
export async function pvpSendProfile(name: string, ladders: LadderStandings, summary?: PlayerSummary): Promise<void> {
  if (!hasPvpIdentity()) return;
  await request("POST", "/me/profile", requireIdentity(), { ...(name.trim() ? { name: name.trim() } : {}), ladders, ...(summary ? { summary } : {}) });
}
/** O ranking de uma escada, só com gente de verdade (sem identidade, ninguém sai marcado como "você"). */
export async function pvpLeaderboard(ladder: Ladder): Promise<LeaderboardRow[]> {
  const { leaderboard } = await request("GET", `/leaderboard?ladder=${ladder}`, hasPvpIdentity() ? pvpIdentity() : null);
  return leaderboard ?? [];
}
/** Os duelos guardados no servidor (do mais novo para o mais velho). */
export async function pvpServerMatches(limit = 100): Promise<PvpServerMatch[]> {
  const { matches } = await request("GET", `/me/matches?limit=${limit}`, requireIdentity());
  return matches ?? [];
}

/** O canal do jogador (SSE /me/events): a visão da fila a cada mudança e os avisos de amizade/desafio. Enquanto ele está aberto, o servidor sabe
 *  que o app está aberto (a fila vale e os amigos veem "online"). */
export function pvpSubscribeQueue(onView: (view: PvpQueueView) => void, onError?: (error: unknown) => void, onSocial?: (event: SocialEvent) => void): () => void {
  const identity = pvpIdentity();
  if (!identity) { onError?.(new PvpClientError("network", "Sem armazenamento neste navegador.")); return () => undefined; }
  const source = new EventSource(`${BASE}/me/events?player=${encodeURIComponent(identity.id)}&secret=${encodeURIComponent(identity.secret)}`);
  source.addEventListener("queue", (event) => {
    try { onView(JSON.parse((event as MessageEvent).data)); } catch (error) { onError?.(error); }
  });
  source.addEventListener("social", (event) => {
    try { const data: unknown = JSON.parse((event as MessageEvent).data); if (isSocialEvent(data)) onSocial?.(data); } catch (error) { onError?.(error); }
  });
  source.onerror = () => onError?.(new PvpClientError("network", "A conexão com a fila caiu; tentando de novo…"));
  return () => source.close();
}

/** Ouve a sala em tempo real (SSE); chama `onView` a cada mudança. Devolve uma função para fechar a conexão. */
export function pvpSubscribe(code: string, onView: (view: PvpRoomView) => void, onError?: (error: unknown) => void): () => void {
  const identity = pvpIdentity();
  if (!identity) { onError?.(new PvpClientError("network", "Sem armazenamento neste navegador.")); return () => undefined; }
  const source = new EventSource(`${BASE}/rooms/${code}/events?player=${encodeURIComponent(identity.id)}&secret=${encodeURIComponent(identity.secret)}`);
  source.addEventListener("room", (event) => {
    try { onView(JSON.parse((event as MessageEvent).data)); } catch (error) { onError?.(error); }
  });
  source.onerror = () => onError?.(new PvpClientError("network", "A conexão com o duelo caiu; tentando de novo…"));
  return () => source.close();
}
