// Suprimentos de expedição: consumíveis comprados na Loja, usados durante uma rodada (em Partida e em Treino, nunca no duelo — quem chama garante
// isso; a Ampulheta só vale com cronômetro). Regras puras, sem IndexedDB (o estoque mora em supplies-store.ts).
import type { AnyQuizVariant } from "./types";

export type SupplyId = "ampulheta" | "bussola" | "lupa";
export const SUPPLY_IDS: readonly SupplyId[] = ["ampulheta", "bussola", "lupa"];

/** Preço por unidade (chute inicial, a calibrar jogando — mesmo espírito dos outros números da economia). */
export const SUPPLY_COST: Record<SupplyId, number> = { ampulheta: 150, bussola: 250, lupa: 400 };

/** Quantas opções erradas a Lupa tira (de 4, sobram 2: a certa e mais 1). */
export const LUPA_REMOVE_COUNT = 2;
/** Quantos segundos a Ampulheta soma ao cronômetro da rodada atual. */
export const AMPULHETA_BONUS_SECONDS = 5;

// A Lupa só faz sentido em modos de alternativas (tira 2 erradas); a Bússola só em modos de clicar no mapa (mostra o continente do alvo).
// A Ampulheta serve em qualquer modo com cronômetro (`timed`) — não precisa de lista própria — e não faz nada no Treino, que não tem cronômetro.
const OPTION_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set([
  "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta-opcoes", "nome-historica", "historica-nome", "idioma-nome", "idioma-pais",
]);
const MAP_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set(["mapa", "capital-pais"]);

/** Se o suprimento `id` faz sentido no modo `variant` — controla quais botões aparecem em cada motor de partida. */
export function supplyApplies(id: SupplyId, variant: AnyQuizVariant, timed = true): boolean {
  if (id === "lupa") return OPTION_VARIANTS.has(variant);
  if (id === "bussola") return MAP_VARIANTS.has(variant);
  return timed;
}

export type SupplyCounts = Record<SupplyId, number>;
export const emptySupplyCounts = (): SupplyCounts => ({ ampulheta: 0, bussola: 0, lupa: 0 });

/** Os suprimentos que fazem sentido no modo `variant` e que a pessoa tem pelo menos 1 (o que a bandeja de jogo mostra). */
export function usableSupplies(counts: SupplyCounts, variant: AnyQuizVariant, timed = true): SupplyId[] {
  return SUPPLY_IDS.filter((id) => counts[id] > 0 && supplyApplies(id, variant, timed));
}
