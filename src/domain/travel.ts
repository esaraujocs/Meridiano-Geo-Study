// Travel no estilo do Travle (21/10/2026, pedido do Enzo: "seguir os contornos dos países de A a B, não uma linha fixa"; regras conferidas em
// travle.earth/extra_info). Qualquer caminho vale: a pessoa chuta países em qualquer ordem e vence quando os chutes ligam a origem ao destino por
// fronteiras terrestres. Cada chute ganha uma cor pela distância que ainda falta, e o número de chutes é o mínimo da rota mais uma folga.
// Regras puras, sem mapa nem tela (test:travel).
import type { Legacy } from "./types";

type Meta = Legacy["meta"];
export type TravelGraph = ReadonlyMap<string, ReadonlySet<string>>;

/** Ligações além das fronteiras do catálogo: pontes e túneis que o Travle aceita (o Eurotúnel, Øresund, a ponte de Singapura) e as fronteiras
 *  por exclave que o catálogo não tem. Exclave conta (decisão do Enzo, 21/10/2026: vale o que o mapa pinta como o mesmo país): Kaliningrado liga
 *  a Rússia à Polônia (e à Lituânia, que o catálogo já tinha), Ceuta e Melilla ligam a Espanha ao Marrocos; Nakhchivan (Turquia–Azerbaijão) e
 *  Cabinda (Angola–Congo) já estavam no catálogo. Território de ultramar que o mapa pinta à parte (a Guiana Francesa) não liga o país-mãe. */
export const TRAVEL_LINKS: ReadonlyArray<readonly [string, string]> = [["FRA", "GBR"], ["DNK", "SWE"], ["MYS", "SGP"], ["POL", "RUS"], ["ESP", "MAR"]];
/** O Saara Ocidental entra (como no Travle: é ele que separa o Marrocos da Mauritânia), fora do filtro "Só países". */
export const TRAVEL_EXTRA_IDS: readonly string[] = ["732"];

/** Os países do Travel: os do filtro de países (as nações do Reino Unido viram o Reino Unido), sem absorvidos. */
export function travelPool(meta: Meta, onlyCountries = false): string[] {
  return Object.keys(meta).filter((id) => {
    const item = meta[id] as Meta[string] & { absorvido?: boolean; substitui?: string; soBandeira?: boolean };
    if (!item || item.absorvido || item.substitui || item.soBandeira) return false;
    return Boolean(item.un) || id === "336" || (!onlyCountries && TRAVEL_EXTRA_IDS.includes(id));
  }).sort();
}

/** As peças do mapa que pintam um país (o Reino Unido não tem polígono próprio: são as quatro nações). */
export function travelFeatureIds(meta: Meta, id: string): string[] {
  const cca3 = meta[id]?.cca3;
  const parts = cca3 ? Object.keys(meta).filter((other) => (meta[other] as { substitui?: string }).substitui === cca3) : [];
  return parts.length ? parts : [id];
}

/** Vizinhança simétrica entre os países dados (fronteiras do catálogo + TRAVEL_LINKS). */
export function travelGraph(meta: Meta, ids: readonly string[]): Map<string, Set<string>> {
  const byCca3 = new Map<string, string>();
  for (const id of ids) { const cca3 = meta[id]?.cca3; if (cca3) byCca3.set(cca3.toUpperCase(), id); }
  const graph = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const link = (a: string | undefined, b: string | undefined) => {
    if (!a || !b || a === b || !graph.has(a) || !graph.has(b)) return;
    graph.get(a)!.add(b); graph.get(b)!.add(a);
  };
  for (const id of ids) for (const border of meta[id]?.borders ?? []) link(id, byCca3.get(String(border).toUpperCase()));
  for (const [a, b] of TRAVEL_LINKS) link(byCca3.get(a), byCca3.get(b));
  return graph;
}

/** Distância (em fronteiras cruzadas) de um país a todos os que se alcançam por terra. */
export function distancesFrom(graph: TravelGraph, from: string): Map<string, number> {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (let at = 0; at < queue.length; at++) {
    const node = queue[at];
    for (const next of graph.get(node) ?? []) if (!dist.has(next)) { dist.set(next, dist.get(node)! + 1); queue.push(next); }
  }
  return dist;
}

/** O caminho que liga a origem ao destino somando o mínimo de países novos (os já chutados valem de graça): busca 0-1 pelos vértices.
 *  Devolve o caminho inteiro (origem e destino inclusos) ou null se não há caminho por terra. */
