// Salas do duelo entre pessoas (PvP ao vivo): a máquina de estados, sem rede nem relógio próprio (o relógio entra por parâmetro, para testar). O servidor HTTP
// (pvp-http.ts) só traduz pedidos em chamadas daqui e empurra a visão de cada jogador quando a sala muda. Regras e tipos compartilhados com o app: src/domain/pvp.ts.
import { randomInt } from "node:crypto";
import { LEGS, LEG_ROUNDS, type Ladder } from "../src/domain/duel-modes.js";
import {
  COUNTDOWN_MS, DONE_TTL_MS, GRACE_MS, MAX_ROUND_MS, MIN_ROUND_MS, OPEN_TTL_MS, PLAYING_TTL_MS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, cleanPlayerName, isValidRoomCode, settlePvp, sideFinished, sideTotals,
  type PvpClosedReason, type PvpCommand, type PvpErrorCode, type PvpInvite, type PvpMode, type PvpOutcome, type PvpPhase, type PvpPlayerView, type PvpRoomView, type RoundReport, type SideTotals,
} from "../src/domain/pvp.js";

export class PvpError extends Error {
  constructor(readonly code: PvpErrorCode, message: string = code) { super(message); this.name = "PvpError"; }
}

export type PlayerInput = { id: string; name: string; rating: number; trophies: number };
type Seat = PlayerInput & { ready: boolean; connections: number; disconnectedAt: number | null; forfeited: boolean; legs: RoundReport[][] };
type Settled = { host: SideTotals; guest: SideTotals; hostOutcome: PvpOutcome; guestOutcome: PvpOutcome; tiebreak: boolean };
type Room = {
  code: string; ladder: Ladder; mode: PvpMode; seed: string; phase: PvpPhase; closedReason: PvpClosedReason | null;
  createdAt: number; phaseAt: number; startAt: number | null; rev: number; host: Seat; guest: Seat | null; settled: Settled | null;
};
export type PvpRoomsOptions = { now?: () => number; random?: () => number; countdownMs?: number; graceMs?: number };

const newSeat = (player: PlayerInput): Seat => ({ id: player.id, name: cleanPlayerName(player.name) || "Jogador", rating: clampNumber(player.rating, 0, 9999), trophies: clampNumber(player.trophies, 0, 99999), ready: false, connections: 0, disconnectedAt: null, forfeited: false, legs: Array.from({ length: LEGS }, () => []) });
function clampNumber(value: unknown, min: number, max: number) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min; }

export class PvpRooms {
  /** Chamado depois de cada mudança de uma sala (o servidor HTTP empurra a nova visão a quem está conectado). */
  onChange: (code: string) => void = () => undefined;
  private rooms = new Map<string, Room>();
  private roomOf = new Map<string, string>();
  private now: () => number;
  private random: () => number;
  private countdownMs: number;
  private graceMs: number;

