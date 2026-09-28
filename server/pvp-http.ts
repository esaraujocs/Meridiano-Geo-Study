// A API do PvP sobre HTTP puro (sem dependências): pedidos JSON para criar, entrar e mandar comandos, e conexões SSE para receber, em tempo real, a visão
// atualizada da sala (uma por sala) e da fila (uma por jogador). Funciona atrás de qualquer proxy (Tailscale Funnel incluso) e o EventSource reconecta
// sozinho. Rotas em /api/pvp:
//   GET  /health
//   Convite:  GET /rooms/:code/invite (sem login)   POST /rooms {ladder, mode, name, ladders}   POST /rooms/:code/join {name, ladders}
//             POST /rooms/:code/command {type...}   GET /rooms/:code   GET /rooms/:code/events (SSE da sala)
//   Fila:     GET /queue   POST /queue {ladder, mode, name, ladders}   POST /queue/leave   POST /queue/offer {id, accept}
//   Perfil:   GET /me   GET /me/matches?limit=   GET /me/events (SSE do jogador: a visão da fila)   POST /me/profile {name, ladders}
//   Ranking:  GET /leaderboard?ladder=&limit= (identidade opcional: só marca "você")
// Identidade nos cabeçalhos x-pvp-player e x-pvp-secret (no SSE, na URL: ?player=&secret=, porque o EventSource não manda cabeçalhos).
// A força (rating) de cada jogador vem do histórico do servidor (pvp-history.ts); o que o aparelho mandar em `rating` é ignorado.
import type { IncomingMessage, ServerResponse } from "node:http";
import { isLadder } from "../src/domain/duel-modes.js";
import { PROFILE_RECENT, isFriendCode, normalizeFriendCode, parseSummary, tallyMatches, type FriendView, type PlayerProfile, type SocialEvent } from "../src/domain/pvp-social.js";
import { EMPTY_STANDINGS, LEADERBOARD_LIMIT, cleanPlayerName, isPvpMode, isQueuePrefs, isValidRoomCode, normalizeRoomCode, parseCommand, parseOfferResponse, parseStandings, type PvpErrorCode } from "../src/domain/pvp.js";
import { FriendGraph } from "./pvp-friends.js";
import { PvpHistory } from "./pvp-history.js";
import { PvpQueue } from "./pvp-queue.js";
import { PvpError, type PlayerInput, type PvpRooms } from "./pvp-rooms.js";
import type { PlayerRegistry } from "./pvp-players.js";

const BASE = "/api/pvp";
const STATUS: Record<PvpErrorCode, number> = { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, room_full: 409, wrong_phase: 409, too_many: 429 };
const MAX_BODY = 8192;
const MAX_STREAMS = 100;
const SSE_HEADERS = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" };

type Subscriber = { playerId: string; res: ServerResponse };
export type PvpHttpOptions = {
  rooms: PvpRooms;
  players: PlayerRegistry;
  /** Sem fila/histórico explícitos, cada um nasce só na memória (testes). */
  queue?: PvpQueue;
  history?: PvpHistory;
  friends?: FriendGraph;
  tickMs?: number;
  heartbeatMs?: number;
};
export type PvpHttp = {
  /** Trata o pedido se for do PvP (devolve true); senão devolve false e o pedido segue. */
  handle: (req: IncomingMessage, res: ServerResponse) => boolean;
  dispose: () => void;
  queue: PvpQueue;
  history: PvpHistory;
  friends: FriendGraph;
};