export function bestRoute(graph: TravelGraph, start: string, end: string, have: ReadonlySet<string> = new Set()): string[] | null {
  const cost = new Map([[start, 0]]);
  const parent = new Map<string, string>();
  const deque: string[] = [start];
  while (deque.length) {
    const node = deque.shift()!;
    if (node === end) break;
    for (const next of [...(graph.get(node) ?? [])].sort()) {
      const step = next === end || have.has(next) ? 0 : 1;
      const total = cost.get(node)! + step;
      if (total < (cost.get(next) ?? Infinity)) {
        cost.set(next, total); parent.set(next, node);
        if (step === 0) deque.unshift(next); else deque.push(next);
      }
    }
  }
  if (!cost.has(end)) return null;
  const path = [end];
  while (path[0] !== start) path.unshift(parent.get(path[0])!);
  return path;
}

/** Quantos países ainda faltam chutar, no mínimo, para ligar a origem ao destino (Infinity sem caminho). */
export function remainingCost(graph: TravelGraph, start: string, end: string, have: ReadonlySet<string>): number {
  const path = bestRoute(graph, start, end, have);
  return path ? path.slice(1, -1).filter((id) => !have.has(id)).length : Infinity;
}

/** Os países ligados à origem pelos chutes (a origem inclusa). */
export function linkedToStart(graph: TravelGraph, start: string, have: ReadonlySet<string>): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) for (const next of graph.get(queue[at]) ?? []) {
    if (have.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}

/** Venceu: os chutes formam uma cadeia de vizinhos da origem ao destino. */
export function routeClosed(graph: TravelGraph, start: string, end: string, have: ReadonlySet<string>): boolean {
  const linked = linkedToStart(graph, start, have);
  return [...(graph.get(end) ?? [])].some((id) => linked.has(id));
}

/** A cor do chute, como no Travle: `linked` (verde com ✓: encurta e já está ligado à origem), `closer` (verde: encurta o que falta), `near`
 *  (laranja: um caminho por ele tem no máximo 1 país a mais que o mais curto) e `far` (vermelho: longe ou sem caminho por terra). */
export type TravelGrade = "linked" | "closer" | "near" | "far";
export type TravelPuzzle = {
  start: string; end: string;
  /** Países no meio do caminho mais curto (o mínimo de chutes). */
  shortest: number;
  /** Chutes permitidos (`shortest` + a folga do Travle). */
  budget: number;
};

export function gradeGuess(graph: TravelGraph, puzzle: TravelPuzzle, before: ReadonlySet<string>, guess: string): TravelGrade {
  const after = new Set(before).add(guess);
  if (remainingCost(graph, puzzle.start, puzzle.end, after) < remainingCost(graph, puzzle.start, puzzle.end, before)) {
    return linkedToStart(graph, puzzle.start, after).has(guess) ? "linked" : "closer";
  }
  const fromStart = distancesFrom(graph, puzzle.start).get(guess);
  const toEnd = distancesFrom(graph, puzzle.end).get(guess);
  if (fromStart !== undefined && toEnd !== undefined && fromStart + toEnd - 1 <= puzzle.shortest + 1) return "near";
  return "far";
}

/** Os níveis (decisão do Enzo, 21/10/2026: "qualquer ordem fica bagunçado, a não ser que tenha níveis com a tolerância diminuindo"):
 *  `livre` qualquer ordem (o Travle); `trilha` cada chute tem de encostar na cadeia que sai da origem (pode ramificar); `exata` ("Em ordem")
 *  cada chute continua do último país aceito, uma linha só. Desvio vale, só custa chute (o Enzo: "Bulgária → Grécia → Turquia… usaria um país
 *  a mais, mas era ok"; até 21/10/2026 a `exata` só aceitava o caminho mais curto). Chute que o nível não aceita gasta um chute e não entra no mapa. */
export type TravelLevel = "livre" | "trilha" | "exata";
export const TRAVEL_LEVELS: readonly TravelLevel[] = ["livre", "trilha", "exata"];
export const DEFAULT_TRAVEL_LEVEL: TravelLevel = "trilha";
export const isTravelLevel = (value: unknown): value is TravelLevel => TRAVEL_LEVELS.includes(value as TravelLevel);
const TRAVEL_LEVEL_KEY = "carta-travel-level";
/** O nível escolhido na Mesa (guardado no navegador, como o sentido das bandeiras). */
export function readTravelLevel(): TravelLevel {
  try { const saved = localStorage.getItem(TRAVEL_LEVEL_KEY); return isTravelLevel(saved) ? saved : DEFAULT_TRAVEL_LEVEL; } catch { return DEFAULT_TRAVEL_LEVEL; }
}
export function saveTravelLevel(level: TravelLevel) {
  try { localStorage.setItem(TRAVEL_LEVEL_KEY, level); } catch { /* sem armazenamento */ }
}
/** A folga de cada nível e o que ele paga, para a Mesa. */
export const TRAVEL_LEVEL_EXTRA: Record<TravelLevel, string> = { livre: "4–6", trilha: "2–3", exata: "1" };
/** Quanto cada nível paga a mais. */
export const TRAVEL_LEVEL_COINS: Record<TravelLevel, number> = { livre: 1, trilha: 1.25, exata: 1.5 };

/** A folga sobre o mínimo de chutes. Livre, a do Travle: 3 → +4, 4–6 → +5, 7–9 → +6, 10–12 → +7, 13 ou mais → +8 (rotas curtas também +4);
 *  Trilha, +2 até 3 países e +3 acima; Em ordem, +1. */
export const travelExtra = (shortest: number, level: TravelLevel = "livre") =>
  level === "exata" ? 1 : level === "trilha" ? (shortest <= 3 ? 2 : 3) : shortest <= 3 ? 4 : shortest <= 6 ? 5 : shortest <= 9 ? 6 : shortest <= 12 ? 7 : 8;
export const travelBudget = (shortest: number, level: TravelLevel = "livre") => shortest + travelExtra(shortest, level);

/** O nível aceita o chute? `tip`: em "Em ordem", o último país aceito (ou a origem). */
export function guessAllowed(graph: TravelGraph, puzzle: TravelPuzzle, have: ReadonlySet<string>, guess: string, level: TravelLevel, tip = puzzle.start): boolean {
  if (level === "livre") return true;
  const near = graph.get(guess) ?? new Set<string>();
  if (level === "trilha") return [...linkedToStart(graph, puzzle.start, have)].some((id) => near.has(id));
  return near.has(tip);
}

/** Rotas de 3 a 8 países ao todo (decisão do Enzo, "misturadas"): de 2 a 7 fronteiras entre origem e destino, com as do meio mais frequentes. */
export const TRAVEL_HOPS: ReadonlyArray<readonly [number, number]> = [[2, 1], [3, 2], [4, 2], [5, 2], [6, 1], [7, 1]];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Os destinos que têm alguma origem a 2–7 fronteiras (os que dão rota). */
export function travelDestinations(graph: TravelGraph): string[] {
  return [...graph.keys()].filter((id) => [...distancesFrom(graph, id).values()].some((d) => d >= 2 && d <= 7)).sort();
}

/** A rota de um destino: a distância sorteada entre as que existem (pelos pesos de TRAVEL_HOPS) e a origem entre os países a essa distância. */
export function travelPuzzle(graph: TravelGraph, end: string, seed: number | string, level: TravelLevel = "livre"): TravelPuzzle | null {
  const byHops = new Map<number, string[]>();
  for (const [id, d] of distancesFrom(graph, end)) if (d >= 2 && d <= 7) (byHops.get(d) ?? byHops.set(d, []).get(d)!).push(id);
  const options = TRAVEL_HOPS.filter(([hops]) => byHops.has(hops));
  if (!options.length) return null;
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = hash(`${seed}:${end}:hops`) % total;
  const hops = options.find(([, weight]) => (pick -= weight) < 0)![0];
  const starts = byHops.get(hops)!.sort();
  const start = starts[hash(`${seed}:${end}:start`) % starts.length];
  return { start, end, shortest: hops - 1, budget: travelBudget(hops - 1, level) };
}

/** Quanto a rota vale nas moedas (o `weight` da rodada: países da rota mais curta × o nível). Fechada no mínimo vale a rota inteira; cada chute
 *  a mais tira 10%, até a metade. Rota não fechada não paga. As pistas são suprimentos (a rodada fica assistida e paga metade, spoils.ts). */
export const TRAVEL_WASTE_STEP = 0.1;
export function travelWeight(puzzle: TravelPuzzle, used: number, closed: boolean, level: TravelLevel = "livre"): number {
  if (!closed) return 0;
  const waste = Math.max(0, used - puzzle.shortest);
  return Math.round(puzzle.shortest * Math.max(0.5, 1 - TRAVEL_WASTE_STEP * waste) * TRAVEL_LEVEL_COINS[level] * 100) / 100;
}

/** As iniciais dos países que ainda faltam no caminho mais curto (a pista "Iniciais"). */
export function remainingRoute(graph: TravelGraph, puzzle: TravelPuzzle, have: ReadonlySet<string>): string[] {
  return (bestRoute(graph, puzzle.start, puzzle.end, have) ?? []).slice(1, -1).filter((id) => !have.has(id));
}
