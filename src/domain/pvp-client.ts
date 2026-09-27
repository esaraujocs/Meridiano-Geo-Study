// Cliente do duelo entre pessoas: identidade do aparelho (sem login, ver server/pvp-players.ts) e a rede (HTTP + SSE) para /api/pvp.
// Toca localStorage, fetch e EventSource: só funciona no navegador (não em scripts/test-pvp.mjs, que testa o servidor puro).
import type { PvpCommand, PvpErrorCode, PvpInvite, PvpMode, PvpRoomView } from "./pvp.js";
import type { Ladder } from "./duel-modes.js";

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

export function pvpName(): string { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } }
export function setPvpName(name: string) { try { localStorage.setItem(NAME_KEY, name.slice(0, 20)); } catch { /* sem armazenamento */ } }

async function request(method: "GET" | "POST", path: string, identity: { id: string; secret: string } | null, body?: unknown): Promise<{ room?: PvpRoomView; invite?: PvpInvite }> {
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

export async function pvpCreateRoom(ladder: Ladder, mode: PvpMode, name: string, rating: number, trophies: number): Promise<PvpRoomView> {
  const identity = pvpIdentity();
  if (!identity) throw new PvpClientError("network", "Sem armazenamento neste navegador.");
  const { room } = await request("POST", "/rooms", identity, { ladder, mode, name, rating, trophies });
  return room as PvpRoomView;
}

export async function pvpGetInvite(code: string): Promise<PvpInvite> {
  const { invite } = await request("GET", `/rooms/${code}/invite`, null);
  return invite as PvpInvite;
}

export async function pvpJoinRoom(code: string, name: string, rating: number, trophies: number): Promise<PvpRoomView> {
  const identity = pvpIdentity();
  if (!identity) throw new PvpClientError("network", "Sem armazenamento neste navegador.");
  const { room } = await request("POST", `/rooms/${code}/join`, identity, { name, rating, trophies });
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
