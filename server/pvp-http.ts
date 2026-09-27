// A API do PvP sobre HTTP puro (sem dependências): pedidos JSON para criar, entrar e mandar comandos, e uma conexão SSE por jogador para receber, em tempo real, a visão
// atualizada da sala. Funciona atrás de qualquer proxy (Tailscale Funnel incluso) e o EventSource reconecta sozinho. Rotas em /api/pvp:
//   GET  /health                       GET  /rooms/:code/invite (sem login)      POST /rooms {ladder, mode, name, rating, trophies}
//   POST /rooms/:code/join {name, rating, trophies}   POST /rooms/:code/command {type...}   GET /rooms/:code   GET /rooms/:code/events (SSE)
// Identidade nos cabeçalhos x-pvp-player e x-pvp-secret (no SSE, na URL: ?player=&secret=, porque o EventSource não manda cabeçalhos).
import type { IncomingMessage, ServerResponse } from "node:http";
import { isLadder } from "../src/domain/duel-modes.js";
import { isPvpMode, isValidRoomCode, normalizeRoomCode, parseCommand, type PvpErrorCode } from "../src/domain/pvp.js";
import { PvpError, type PvpRooms } from "./pvp-rooms.js";
import type { PlayerRegistry } from "./pvp-players.js";

const BASE = "/api/pvp";
const STATUS: Record<PvpErrorCode, number> = { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, room_full: 409, wrong_phase: 409, too_many: 429 };
const MAX_BODY = 8192;
const MAX_STREAMS = 100;

type Subscriber = { playerId: string; res: ServerResponse };
export type PvpHttpOptions = { rooms: PvpRooms; players: PlayerRegistry; tickMs?: number; heartbeatMs?: number };
export type PvpHttp = { /** Trata o pedido se for do PvP (devolve true); senão devolve false e o pedido segue. */ handle: (req: IncomingMessage, res: ServerResponse) => boolean; dispose: () => void };

export function createPvpHttp({ rooms, players, tickMs = 1000, heartbeatMs = 15000 }: PvpHttpOptions): PvpHttp {
  const streams = new Map<string, Set<Subscriber>>();
  let streamCount = 0;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    if (res.headersSent) return;
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, error: unknown) => {
    if (error instanceof PvpError) return json(res, STATUS[error.code], { error: error.code, message: error.message });
    console.error("[pvp] erro inesperado:", error);
    return json(res, 500, { error: "internal", message: "Erro no servidor." });
  };
  const readJson = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_BODY) { reject(new PvpError("bad_request", "Pedido grande demais.")); req.destroy(); } else chunks.push(chunk); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(new PvpError("bad_request", "JSON inválido.")); } });
    req.on("error", reject);
  });
  const header = (req: IncomingMessage, name: string) => { const value = req.headers[name]; return Array.isArray(value) ? value[0] : value; };
  const authenticate = (id: unknown, secret: unknown) => { if (!players.authenticate(id, secret)) throw new PvpError("unauthorized", "Identidade inválida."); return id as string; };
  const player = (playerId: string, body: Record<string, unknown>) => ({ id: playerId, name: String(body.name ?? ""), rating: Number(body.rating), trophies: Number(body.trophies) });

  // ---- SSE ----
  const send = (subscriber: Subscriber, code: string) => {
    try {
      const view = rooms.peek(code, subscriber.playerId);
      subscriber.res.write(`event: room\nid: ${view.rev}\ndata: ${JSON.stringify(view)}\n\n`);
    } catch { subscriber.res.end(); }
  };
  rooms.onChange = (code) => { for (const subscriber of streams.get(code) ?? []) send(subscriber, code); };

  const openStream = (req: IncomingMessage, res: ServerResponse, code: string, url: URL) => {
    const playerId = authenticate(url.searchParams.get("player"), url.searchParams.get("secret"));
    if (streamCount >= MAX_STREAMS) throw new PvpError("too_many", "Conexões demais.");
    rooms.connect(code, playerId); // 403 se não estiver na sala, 404 se não existir
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write("retry: 2000\n\n");
    const subscriber: Subscriber = { playerId, res };
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code)?.add(subscriber);
    streamCount += 1;
    send(subscriber, code);
    req.on("close", () => {
      streams.get(code)?.delete(subscriber);
      if (streams.get(code)?.size === 0) streams.delete(code);
      streamCount -= 1;
      rooms.disconnect(code, playerId);
    });
  };

  // ---- Rotas ----
  const route = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const path = url.pathname.slice(BASE.length).replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean); // ["rooms", "ABC234", "join"]
    const method = req.method ?? "GET";
    if (path === "/health" && method === "GET") return json(res, 200, { ok: true, rooms: rooms.size });
    if (parts[0] !== "rooms") throw new PvpError("not_found", "Rota desconhecida.");

    if (parts.length === 1 && method === "POST") {
      const playerId = authenticate(header(req, "x-pvp-player"), header(req, "x-pvp-secret"));
      const body = (await readJson(req)) as Record<string, unknown>;
      if (!isLadder(body.ladder) || !isPvpMode(body.mode)) throw new PvpError("bad_request", "Escolha a escada e o modo do duelo.");
      return json(res, 201, { room: rooms.createRoom(player(playerId, body), { ladder: body.ladder, mode: body.mode }) });
    }

    const code = normalizeRoomCode(parts[1] ?? "");
    if (!isValidRoomCode(code)) throw new PvpError("not_found", "Código de duelo inválido.");
    const action = parts[2];

    if (!action && method === "GET") {
      const playerId = authenticate(header(req, "x-pvp-player"), header(req, "x-pvp-secret"));
      return json(res, 200, { room: rooms.view(code, playerId) });
    }
    if (action === "invite" && method === "GET") return json(res, 200, { invite: rooms.invite(code) });
    if (action === "events" && method === "GET") return openStream(req, res, code, url);
    if (action === "join" && method === "POST") {
      const playerId = authenticate(header(req, "x-pvp-player"), header(req, "x-pvp-secret"));
      const body = (await readJson(req)) as Record<string, unknown>;
      return json(res, 200, { room: rooms.joinRoom(code, player(playerId, body)) });
    }
    if (action === "command" && method === "POST") {
      const playerId = authenticate(header(req, "x-pvp-player"), header(req, "x-pvp-secret"));
      const command = parseCommand(await readJson(req));
      if (!command) throw new PvpError("bad_request", "Comando inválido.");
      return json(res, 200, { room: rooms.command(code, playerId, command) ?? null });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const ticker = setInterval(() => {
    rooms.tick();
    // conexões de salas que já foram apagadas: fecha
    for (const [code, set] of streams) if (!rooms.has(code)) { for (const subscriber of set) subscriber.res.end(); streams.delete(code); }
  }, tickMs);
  const heart = setInterval(() => { for (const set of streams.values()) for (const subscriber of set) { try { subscriber.res.write(": batida\n\n"); } catch { /* fecha sozinho */ } } }, heartbeatMs);
  ticker.unref?.(); heart.unref?.();

  return {
    handle(req, res) {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return false;
      route(req, res, url).catch((error) => fail(res, error));
      return true;
    },
    dispose() {
      clearInterval(ticker); clearInterval(heart);
      for (const set of streams.values()) for (const subscriber of set) subscriber.res.end();
      streams.clear();
    },
  };
}
