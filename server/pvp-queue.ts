// Fila do "Buscar duelo": uma camada fina sobre as salas (pvp-rooms.ts). Como elas, só estado, sem rede nem relógio próprio (o relógio entra por
// parâmetro, para testar). Quando dois pedidos combinam, a fila faz uma PROPOSTA aos dois; com os dois aceitando, pede às salas uma sala comum já
// pronto/pronto (createMatchedRoom) e sai de cena: dali em diante é o mesmo duelo do convite por código. Tipos e constantes em src/domain/pvp.ts.
//
// Regras (decididas com o Enzo em 27/09; ver CLAUDE.md, "Fila"):
// - Ordem de chegada. Primeiro o par EXATO (mesma escada e mesmo modo), sempre com o mais antigo esperando.
// - Sem par exato, uma PROPOSTA DE TROCA (a fila é pequena): depois que o mais novo esperou CROSS_DELAY_MS (hoje zero: na hora), vale primeiro o que pediu quem espera há mais
//   tempo (o mais novo decide se troca); se o mais novo não quiser trocar, o inverso (agora o mais antigo decide). Recusar uma troca NÃO tira ninguém da
//   fila; se os dois recusarem, o par não é oferecido de novo até um deles sair da fila (ou mudar o que busca).
// - Recusar o que VOCÊ MESMO pediu tira você da fila (é preciso buscar de novo); o outro volta ao lugar que tinha, com aviso.
// - Não responder em OFFER_TTL_MS = sair da fila; quem tinha aceitado volta ao lugar que tinha. Recusa ou prazo: o mesmo par espera REOFFER_COOLDOWN_MS.
// - O pedido só vale com o canal do jogador aberto (o app aberto): sem conexão por mais de GRACE_MS, o pedido cai. A busca expira em QUEUE_TTL_MS.
// - Sala da fila que fecha antes de começar porque um saiu: quem ficou volta ao lugar que tinha (requeue), se isso acontecer em até MATCHED_TTL_MS.
import { randomInt } from "node:crypto";
import {
  CROSS_DELAY_MS, GRACE_MS, MATCHED_TTL_MS, OFFER_TTL_MS, QUEUE_TTL_MS, REOFFER_COOLDOWN_MS, ROOM_CODE_ALPHABET, samePrefs,
  type PvpOfferView, type PvpQueueNotice, type PvpQueueNoticeKind, type PvpQueueView, type QueuePrefs,
} from "../src/domain/pvp.js";
import { PvpError, type PlayerInput } from "./pvp-rooms.js";

/** O que a fila precisa das salas: criar a sala dos dois quando os dois aceitam (devolve o código). */
export type QueueRoomsPort = { createMatchedRoom(host: PlayerInput, guest: PlayerInput, setup: QueuePrefs): string };

type Ticket = { player: PlayerInput; prefs: QueuePrefs; since: number; order: number; offer: string | null };
/** `a` é sempre o pedido mais antigo do par. `attempt` 1 é o inverso de uma troca recusada (vale o que `b` pediu). */
type Offer = { id: string; a: string; b: string; setup: QueuePrefs; attempt: 0 | 1; accepted: Set<string>; expiresAt: number };
type Presence = { connections: number; awaySince: number | null };
type Block = { until: number; sticky: boolean };

export type PvpQueueOptions = {
  rooms: QueueRoomsPort;
  now?: () => number;
  random?: () => number;
  graceMs?: number;
  offerTtlMs?: number;
  crossDelayMs?: number;
  queueTtlMs?: number;
  cooldownMs?: number;
  matchedTtlMs?: number;
  maxTickets?: number;
};

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const NOTICE_TTL_MS = 30 * 60 * 1000;