  constructor(options: PvpRoomsOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomInt(0, 2 ** 30) / 2 ** 30);
    this.countdownMs = options.countdownMs ?? COUNTDOWN_MS;
    this.graceMs = options.graceMs ?? GRACE_MS;
  }

  get size() { return this.rooms.size; }
  has(code: string) { return this.rooms.has(code); }
  /** A sala em que o jogador está (aberta ou em jogo), se houver. */
  roomCodeOf(playerId: string) { return this.roomOf.get(playerId) ?? null; }

  // ---- Criar, convidar e entrar ----
  createRoom(player: PlayerInput, setup: { ladder: Ladder; mode: PvpMode }): PvpRoomView {
    this.leaveCurrent(player.id);
    if (this.rooms.size >= 200) throw new PvpError("too_many", "Salas demais no servidor.");
    const now = this.now();
    let code = "";
    do { code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)]).join(""); } while (this.rooms.has(code));
    const seed = Array.from({ length: 10 }, () => ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)]).join("").toLowerCase();
    const room: Room = { code, ladder: setup.ladder, mode: setup.mode, seed, phase: "open", closedReason: null, createdAt: now, phaseAt: now, startAt: null, rev: 1, host: newSeat(player), guest: null, settled: null };
    this.rooms.set(code, room);
    this.roomOf.set(player.id, code);
    this.changed(room, false);
    return this.viewOf(room, player.id);
  }

  /** O convite visto por quem ainda não entrou (a página "Fulano te desafiou"). */
  invite(code: string): PvpInvite {
    const room = this.find(code);
    return { code: room.code, phase: room.phase, ladder: room.ladder, mode: room.mode, hostName: room.host.name, hostTrophies: room.host.trophies, full: room.guest !== null };
  }

  joinRoom(code: string, player: PlayerInput): PvpRoomView {
    const room = this.find(code);
    this.advance(room);
    if (room.host.id === player.id) throw new PvpError("forbidden", "Este é o convite do próprio anfitrião.");
    // voltar à sala (a página recarregou): a mesma pessoa entra de novo sem mudar nada
    if (room.guest?.id === player.id && (room.phase === "lobby" || room.phase === "countdown" || room.phase === "playing")) return this.viewOf(room, player.id);
    if (room.phase === "closed" || room.phase === "done") throw new PvpError("wrong_phase", "Este duelo já acabou.");
    if (room.phase !== "open" || room.guest) throw new PvpError("room_full", "Este duelo já tem dois jogadores.");
    this.leaveCurrent(player.id);
    room.guest = newSeat(player);
    this.roomOf.set(player.id, room.code);
    this.setPhase(room, "lobby");
    this.changed(room);
    return this.viewOf(room, player.id);
  }

  // ---- Comandos ----
  /** null quando o comando tira a pessoa da sala ("leave"): não há mais visão dela para devolver. */
  command(code: string, playerId: string, command: PvpCommand): PvpRoomView | null {
    const room = this.find(code);
    this.advance(room);
    const seat = this.seatOf(room, playerId);
    if (!seat) throw new PvpError("forbidden", "Você não está neste duelo.");
    if (command.type === "ping") return this.viewOf(room, playerId);
    if (command.type === "leave") { this.leaveSeat(room, seat); return this.seatOf(room, playerId) ? this.viewOf(room, playerId) : null; }
    if (command.type === "ready") {
      if (room.phase !== "lobby" && room.phase !== "countdown") throw new PvpError("wrong_phase", "Só dá para ficar pronto no lobby.");
      seat.ready = command.ready;
      const both = room.guest !== null && room.host.ready && room.guest.ready;
      if (both && room.phase === "lobby") { room.startAt = this.now() + this.countdownMs; this.setPhase(room, "countdown"); }
      else if (!both && room.phase === "countdown") { room.startAt = null; this.setPhase(room, "lobby"); }
      this.changed(room);
      return this.viewOf(room, playerId);
    }
    // round
    if (room.phase !== "playing") throw new PvpError("wrong_phase", "O duelo não está em andamento.");
    if (seat.forfeited) throw new PvpError("wrong_phase", "Você saiu deste duelo.");
    const { leg, round } = command;
    if (leg < 0 || leg >= LEGS || round < 0 || round >= LEG_ROUNDS) throw new PvpError("bad_request", "Rodada fora do duelo.");
    for (let previous = 0; previous < leg; previous += 1) if (seat.legs[previous].length < LEG_ROUNDS) throw new PvpError("bad_request", "Termine o tempo anterior primeiro.");
    const done = seat.legs[leg].length;
    if (round < done) return this.viewOf(room, playerId); // repetida (a rede reenviou): já vale
    if (round > done) throw new PvpError("bad_request", "Faltou uma rodada antes desta.");
    seat.legs[leg].push({ correct: command.correct, ms: Math.max(MIN_ROUND_MS, Math.min(MAX_ROUND_MS, command.ms)) });
    if (this.bothFinished(room)) this.settle(room);
    this.changed(room);
    return this.viewOf(room, playerId);
  }

  // ---- Conexão (o SSE): quem cai por mais de GRACE_MS sai do duelo ----
  connect(code: string, playerId: string) {
    const room = this.find(code);
    const seat = this.seatOf(room, playerId);
    if (!seat) throw new PvpError("forbidden", "Você não está neste duelo.");
    seat.connections += 1;
    const wasAway = seat.disconnectedAt !== null;
    seat.disconnectedAt = null;
    if (wasAway) this.changed(room);
  }
  disconnect(code: string, playerId: string) {
    const room = this.rooms.get(code);
    const seat = room ? this.seatOf(room, playerId) : null;
    if (!room || !seat) return;
    seat.connections = Math.max(0, seat.connections - 1);
    if (seat.connections === 0 && room.phase !== "done" && room.phase !== "closed") { seat.disconnectedAt = this.now(); this.changed(room); }
  }

  view(code: string, playerId: string): PvpRoomView {
    const room = this.find(code);
    this.advance(room);
    if (!this.seatOf(room, playerId)) throw new PvpError("forbidden", "Você não está neste duelo.");
    return this.viewOf(room, playerId);
  }

  /** A visão atual sem avançar relógios: é o que o servidor empurra a quem está conectado (avançar de novo dentro de uma notificação daria volta). */
  peek(code: string, playerId: string): PvpRoomView {
    const room = this.find(code);
    if (!this.seatOf(room, playerId)) throw new PvpError("forbidden", "Você não está neste duelo.");
    return this.viewOf(room, playerId);
  }

  /** Avança os relógios de todas as salas (o servidor chama a cada segundo): fim da contagem, quedas de conexão, salas velhas. */
  tick() {
    for (const room of [...this.rooms.values()]) this.advance(room);
  }

  // ---- Internos ----
  private find(code: string): Room {
    const room = isValidRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) throw new PvpError("not_found", "Duelo não encontrado (ou já expirou).");
    return room;
  }
  private seatOf(room: Room, playerId: string): Seat | null {
    return room.host.id === playerId ? room.host : room.guest?.id === playerId ? room.guest : null;
  }
  private opponentOf(room: Room, seat: Seat): Seat | null { return seat === room.host ? room.guest : room.host; }
  private isOver(room: Room) { return room.phase === "closed" || room.phase === "done"; }
  private setPhase(room: Room, phase: PvpPhase) { room.phase = phase; room.phaseAt = this.now(); }
  private changed(room: Room, notify = true) { room.rev += 1; if (notify) this.onChange(room.code); }
  private bothFinished(room: Room) {
    return room.guest !== null && sideFinished(room.host.legs, room.host.forfeited) && sideFinished(room.guest.legs, room.guest.forfeited);
  }
  private release(room: Room) { for (const seat of [room.host, room.guest]) if (seat && this.roomOf.get(seat.id) === room.code) this.roomOf.delete(seat.id); }

  private close(room: Room, reason: PvpClosedReason) {
    room.closedReason = reason;
    this.setPhase(room, "closed");
    this.release(room);
    this.changed(room);
  }

  private settle(room: Room) {
    const guest = room.guest as Seat;
    const host = sideTotals(room.host.legs, room.host.forfeited), guestTotals = sideTotals(guest.legs, guest.forfeited);
    const result = settlePvp(host, guestTotals);
    room.settled = { host, guest: guestTotals, hostOutcome: result.a, guestOutcome: result.b, tiebreak: result.tiebreak };
    this.setPhase(room, "done");
    this.release(room);
  }

  /** Um jogador sai (comando "leave" ou queda de conexão longa). */
  private leaveSeat(room: Room, seat: Seat) {
    if (room.phase === "open") return this.close(room, "cancelled");
    if (room.phase === "lobby" || room.phase === "countdown") {
      if (seat === room.host) return this.close(room, "host-left");
      this.roomOf.delete(seat.id);
      room.guest = null;
      room.host.ready = false;
      room.startAt = null;
      this.setPhase(room, "open");
      return this.changed(room);
    }
    if (room.phase === "playing" && !seat.forfeited) {
      // desistir vale zero no que falta (o que já foi respondido fica); o outro segue e o resultado sai quando ele terminar
      seat.forfeited = true;
      if (this.bothFinished(room)) this.settle(room);
      this.changed(room);
    }
  }
  private leaveCurrent(playerId: string) {
    const code = this.roomOf.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    const seat = room ? this.seatOf(room, playerId) : null;
    if (room && seat) this.leaveSeat(room, seat);
    this.roomOf.delete(playerId);
  }

  private advance(room: Room) {
    const now = this.now();
    if (room.phase === "countdown" && room.startAt !== null && now >= room.startAt) { this.setPhase(room, "playing"); this.changed(room); }
    if (room.phase === "done" || room.phase === "closed") {
      if (now - room.phaseAt > DONE_TTL_MS) this.rooms.delete(room.code);
      return;
    }
    // quem ficou desconectado por mais do que a tolerância sai
    for (const seat of [room.host, room.guest]) {
      if (seat && seat.disconnectedAt !== null && now - seat.disconnectedAt > this.graceMs) { seat.disconnectedAt = null; this.leaveSeat(room, seat); if (this.isOver(room)) return; }
    }
    if (room.phase === "open" || room.phase === "lobby") { if (now - room.createdAt > OPEN_TTL_MS && now - room.phaseAt > OPEN_TTL_MS) this.close(room, "expired"); return; }
    if (room.phase === "playing" && room.startAt !== null && now - room.startAt > PLAYING_TTL_MS) {
      for (const seat of [room.host, room.guest]) if (seat && !sideFinished(seat.legs, seat.forfeited)) seat.forfeited = true;
      this.settle(room);
      this.changed(room);
    }
  }

  private playerView(seat: Seat): PvpPlayerView {
    return { name: seat.name, rating: seat.rating, trophies: seat.trophies, ready: seat.ready, connected: seat.connections > 0 || seat.disconnectedAt === null, forfeited: seat.forfeited, legs: seat.legs.map((rounds) => rounds.map((round) => ({ ...round }))) };
  }

  private viewOf(room: Room, playerId: string): PvpRoomView {
    const me = this.seatOf(room, playerId) as Seat;
    const other = this.opponentOf(room, me);
    const isHost = me === room.host;
    // A partir do lobby (o amigo já entrou): os dois veem os mesmos 2 modos que vão jogar, para decidir "ficar pronto" sabendo o que vem.
    // Só o anfitrião sozinho (fase "open", antes do amigo entrar) não vê, senão dava para recriar o convite até sair um sorteio favorito.
    const revealSeed = room.phase === "lobby" || room.phase === "countdown" || room.phase === "playing" || room.phase === "done";
    const settled = room.settled;
    return {
      code: room.code, ladder: room.ladder, mode: room.mode, phase: room.phase, closedReason: room.closedReason,
      seed: revealSeed ? room.seed : null, startAt: room.startAt, serverNow: this.now(), rev: room.rev, host: isHost,
      you: this.playerView(me), opponent: other ? this.playerView(other) : null,
      result: settled ? { you: isHost ? settled.host : settled.guest, opponent: isHost ? settled.guest : settled.host, outcome: isHost ? settled.hostOutcome : settled.guestOutcome, tiebreak: settled.tiebreak } : null,
    };
  }
}
