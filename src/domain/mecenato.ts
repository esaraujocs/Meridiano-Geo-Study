// Mecenato v2 (04/10/2026): o Museu Meridiano financia EXPEDIÇÕES. Cada uma leva horas de verdade (e anda mais rápido quando a pessoa joga a região dela) e,
// na volta, traz uma peça histórica para o Acervo e o ITEM que essa peça libera nas partidas (estilo de mapa, moldura do nível…), mais achados extras
// (suprimentos e parte das moedas de volta). Regras puras: preços, tempos, aceleração, baú de bordo, lugares no porto, Patronato e o estado de cada rota.
// O armazenamento (IndexedDB) fica em mecenato-store.ts; as peças e os textos delas em museum.ts.
import { SUPPLY_IDS, type SupplyId } from "./supplies.js";

export type RouteId = "velho" | "indias" | "cima" | "monstros" | "bandeiras" | "brasil";
/** Quanto o item da rota aparece no jogo: "cena" muda o mapa inteiro, "toque" é um detalhe da rodada, "duelo" é o que o adversário vê. */
export type RouteWeight = "cena" | "toque" | "duelo";
export type ItemSlot = "map-style" | "level-frame";
export type ItemId = "estilo-1507" | "moldura-teatro" | "estilo-navegante" | "estilo-iluminura";
export type Stage = { piece: string; item: ItemId };
export type RouteDef = {
  id: RouteId;
  weight: RouteWeight;
  /** Rota aberta (com peças e itens prontos). As fechadas aparecem como "em preparo". */
  open: boolean;
  /** Que acertos aceleram a viagem: família e variante do modo, e continente do país (o `reg` do catálogo). */
  accel: { families: readonly string[]; variants?: readonly string[]; regions: readonly string[] | "all" };
  stages: readonly Stage[];
};

/** Preço de cada etapa (é o preço do item: paga-se uma vez, ao zarpar). Calibrado em 04/10 para ~9 mi no Mecenato inteiro, 60% nas rotas. */
export const STAGE_COSTS: Record<RouteWeight, readonly number[]> = {
  cena: [60_000, 150_000, 300_000, 540_000],
  toque: [40_000, 100_000, 200_000, 360_000],
  duelo: [50_000, 120_000, 250_000, 450_000],
};
/** Duração de cada etapa, em horas de relógio (antes da aceleração). */
export const STAGE_HOURS: readonly number[] = [2, 6, 12, 24];
const HOUR = 3_600_000;

export const ROUTES: readonly RouteDef[] = [
  {
    id: "velho", weight: "cena", open: true,
    accel: { families: ["mapa"], variants: ["mapa"], regions: ["Europe"] },
    stages: [
      { piece: "waldseemuller-1507", item: "estilo-1507" },
      { piece: "ortelius-1570", item: "moldura-teatro" },
      { piece: "mercator-1569", item: "estilo-navegante" },
      { piece: "fra-mauro-1450", item: "estilo-iluminura" },
    ],
  },
  { id: "indias", weight: "toque", open: false, accel: { families: ["mapa", "capitais"], regions: ["Asia", "Africa"] }, stages: [] },
  { id: "cima", weight: "cena", open: false, accel: { families: ["mapa", "bandeiras", "capitais"], regions: "all" }, stages: [] },
  { id: "monstros", weight: "cena", open: false, accel: { families: ["mapa"], regions: ["Oceania", "Americas"] }, stages: [] },
  { id: "bandeiras", weight: "toque", open: false, accel: { families: ["bandeiras"], regions: "all" }, stages: [] },
  { id: "brasil", weight: "duelo", open: false, accel: { families: ["mapa", "bandeiras", "capitais"], regions: ["Americas"] }, stages: [] },
];
export const routeById = (id: string) => ROUTES.find((route) => route.id === id);