export function createPvpHttp({ rooms, players, queue: givenQueue, history: givenHistory, friends: givenFriends, tickMs = 1000, heartbeatMs = 15000 }: PvpHttpOptions): PvpHttp {
  const history = givenHistory ?? new PvpHistory(null);
  const friends = givenFriends ?? new FriendGraph(null);
  const queue = givenQueue ?? new PvpQueue({ rooms });
  // o placar de cada sala vai para o histórico (que devolve a força antes/depois); sala da fila desfeita antes de começar põe quem ficou de volta na fila
  rooms.onSettle = (match) => history.record(match);
  rooms.onQueueRoomLeft = (_code, remaining) => queue.requeue(remaining);

  const roomStreams = new Map<string, Set<Subscriber>>();
  const playerStreams = new Map<string, Set<ServerResponse>>();
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
  const authenticateHeaders = (req: IncomingMessage) => authenticate(header(req, "x-pvp-player"), header(req, "x-pvp-secret"));
  /** Quem entra numa sala ou na fila: nome (o último usado, se não vier), força DO SERVIDOR e troféus/MMR por escada que o aparelho informou (sem
   *  eles no pedido, os últimos que ele informou). */
  const player = (playerId: string, body: Record<string, unknown>): PlayerInput => {
    const name = cleanPlayerName(body.name) || players.nameOf(playerId) || "Jogador";
    players.setName(playerId, name);
    const declared = body.ladders !== undefined || body.trophies !== undefined;
    if (declared) players.setStandings(playerId, parseStandings(body));
    return { id: playerId, name, rating: history.ratingOf(playerId), ladders: players.standingsOf(playerId) ?? EMPTY_STANDINGS, code: players.codeOf(playerId) };
  };
  const codeOf = (id: string) => players.codeOf(id);
  /** Outro jogador pelo código de amigo (404 se ninguém tem esse código). */
  const byCode = (input: unknown) => {
    const code = normalizeFriendCode(String(input ?? ""));
    const id = isFriendCode(code) ? players.idOfCode(code) : null;
    if (!id) throw new PvpError("not_found", "Ninguém com esse código.");
    return id;
  };
  const friendView = (id: string, since: number): FriendView => ({ code: codeOf(id), name: players.nameOf(id) || "Jogador", online: queue.isOnline(id), ladders: players.standingsOf(id), since });
  const friendsView = (me: string) => {
    const list = friends.list(me);
    return { code: codeOf(me), friends: list.friends.map((item) => friendView(item.id, item.since)), incoming: list.incoming.map((item) => friendView(item.id, item.since)), outgoing: list.outgoing.map((item) => friendView(item.id, item.since)) };
  };
  /** Avisa um jogador pelo canal dele (se o app estiver aberto). */
  const sendSocial = (playerId: string, event: SocialEvent) => {
    for (const res of playerStreams.get(playerId) ?? []) { try { res.write(`event: social\ndata: ${JSON.stringify(event)}\n\n`); } catch { /* fecha sozinho */ } }
  };
  const fromOf = (id: string) => ({ code: codeOf(id), name: players.nameOf(id) || "Jogador" });
  const profileOf = (viewer: string, target: string): PlayerProfile => {
    const own = history.profileOf(target, "", 0);
    const between = viewer === target ? [] : history.between(viewer, target, 1000, codeOf);
    const summary = players.summaryOf(target);
    return {
      code: codeOf(target), name: players.nameOf(target) || "Jogador", since: players.createdAtOf(target), online: queue.isOnline(target), friendship: friends.state(viewer, target),
      ladders: players.standingsOf(target), pvp: { ranked: own.ranked, friendly: own.friendly },
      headToHead: { ...tallyMatches(between), recent: between.slice(0, PROFILE_RECENT) },
      recent: history.matchesOf(target, PROFILE_RECENT, codeOf),
      summary: summary?.summary ?? null, summaryAt: summary?.at ?? null,
    };
  };
  /** O visitante, se vier com identidade válida (o ranking pode ser visto sem ela, só não marca ninguém como "você"). */
  const optionalViewer = (req: IncomingMessage) => {
    const id = header(req, "x-pvp-player");
    return id && players.has(id) && players.authenticate(id, header(req, "x-pvp-secret")) ? id : null;
  };

  // ---- SSE ----
  const openSse = (res: ServerResponse) => {
    if (streamCount >= MAX_STREAMS) throw new PvpError("too_many", "Conexões demais.");
    res.writeHead(200, SSE_HEADERS);
    res.write("retry: 2000\n\n");
    streamCount += 1;
  };
  const sendRoom = (subscriber: Subscriber, code: string) => {
    try {
      const view = rooms.peek(code, subscriber.playerId);
      subscriber.res.write(`event: room\nid: ${view.rev}\ndata: ${JSON.stringify(view)}\n\n`);
    } catch { subscriber.res.end(); }
  };
  const sendQueue = (playerId: string, res: ServerResponse) => {
    try {
      const view = queue.view(playerId);
      res.write(`event: queue\nid: ${view.rev}\ndata: ${JSON.stringify(view)}\n\n`);
    } catch { res.end(); }
  };
  rooms.onChange = (code) => { for (const subscriber of roomStreams.get(code) ?? []) sendRoom(subscriber, code); };
  queue.onChange = (playerId) => { for (const res of playerStreams.get(playerId) ?? []) sendQueue(playerId, res); };

  const openRoomStream = (req: IncomingMessage, res: ServerResponse, code: string, url: URL) => {
    const playerId = authenticate(url.searchParams.get("player"), url.searchParams.get("secret"));
    if (streamCount >= MAX_STREAMS) throw new PvpError("too_many", "Conexões demais.");
    rooms.connect(code, playerId); // 403 se não estiver na sala, 404 se não existir
    openSse(res);
    const subscriber: Subscriber = { playerId, res };
    if (!roomStreams.has(code)) roomStreams.set(code, new Set());
    roomStreams.get(code)?.add(subscriber);
    sendRoom(subscriber, code);
    req.on("close", () => {
      roomStreams.get(code)?.delete(subscriber);
      if (roomStreams.get(code)?.size === 0) roomStreams.delete(code);
      streamCount -= 1;
      rooms.disconnect(code, playerId);
    });
  };

  const openPlayerStream = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const playerId = authenticate(url.searchParams.get("player"), url.searchParams.get("secret"));
    openSse(res);
    if (!playerStreams.has(playerId)) playerStreams.set(playerId, new Set());
    playerStreams.get(playerId)?.add(res);
    queue.connect(playerId);
    sendQueue(playerId, res);
    req.on("close", () => {
      playerStreams.get(playerId)?.delete(res);
      if (playerStreams.get(playerId)?.size === 0) playerStreams.delete(playerId);
      streamCount -= 1;
      queue.disconnect(playerId);
    });
  };

  // ---- Rotas ----
  const routeQueue = async (req: IncomingMessage, res: ServerResponse, parts: string[], method: string) => {
    const playerId = authenticateHeaders(req);
    const action = parts[1];
    if (!action && method === "GET") return json(res, 200, { queue: queue.view(playerId) });
    if (!action && method === "POST") {
      const body = (await readJson(req)) as Record<string, unknown>;
      if (!isQueuePrefs(body)) throw new PvpError("bad_request", "Escolha a escada e o modo do duelo.");
      // Na fila OU numa sala, nunca os dois: convite aberto (sozinho esperando o amigo) é cancelado; duelo já com adversário, não dá para buscar outro.
      const phase = rooms.phaseOf(playerId);
      if (phase && phase !== "open") throw new PvpError("wrong_phase", "Você já está num duelo.");
      if (phase === "open") rooms.leave(playerId);
      return json(res, 200, { queue: queue.join(player(playerId, body), { ladder: body.ladder, mode: body.mode }) });
    }
    if (action === "leave" && method === "POST") return json(res, 200, { queue: queue.leave(playerId) });
    if (action === "offer" && method === "POST") {
      const answer = parseOfferResponse(await readJson(req));
      if (!answer) throw new PvpError("bad_request", "Resposta inválida.");
      return json(res, 200, { queue: queue.respond(playerId, answer.id, answer.accept) });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const routeMe = async (req: IncomingMessage, res: ServerResponse, parts: string[], method: string, url: URL) => {
    const action = parts[1];
    if (action === "events" && method === "GET") return openPlayerStream(req, res, url);
    const playerId = authenticateHeaders(req);
    if (!action && method === "GET") return json(res, 200, { profile: history.profileOf(playerId, players.nameOf(playerId), players.createdAtOf(playerId)) });
    if (action === "profile" && method === "POST") {
      // o aparelho informa nome e onde está nas escadas (ao abrir o app e depois de cada duelo): é de onde sai o ranking
      const body = (await readJson(req)) as Record<string, unknown>;
      const name = cleanPlayerName(body.name);
      if (name) players.setName(playerId, name);
      if (body.ladders !== undefined) players.setStandings(playerId, parseStandings(body));
      const summary = parseSummary(body.summary);
      if (summary) players.setSummary(playerId, summary);
      return json(res, 200, { ok: true, code: codeOf(playerId) });
    }
    if (action === "matches" && method === "GET") {
      const limit = Math.max(1, Math.min(200, Math.round(Number(url.searchParams.get("limit") ?? 50)) || 50));
      return json(res, 200, { matches: history.matchesOf(playerId, limit, codeOf) });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const routeRooms = async (req: IncomingMessage, res: ServerResponse, parts: string[], method: string, url: URL) => {
    if (parts.length === 1 && method === "POST") {
      const playerId = authenticateHeaders(req);
      const body = (await readJson(req)) as Record<string, unknown>;
      if (!isLadder(body.ladder) || !isPvpMode(body.mode)) throw new PvpError("bad_request", "Escolha a escada e o modo do duelo.");
      queue.leave(playerId); // criar um convite tira da fila
      return json(res, 201, { room: rooms.createRoom(player(playerId, body), { ladder: body.ladder, mode: body.mode }) });
    }

    const code = normalizeRoomCode(parts[1] ?? "");
    if (!isValidRoomCode(code)) throw new PvpError("not_found", "Código de duelo inválido.");
    const action = parts[2];

    if (!action && method === "GET") {
      const playerId = authenticateHeaders(req);
      return json(res, 200, { room: rooms.view(code, playerId) });
    }
    if (action === "invite" && method === "GET") return json(res, 200, { invite: rooms.invite(code) });
    if (action === "events" && method === "GET") return openRoomStream(req, res, code, url);
    if (action === "join" && method === "POST") {
      const playerId = authenticateHeaders(req);
      const body = (await readJson(req)) as Record<string, unknown>;
      const view = rooms.joinRoom(code, player(playerId, body));
      queue.leave(playerId); // aceitar um convite tira da fila (só depois de entrar: um convite recusado não tira ninguém da fila)
      // aceitar um convite por link já vira amizade (decisão do Enzo, 28/09); o anfitrião fica sabendo pelo canal dele
      const seats = rooms.seatsOf(code);
      if (seats?.origin === "invite" && friends.link(seats.host, playerId)) sendSocial(seats.host, { kind: "accepted", from: fromOf(playerId), at: Date.now() });
      return json(res, 200, { room: view });
    }
    if (action === "command" && method === "POST") {
      const playerId = authenticateHeaders(req);
      const command = parseCommand(await readJson(req));
      if (!command) throw new PvpError("bad_request", "Comando inválido.");
      const view = rooms.command(code, playerId, command);
      if (command.type === "leave") queue.forgetMatch(playerId); // saiu da sala da fila por conta própria: a fila esquece a sala achada
      return json(res, 200, { room: view ?? null });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const routeFriends = async (req: IncomingMessage, res: ServerResponse, parts: string[], method: string) => {
    const me = authenticateHeaders(req);
    const action = parts[1];
    if (!action && method === "GET") return json(res, 200, { friends: friendsView(me) });
    if (method !== "POST") throw new PvpError("not_found", "Rota desconhecida.");
    const body = (await readJson(req)) as Record<string, unknown>;
    // o nome vem junto (o aviso ao outro já sai com ele, mesmo de quem ainda não mandou o perfil)
    const name = cleanPlayerName(body.name);
    if (name) players.setName(me, name);
    const other = byCode(body.code);
    if (!action) {
      // pedir amizade (por código, depois de um duelo, pelo perfil); se o outro já tinha pedido, vira amizade na hora
      const result = friends.request(me, other);
      if (result === "self") throw new PvpError("bad_request", "Esse é o seu próprio código.");
      if (result === "full") throw new PvpError("too_many", "Limite de amigos ou de pedidos.");
      if (result === "sent") sendSocial(other, { kind: "request", from: fromOf(me), at: Date.now() });
      if (result === "accepted") sendSocial(other, { kind: "accepted", from: fromOf(me), at: Date.now() });
      return json(res, 200, { result, friends: friendsView(me) });
    }
    if (action === "respond") {
      const accept = body.accept === true;
      if (!friends.respond(me, other, accept)) throw new PvpError("not_found", "Pedido não encontrado.");
      if (accept) sendSocial(other, { kind: "accepted", from: fromOf(me), at: Date.now() });
      return json(res, 200, { friends: friendsView(me) });
    }
    if (action === "remove") { friends.remove(me, other); return json(res, 200, { friends: friendsView(me) }); }
    if (action === "challenge") {
      // desafio direto a um amigo com o app aberto: cria o convite de sempre e avisa o amigo na hora
      if (!isLadder(body.ladder) || !isPvpMode(body.mode)) throw new PvpError("bad_request", "Escolha a escada e o modo do duelo.");
      if (!friends.areFriends(me, other)) throw new PvpError("forbidden", "Só dá para desafiar amigos.");
      if (!queue.isOnline(other)) throw new PvpError("wrong_phase", "Seu amigo não está com o app aberto.");
      queue.leave(me);
      const room = rooms.createRoom(player(me, body), { ladder: body.ladder, mode: body.mode });
      sendSocial(other, { kind: "challenge", from: fromOf(me), at: Date.now(), room: room.code, ladder: body.ladder, mode: body.mode });
      return json(res, 201, { room });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const route = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const path = url.pathname.slice(BASE.length).replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean); // ["rooms", "ABC234", "join"]
    const method = req.method ?? "GET";
    if (path === "/health" && method === "GET") return json(res, 200, { ok: true, rooms: rooms.size, queue: queue.size });
    if (parts[0] === "rooms") return routeRooms(req, res, parts, method, url);
    if (parts[0] === "queue") return routeQueue(req, res, parts, method);
    if (parts[0] === "me") return routeMe(req, res, parts, method, url);
    if (parts[0] === "friends") return routeFriends(req, res, parts, method);
    if (parts[0] === "players" && parts.length === 2 && method === "GET") return json(res, 200, { profile: profileOf(authenticateHeaders(req), byCode(parts[1])) });
    if (path === "/leaderboard" && method === "GET") {
      const ladder = url.searchParams.get("ladder");
      if (!isLadder(ladder)) throw new PvpError("bad_request", "Escada inválida.");
      const limit = Math.max(1, Math.min(LEADERBOARD_LIMIT, Math.round(Number(url.searchParams.get("limit") ?? LEADERBOARD_LIMIT)) || LEADERBOARD_LIMIT));
      return json(res, 200, { leaderboard: players.leaderboard(ladder, limit, optionalViewer(req)) });
    }
    throw new PvpError("not_found", "Rota desconhecida.");
  };

  const ticker = setInterval(() => {
    rooms.tick();
    queue.tick();
    // conexões de salas que já foram apagadas: fecha
    for (const [code, set] of roomStreams) if (!rooms.has(code)) { for (const subscriber of set) subscriber.res.end(); roomStreams.delete(code); }
  }, tickMs);
  const beat = (res: ServerResponse) => { try { res.write(": batida\n\n"); } catch { /* fecha sozinho */ } };
  const heart = setInterval(() => {
    for (const set of roomStreams.values()) for (const subscriber of set) beat(subscriber.res);
    for (const set of playerStreams.values()) for (const res of set) beat(res);
  }, heartbeatMs);
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
      for (const set of roomStreams.values()) for (const subscriber of set) subscriber.res.end();
      for (const set of playerStreams.values()) for (const res of set) res.end();
      roomStreams.clear();
      playerStreams.clear();
    },
    queue,
    history,
    friends,
  };
}