export class PvpQueue {
  /** Chamado quando a visão de um jogador muda (o servidor HTTP empurra a nova visão pelo canal dele). */
  onChange: (playerId: string) => void = () => undefined;
  private tickets = new Map<string, Ticket>();
  private offers = new Map<string, Offer>();
  private presence = new Map<string, Presence>();
  private blocks = new Map<string, Block>();
  private matched = new Map<string, { room: string; at: number; ticket: Ticket }>();
  private notices = new Map<string, PvpQueueNotice>();
  private revs = new Map<string, number>();
  private order = 0;
  private rooms: QueueRoomsPort;
  private now: () => number;
  private random: () => number;
  private graceMs: number;
  private offerTtlMs: number;
  private crossDelayMs: number;
  private queueTtlMs: number;
  private cooldownMs: number;
  private matchedTtlMs: number;
  private maxTickets: number;

  constructor(options: PvpQueueOptions) {
    this.rooms = options.rooms;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomInt(0, 2 ** 30) / 2 ** 30);
    this.graceMs = options.graceMs ?? GRACE_MS;
    this.offerTtlMs = options.offerTtlMs ?? OFFER_TTL_MS;
    this.crossDelayMs = options.crossDelayMs ?? CROSS_DELAY_MS;
    this.queueTtlMs = options.queueTtlMs ?? QUEUE_TTL_MS;
    this.cooldownMs = options.cooldownMs ?? REOFFER_COOLDOWN_MS;
    this.matchedTtlMs = options.matchedTtlMs ?? MATCHED_TTL_MS;
    this.maxTickets = options.maxTickets ?? 200;
  }

  /** Quantas pessoas estão na fila agora. */
  get size() { return this.tickets.size; }
  has(playerId: string) { return this.tickets.has(playerId); }

  // ---- Pedidos do jogador ----
  /** Entra na fila (ou atualiza o que busca, se já estava e não há proposta aberta). */
  join(player: PlayerInput, prefs: QueuePrefs): PvpQueueView {
    const now = this.now();
    this.matched.delete(player.id);
    this.notices.delete(player.id);
    const current = this.tickets.get(player.id);
    if (current) {
      current.player = player;
      // com proposta aberta o que se busca não muda (responda primeiro); sem ela, mudar de escolha mantém o lugar na fila
      if (!current.offer && !samePrefs(current.prefs, prefs)) { current.prefs = { ...prefs }; this.unblockSticky(player.id); }
    } else {
      if (this.tickets.size >= this.maxTickets) throw new PvpError("too_many", "Gente demais na fila agora.");
      this.tickets.set(player.id, { player, prefs: { ...prefs }, since: now, order: ++this.order, offer: null });
      // sem o canal aberto ainda: a tolerância começa a contar agora (o app abre o canal logo antes de entrar)
      const presence = this.presenceOf(player.id);
      if (presence.connections === 0) presence.awaySince = now;
      this.notifyWaiting(player.id);
    }
    this.touch(player.id);
    this.match();
    return this.view(player.id);
  }

  /** Sai da fila. Com proposta aberta, vale como recusa: o outro volta ao lugar que tinha. */
  leave(playerId: string): PvpQueueView {
    this.matched.delete(playerId);
    this.notices.delete(playerId);
    this.dropTicket(playerId, null, "opponent-declined");
    this.touch(playerId);
    this.match();
    return this.view(playerId);
  }

  /** Aceita ou recusa uma proposta. Proposta que já não existe (prazo, o outro recusou) só devolve a visão atual, que conta o que aconteceu. */
  respond(playerId: string, offerId: string, accept: boolean): PvpQueueView {
    const ticket = this.tickets.get(playerId);
    const offer = this.offers.get(offerId);
    if (!ticket || !offer || ticket.offer !== offerId) return this.view(playerId);
    if (this.now() >= offer.expiresAt) { this.expire(offer); this.match(); return this.view(playerId); }
    if (accept) {
      offer.accepted.add(playerId);
      if (offer.accepted.has(offer.a) && offer.accepted.has(offer.b)) this.finalize(offer);
      else { this.touch(offer.a); this.touch(offer.b); }
      return this.view(playerId);
    }
    this.decline(offer, playerId);
    this.match();
    return this.view(playerId);
  }

  /** A sala da fila fechou antes de começar porque o outro saiu: quem ficou volta ao lugar que tinha (se a partida foi achada há pouco e se ainda está
   *  com o app aberto — sem o canal da fila conectado, voltaria como um fantasma que outra pessoa receberia como proposta). */
  requeue(player: PlayerInput) {
    const entry = this.matched.get(player.id);
    this.matched.delete(player.id);
    if (!entry || this.tickets.has(player.id)) return;
    if ((this.presence.get(player.id)?.connections ?? 0) === 0) { this.touch(player.id); return; }
    this.tickets.set(player.id, { ...entry.ticket, player, offer: null });
    this.notify(player.id, "opponent-left");
    this.notifyWaiting(player.id);
    this.match();
  }

  /** Esquece a sala achada (o jogador saiu dela por conta própria): a visão volta a "idle". */
  forgetMatch(playerId: string) {
    if (this.matched.delete(playerId)) this.touch(playerId);
  }

  // ---- Presença (o canal SSE do jogador, /me/events) ----
  connect(playerId: string) {
    const presence = this.presenceOf(playerId);
    presence.connections += 1;
    presence.awaySince = null;
  }
  disconnect(playerId: string) {
    const presence = this.presence.get(playerId);
    if (!presence) return;
    presence.connections = Math.max(0, presence.connections - 1);
    if (presence.connections === 0) presence.awaySince = this.now();
  }

  /** Avança os relógios (o servidor chama a cada segundo): propostas vencidas, quedas de conexão, buscas velhas e novas propostas de troca. */
  tick() {
    const now = this.now();
    for (const offer of [...this.offers.values()]) if (now >= offer.expiresAt) this.expire(offer);
    for (const ticket of [...this.tickets.values()]) {
      const id = ticket.player.id;
      const presence = this.presence.get(id);
      if (presence && presence.connections === 0 && presence.awaySince !== null && now - presence.awaySince > this.graceMs) this.dropTicket(id, "connection-lost", "opponent-timeout");
      else if (!ticket.offer && now - ticket.since > this.queueTtlMs) this.dropTicket(id, "search-expired", "opponent-timeout");
    }
    for (const [id, entry] of this.matched) if (now - entry.at > this.matchedTtlMs) { this.matched.delete(id); this.touch(id); }
    for (const [key, block] of this.blocks) if (!block.sticky && block.until <= now) this.blocks.delete(key);
    for (const [id, notice] of this.notices) if (now - notice.at > NOTICE_TTL_MS) this.notices.delete(id);
    for (const [id, presence] of this.presence) if (presence.connections === 0 && !this.tickets.has(id) && !this.matched.has(id)) this.presence.delete(id);
    this.match();
  }

  view(playerId: string): PvpQueueView {
    const ticket = this.tickets.get(playerId);
    const offer = ticket?.offer ? this.offers.get(ticket.offer) ?? null : null;
    const matched = ticket ? undefined : this.matched.get(playerId);
    return {
      state: ticket ? (offer ? "offer" : "waiting") : matched ? "matched" : "idle",
      prefs: ticket ? { ...ticket.prefs } : null,
      since: ticket?.since ?? null,
      serverNow: this.now(),
      waiting: this.tickets.size,
      offer: offer && ticket ? this.offerView(offer, ticket) : null,
      room: matched?.room ?? null,
      notice: this.notices.get(playerId) ?? null,
      rev: this.revs.get(playerId) ?? 0,
    };
  }

  // ---- Internos ----
  private presenceOf(playerId: string): Presence {
    let presence = this.presence.get(playerId);
    if (!presence) { presence = { connections: 0, awaySince: null }; this.presence.set(playerId, presence); }
    return presence;
  }
  private touch(playerId: string) {
    this.revs.set(playerId, (this.revs.get(playerId) ?? 0) + 1);
    this.onChange(playerId);
  }
  private notify(playerId: string, kind: PvpQueueNoticeKind) {
    this.notices.set(playerId, { kind, at: this.now() });
    this.touch(playerId);
  }
  /** O número de pessoas na fila mudou: todo mundo que está nela recebe a visão nova. */
  private notifyWaiting(except?: string) {
    for (const id of this.tickets.keys()) if (id !== except) this.touch(id);
  }

  private blocked(x: string, y: string, now: number) {
    const block = this.blocks.get(pairKey(x, y));
    return Boolean(block && (block.sticky || block.until > now));
  }
  private block(x: string, y: string, until: number, sticky: boolean) {
    const key = pairKey(x, y);
    const current = this.blocks.get(key);
    this.blocks.set(key, { until: Math.max(until, current?.until ?? 0), sticky: sticky || Boolean(current?.sticky) });
  }
  /** Bloqueio "até alguém sair da fila" (os dois recusaram trocar) cai quando um dos dois sai ou muda o que busca. */
  private unblockSticky(playerId: string) {
    for (const [key, block] of this.blocks) {
      if (!block.sticky || !key.split("|").includes(playerId)) continue;
      if (block.until > this.now()) this.blocks.set(key, { until: block.until, sticky: false });
      else this.blocks.delete(key);
    }
  }

  private newOfferId() {
    let id = "";
    do { id = Array.from({ length: 12 }, () => ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)]).join(""); } while (this.offers.has(id));
    return id;
  }
  private openOffer(aId: string, bId: string, setup: QueuePrefs, attempt: 0 | 1) {
    const a = this.tickets.get(aId), b = this.tickets.get(bId);
    if (!a || !b || a.offer || b.offer) return;
    const id = this.newOfferId();
    this.offers.set(id, { id, a: aId, b: bId, setup: { ...setup }, attempt, accepted: new Set(), expiresAt: this.now() + this.offerTtlMs });
    a.offer = id;
    b.offer = id;
    this.touch(aId);
    this.touch(bId);
  }
  private closeOffer(offer: Offer) {
    this.offers.delete(offer.id);
    for (const id of [offer.a, offer.b]) { const ticket = this.tickets.get(id); if (ticket?.offer === offer.id) ticket.offer = null; }
  }
  private otherOf(offer: Offer, playerId: string) { return playerId === offer.a ? offer.b : offer.a; }
  /** Nesta proposta, o jogador está sendo convidado a TROCAR (a escada ou o modo da proposta não é o que ele buscou). */
  private isSwitching(offer: Offer, playerId: string) {
    const ticket = this.tickets.get(playerId);
    return Boolean(ticket && !samePrefs(ticket.prefs, offer.setup));
  }

  /** Tira um pedido da fila. Se havia proposta aberta, ela acaba e o outro volta ao lugar que tinha, com `otherNotice`. */
  private dropTicket(playerId: string, ownNotice: PvpQueueNoticeKind | null, otherNotice: PvpQueueNoticeKind) {
    const ticket = this.tickets.get(playerId);
    if (!ticket) return;
    const offer = ticket.offer ? this.offers.get(ticket.offer) : undefined;
    if (offer) {
      this.closeOffer(offer);
      this.block(offer.a, offer.b, this.now() + this.cooldownMs, false);
      this.notify(this.otherOf(offer, playerId), otherNotice);
    }
    this.tickets.delete(playerId);
    this.unblockSticky(playerId);
    if (ownNotice) this.notify(playerId, ownNotice);
    else this.touch(playerId);
    this.notifyWaiting(playerId);
  }

  private decline(offer: Offer, playerId: string) {
    if (!this.isSwitching(offer, playerId)) {
      // recusou exatamente o que pediu: sai da fila (precisa buscar de novo); o outro volta ao lugar que tinha
      this.dropTicket(playerId, null, "opponent-declined");
      return;
    }
    // recusou TROCAR: continua na fila, sem castigo
    this.closeOffer(offer);
    const other = this.otherOf(offer, playerId);
    if (offer.attempt === 0) {
      // o inverso: vale o que o mais novo pediu, e agora é o mais antigo quem decide se troca
      const newer = this.tickets.get(offer.b);
      if (newer) this.openOffer(offer.a, offer.b, newer.prefs, 1);
      return;
    }
    // nenhum dos dois quis trocar: este par não é oferecido de novo até um deles sair da fila (ou mudar o que busca)
    this.block(offer.a, offer.b, 0, true);
    this.notify(other, "switch-declined");
    this.touch(playerId);
  }

  private expire(offer: Offer) {
    this.closeOffer(offer);
    this.block(offer.a, offer.b, this.now() + this.cooldownMs, false);
    const silent = [offer.a, offer.b].filter((id) => !offer.accepted.has(id));
    const answered = [offer.a, offer.b].filter((id) => offer.accepted.has(id));
    // quem não respondeu provavelmente largou o aparelho: sai da fila; quem aceitou volta ao lugar que tinha
    for (const id of silent) this.dropTicket(id, "you-timeout", "opponent-timeout");
    for (const id of answered) this.notify(id, "opponent-timeout");
  }

  private finalize(offer: Offer) {
    const a = this.tickets.get(offer.a), b = this.tickets.get(offer.b);
    this.closeOffer(offer);
    if (!a || !b) return;
    let code: string;
    try { code = this.rooms.createMatchedRoom(a.player, b.player, offer.setup); }
    catch (error) {
      // sem sala (servidor cheio): os dois continuam no lugar que tinham, e o mesmo par espera um pouco antes de outra proposta
      console.error("[pvp] a fila não conseguiu criar a sala:", error);
      this.block(offer.a, offer.b, this.now() + this.cooldownMs, false);
      this.touch(offer.a);
      this.touch(offer.b);
      return;
    }
    const now = this.now();
    for (const ticket of [a, b]) {
      const id = ticket.player.id;
      this.tickets.delete(id);
      this.unblockSticky(id);
      this.notices.delete(id);
      this.matched.set(id, { room: code, at: now, ticket: { ...ticket, offer: null } });
      this.touch(id);
    }
    this.notifyWaiting();
  }

  private match() {
    const now = this.now();
    const waiting = [...this.tickets.values()].filter((ticket) => !ticket.offer).sort((x, y) => x.order - y.order);
    const taken = new Set<string>();
    const free = (ticket: Ticket) => !taken.has(ticket.player.id);
    // 1) par exato, na ordem de chegada
    for (const a of waiting) {
      if (!free(a)) continue;
      const b = waiting.find((other) => other !== a && free(other) && samePrefs(a.prefs, other.prefs) && !this.blocked(a.player.id, other.player.id, now));
      if (!b) continue;
      const [older, newer] = a.order < b.order ? [a, b] : [b, a];
      taken.add(a.player.id);
      taken.add(b.player.id);
      this.openOffer(older.player.id, newer.player.id, older.prefs, 0);
    }
    // 2) proposta de troca entre quem sobrou: o mais novo do par já esperou CROSS_DELAY_MS por um par exato; vale primeiro o que o mais antigo pediu
    for (const a of waiting) {
      if (!free(a)) continue;
      const b = waiting.find((other) => other.order > a.order && free(other) && now - other.since >= this.crossDelayMs && !this.blocked(a.player.id, other.player.id, now));
      if (!b) continue;
      taken.add(a.player.id);
      taken.add(b.player.id);
      this.openOffer(a.player.id, b.player.id, a.prefs, 0);
    }
  }

  private offerView(offer: Offer, mine: Ticket): PvpOfferView {
    const otherId = this.otherOf(offer, mine.player.id);
    const other = this.tickets.get(otherId);
    return {
      id: offer.id, ladder: offer.setup.ladder, mode: offer.setup.mode,
      switchLadder: mine.prefs.ladder !== offer.setup.ladder, switchMode: mine.prefs.mode !== offer.setup.mode,
      opponent: { name: other?.player.name ?? "", rating: other?.player.rating ?? 0 },
      expiresAt: offer.expiresAt, youAccepted: offer.accepted.has(mine.player.id), opponentAccepted: offer.accepted.has(otherId),
    };
  }
}