/** Os itens que as peças liberam: em que espaço do Equipamento entram. */
export const ITEMS: Record<ItemId, { slot: ItemSlot; route: RouteId; stage: number }> = {
  "estilo-1507": { slot: "map-style", route: "velho", stage: 0 },
  "moldura-teatro": { slot: "level-frame", route: "velho", stage: 1 },
  "estilo-navegante": { slot: "map-style", route: "velho", stage: 2 },
  "estilo-iluminura": { slot: "map-style", route: "velho", stage: 3 },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItemId = (value: unknown): value is ItemId => typeof value === "string" && value in ITEMS;
export const itemsOfSlot = (slot: ItemSlot) => ITEM_IDS.filter((id) => ITEMS[id].slot === slot);
/** O item é da pessoa quando a peça que o libera está no Acervo (então quem já tinha a peça do Museu antigo já tem o item). */
export const itemPiece = (id: ItemId) => routeById(ITEMS[id].route)!.stages[ITEMS[id].stage].piece;
export const itemOwned = (id: ItemId, ownedPieces: ReadonlySet<string>) => ownedPieces.has(itemPiece(id));

export const stageCost = (route: RouteDef, stage: number) => STAGE_COSTS[route.weight][stage] ?? 0;
export const stageDurationMs = (stage: number) => (STAGE_HOURS[stage] ?? 0) * HOUR;
export const expeditionId = (route: RouteId, stage: number) => `${route}-${stage + 1}`;

// ───────── expedições ─────────
/** O que vai para o IndexedDB e viaja com a conta: nunca muda depois de criado (a sincronização junta linhas, a primeira fica). */
export type ExpeditionRecord = { id: string; route: RouteId; stage: number; startedAt: number; durationMs: number; cost: number };
/** O andamento da aceleração (só deste aparelho): quanto já foi cortado da viagem e os pontos do baú de bordo. */
export type ExpeditionProgress = { cutMs: number; chest: number };
export const emptyProgress = (): ExpeditionProgress => ({ cutMs: 0, chest: 0 });

/** No máximo 70% da viagem pode ser cortado jogando: a espera continua existindo (uma etapa de 24 h dura pelo menos 7 h 12 min). */
export const MAX_CUT_SHARE = 0.7;
/** Corte por acerto no começo da viagem; vai caindo (rendimento decrescente) até 25% disso perto do teto. */
export const CUT_PER_HIT_MS = 20_000;
const MIN_CUT_FACTOR = 0.25;
/** Peso do acerto pela dificuldade do país (tier 1 fácil … 3 difícil): repetir um recorte fácil rende menos. */
export const TIER_WEIGHT: Record<number, number> = { 1: 0.6, 2: 1, 3: 1.4 };
/** O Treino conta metade (o duelo e as rodadas com suprimento não contam — quem chama já filtra). */
export const TRAINING_FACTOR = 0.5;

export const maxCutMs = (durationMs: number) => Math.round(durationMs * MAX_CUT_SHARE);
export const remainingMs = (record: ExpeditionRecord, progress: ExpeditionProgress, now: number) =>
  Math.max(0, record.startedAt + record.durationMs - Math.min(progress.cutMs, record.durationMs) - now);
export const isBack = (record: ExpeditionRecord, progress: ExpeditionProgress, now: number) => remainingMs(record, progress, now) <= 0;

/** Um acerto que vale para a expedição: corta a viagem (cada vez menos) e, quando o corte chega ao teto, enche o baú de bordo. */
export function applyHit(record: ExpeditionRecord, progress: ExpeditionProgress, hit: { tier?: number; training?: boolean }): ExpeditionProgress {
  const weight = (TIER_WEIGHT[hit.tier ?? 2] ?? 1) * (hit.training ? TRAINING_FACTOR : 1);
  const cap = maxCutMs(record.durationMs);
  if (progress.cutMs >= cap) return { cutMs: progress.cutMs, chest: progress.chest + weight };
  const factor = Math.max(MIN_CUT_FACTOR, 1 - progress.cutMs / cap);
  return { cutMs: Math.min(cap, progress.cutMs + CUT_PER_HIT_MS * weight * factor), chest: progress.chest };
}

/** Se um acerto (já filtrado: certo, sem suprimento, fora do duelo) acelera esta rota. `reg` é o continente do país no catálogo. */
export function hitMatches(route: RouteDef, hit: { family: string; variant: string; reg?: string }) {
  if (!route.accel.families.includes(hit.family)) return false;
  if (route.accel.variants && !route.accel.variants.includes(hit.variant)) return false;
  return route.accel.regions === "all" || (hit.reg !== undefined && route.accel.regions.includes(hit.reg));
}

// ───────── baú de bordo e achados ─────────
export type ChestTier = "normal" | "farto" | "abundante";
/** Pontos do baú (acertos depois do teto da aceleração) para cada nível. */
export const CHEST_THRESHOLDS: Record<ChestTier, number> = { normal: 0, farto: 150, abundante: 400 };
export const chestTier = (points: number): ChestTier => (points >= CHEST_THRESHOLDS.abundante ? "abundante" : points >= CHEST_THRESHOLDS.farto ? "farto" : "normal");
const CHEST_LOOT: Record<ChestTier, { supplies: number; coinsBack: number }> = {
  normal: { supplies: 2, coinsBack: 0.03 },
  farto: { supplies: 4, coinsBack: 0.06 },
  abundante: { supplies: 6, coinsBack: 0.1 },
};
/** Suprimentos que a expedição pode trazer (os do dia a dia; o Tônico e o Escudo ficam de fora). */
const LOOT_POOL: readonly SupplyId[] = ["ampulheta", "bussola", "letra", "pular", "lupa", "retorno"].filter((id): id is SupplyId => (SUPPLY_IDS as readonly string[]).includes(id));
const hash = (text: string) => { let value = 2166136261; for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; };
export type Loot = { tier: ChestTier; coins: number; supplies: Partial<Record<SupplyId, number>> };
/** Os achados da volta: sempre os mesmos para a mesma expedição e o mesmo nível de baú (não dá para "sortear de novo"). */
export function lootFor(record: ExpeditionRecord, chest: number): Loot {
  const tier = chestTier(chest);
  const plan = CHEST_LOOT[tier];
  const supplies: Partial<Record<SupplyId, number>> = {};
  let seed = hash(record.id);
  for (let index = 0; index < plan.supplies; index += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    const id = LOOT_POOL[seed % LOOT_POOL.length];
    supplies[id] = (supplies[id] ?? 0) + 1;
  }
  return { tier, coins: Math.round(record.cost * plan.coinsBack), supplies };
}

// ───────── Patronato ─────────
export type RankId = "amigo" | "colecionador" | "curador" | "mecenas" | "grande";
export const RANKS: readonly { id: RankId; at: number; roman: string }[] = [
  { id: "amigo", at: 25_000, roman: "I" },
  { id: "colecionador", at: 150_000, roman: "II" },
  { id: "curador", at: 600_000, roman: "III" },
  { id: "mecenas", at: 2_000_000, roman: "IV" },
  { id: "grande", at: 5_000_000, roman: "V" },
];
/** O posto pelo total investido no Mecenato (peças do Museu antigo e expedições): `null` antes do primeiro. */
export const rankFor = (invested: number) => [...RANKS].reverse().find((rank) => invested >= rank.at) ?? null;
export const nextRank = (invested: number) => RANKS.find((rank) => invested < rank.at) ?? null;
/** Lugares no porto (expedições ao mesmo tempo): 1 no começo, 2 a partir de Colecionador, 3 a partir de Curador. */
export function portSlots(invested: number) {
  const rank = rankFor(invested);
  if (!rank || rank.id === "amigo") return 1;
  return rank.id === "colecionador" ? 2 : 3;
}

// ───────── estado de cada rota ─────────
export type StageState = "done" | "running" | "back" | "next" | "locked";
export type MecenatoView = {
  ownedPieces: ReadonlySet<string>;
  expeditions: readonly ExpeditionRecord[];
  landed: ReadonlySet<string>;
  progress: Record<string, ExpeditionProgress>;
  invested: number;
  /** Do investido, o que foi para as peças do Museu antigo (antes das expedições). */
  investedLegacy?: number;
  balance: number;
  now: number;
};
/** Expedições ainda no mar ou esperando o desembarque (as desembarcadas e as de peça já no Acervo saem da conta). */
export const activeExpeditions = (view: MecenatoView) => view.expeditions.filter((record) => {
  const route = routeById(record.route);
  const piece = route?.stages[record.stage]?.piece;
  return !view.landed.has(record.id) && !(piece && view.ownedPieces.has(piece));
});
export function stageStates(route: RouteDef, view: MecenatoView): StageState[] {
  const active = activeExpeditions(view).find((record) => record.route === route.id);
  let nextGiven = false;
  return route.stages.map((stage, index) => {
    if (view.ownedPieces.has(stage.piece)) return "done";
    if (active && active.stage === index) return isBack(active, view.progress[active.id] ?? emptyProgress(), view.now) ? "back" : "running";
    if (!nextGiven && !active) { nextGiven = true; return "next"; }
    return "locked";
  });
}
/** A próxima etapa que dá para mandar nesta rota (a primeira peça que falta), se não houver expedição dela no mar. */
export function nextStage(route: RouteDef, view: MecenatoView): number | null {
  if (!route.open) return null;
  const index = stageStates(route, view).indexOf("next");
  return index >= 0 ? index : null;
}
export type LaunchBlock = "closed" | "complete" | "busy" | "port-full" | "coins";
/** Por que não dá para zarpar agora (ou `null` se dá). */
export function launchBlock(route: RouteDef, view: MecenatoView): LaunchBlock | null {
  if (!route.open) return "closed";
  if (route.stages.every((stage) => view.ownedPieces.has(stage.piece))) return "complete";
  const stage = nextStage(route, view);
  if (stage === null) return "busy";
  if (activeExpeditions(view).length >= portSlots(view.invested)) return "port-full";
  if (view.balance < stageCost(route, stage)) return "coins";
  return null;
}
