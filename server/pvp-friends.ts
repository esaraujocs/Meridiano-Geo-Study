// Amizades do duelo entre pessoas: pedidos e amigos, por id do aparelho (quem aparece para os outros é o código de amigo, ver pvp-players.ts). Só estado,
// com o relógio por parâmetro (testável), e um arquivo opcional (.pvp-data/friends.json): { version: 1, friends: [[a, b, since]], requests: [[from, to, at]] }.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FRIENDS_MAX, PENDING_MAX, type FriendshipState } from "../src/domain/pvp-social.js";

export const FRIENDS_FILE_VERSION = 1;
export type FriendRequestResult = "sent" | "accepted" | "already" | "self" | "full";

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class FriendGraph {
  /** Amizades: a chave é o par ordenado, o valor, desde quando. */
  private links = new Map<string, number>();
  private friendsOf = new Map<string, Set<string>>();
  /** Pedidos pendentes: para quem → (de quem → quando). */
  private incoming = new Map<string, Map<string, number>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private file: string | null = null, private now: () => number = Date.now) {
    if (!file || !existsSync(file)) return;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { friends?: unknown; requests?: unknown };
      for (const item of Array.isArray(raw.friends) ? raw.friends : []) {
        if (Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string" && item[0] !== item[1]) this.addLink(item[0], item[1], Number(item[2]) || this.now());
      }
      for (const item of Array.isArray(raw.requests) ? raw.requests : []) {
        if (Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string" && item[0] !== item[1] && !this.areFriends(item[0], item[1])) this.addRequest(item[0], item[1], Number(item[2]) || this.now());
      }
    } catch (error) {
      // Arquivo ilegível: guardado ao lado (nunca sobrescrito), o servidor começa sem amizades.
      const aside = `${file}.ilegivel-${this.now()}.json`;
      try { renameSync(file, aside); console.error(`[pvp] friends.json ilegível; guardado em ${aside}:`, error); } catch { /* sem permissão */ }
    }
  }

  areFriends(a: string, b: string) { return this.links.has(pairKey(a, b)); }
  hasRequest(from: string, to: string) { return this.incoming.get(to)?.has(from) ?? false; }

  state(me: string, other: string): FriendshipState {
    if (me === other) return "self";
    if (this.areFriends(me, other)) return "friends";
    if (this.hasRequest(other, me)) return "incoming";
    if (this.hasRequest(me, other)) return "outgoing";
    return "none";
  }

  /** Pede amizade. Se o outro já tinha pedido, vira amizade na hora ("accepted"). */
  request(from: string, to: string): FriendRequestResult {
    if (from === to) return "self";
    if (this.areFriends(from, to)) return "already";
    if (this.hasRequest(to, from)) { this.makeFriends(from, to); return "accepted"; }
    if (this.hasRequest(from, to)) return "sent";
    if ((this.friendsOf.get(from)?.size ?? 0) >= FRIENDS_MAX || (this.incoming.get(to)?.size ?? 0) >= PENDING_MAX || this.outgoingOf(from).length >= PENDING_MAX) return "full";
    this.addRequest(from, to, this.now());
    this.scheduleSave();
    return "sent";
  }

  /** Responde a um pedido recebido. Devolve se havia pedido. */
  respond(me: string, from: string, accept: boolean): boolean {
    if (!this.hasRequest(from, me)) return false;
    if (accept) this.makeFriends(me, from);
    else { this.dropRequest(from, me); this.scheduleSave(); }
    return true;
  }

  /** Desfaz a amizade ou cancela um pedido (enviado ou recebido). */
  remove(me: string, other: string): boolean {
    const had = this.areFriends(me, other) || this.hasRequest(me, other) || this.hasRequest(other, me);
    this.dropLink(me, other);
    this.dropRequest(me, other);
    this.dropRequest(other, me);
    if (had) this.scheduleSave();
    return had;
  }

  /** Amizade direta (aceitar um convite de duelo por link). Devolve se é nova. */
  link(a: string, b: string): boolean {
    if (a === b || this.areFriends(a, b)) return false;
    if ((this.friendsOf.get(a)?.size ?? 0) >= FRIENDS_MAX || (this.friendsOf.get(b)?.size ?? 0) >= FRIENDS_MAX) return false;
    this.makeFriends(a, b);
    return true;
  }

  /** Amigos, pedidos recebidos e enviados, do mais novo para o mais velho, com a data. */
  list(me: string) {
    const byNewest = (items: [string, number][]) => items.sort((x, y) => y[1] - x[1]).map(([id, since]) => ({ id, since }));
    return {
      friends: byNewest([...(this.friendsOf.get(me) ?? [])].map((id) => [id, this.links.get(pairKey(me, id)) ?? 0])),
      incoming: byNewest([...(this.incoming.get(me) ?? new Map<string, number>()).entries()]),
      outgoing: byNewest(this.outgoingOf(me)),
    };
  }

  flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const friends = [...this.links.entries()].map(([key, since]) => [...key.split("|"), since]);
    const requests: [string, string, number][] = [];
    for (const [to, from] of this.incoming) for (const [id, at] of from) requests.push([id, to, at]);
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: FRIENDS_FILE_VERSION, friends, requests }), "utf8");
    renameSync(temporary, this.file);
  }

  private outgoingOf(me: string): [string, number][] {
    const out: [string, number][] = [];
    for (const [to, from] of this.incoming) { const at = from.get(me); if (at !== undefined) out.push([to, at]); }
    return out;
  }
  private makeFriends(a: string, b: string) {
    this.dropRequest(a, b);
    this.dropRequest(b, a);
    this.addLink(a, b, this.now());
    this.scheduleSave();
  }
  private addLink(a: string, b: string, since: number) {
    this.links.set(pairKey(a, b), since);
    for (const [x, y] of [[a, b], [b, a]]) { if (!this.friendsOf.has(x)) this.friendsOf.set(x, new Set()); this.friendsOf.get(x)?.add(y); }
  }
  private dropLink(a: string, b: string) {
    this.links.delete(pairKey(a, b));
    this.friendsOf.get(a)?.delete(b);
    this.friendsOf.get(b)?.delete(a);
  }
  private addRequest(from: string, to: string, at: number) {
    if (!this.incoming.has(to)) this.incoming.set(to, new Map());
    this.incoming.get(to)?.set(from, at);
  }
  private dropRequest(from: string, to: string) {
    const map = this.incoming.get(to);
    if (!map) return;
    map.delete(from);
    if (map.size === 0) this.incoming.delete(to);
  }
  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* disco cheio ou sem permissão: segue na memória */ } }, 1000);
    this.saveTimer.unref?.();
  }
}
