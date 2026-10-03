// Suprimentos de expedição: consumíveis comprados na Loja, usados durante uma rodada (em Partida e em Treino, nunca no duelo — quem chama garante
// isso; a Ampulheta só vale com cronômetro). Regras puras, sem IndexedDB (o estoque mora em supplies-store.ts).
import type { AnyQuizVariant } from "./types";

export type SupplyId = "lupa" | "bussola" | "letra" | "pular" | "retorno" | "escudo" | "ampulheta";
/** Na ordem da hotbar e da Loja: primeiro as dicas, depois os que mexem na rodada, o que protege e, por último, o tempo. */
export const SUPPLY_IDS: readonly SupplyId[] = ["lupa", "bussola", "letra", "pular", "retorno", "escudo", "ampulheta"];

/** Os três em destaque na vitrine do Hub e no cartaz da Loja (os sete cabem só na aba Suprimentos). */
export const FEATURED_SUPPLIES: readonly SupplyId[] = ["lupa", "escudo", "retorno"];

/** Preço por unidade (chute inicial, a calibrar jogando — mesmo espírito dos outros números da economia). */
export const SUPPLY_COST: Record<SupplyId, number> = { lupa: 400, bussola: 250, letra: 200, pular: 120, retorno: 300, escudo: 500, ampulheta: 150 };

/** Quantas opções erradas a Lupa tira (de 4, sobram 2: a certa e mais 1). */
export const LUPA_REMOVE_COUNT = 2;
/** Quantos segundos a Ampulheta soma ao cronômetro da rodada atual. */
export const AMPULHETA_BONUS_SECONDS = 5;

/** Suprimentos que ficam "armados": a pessoa liga antes e eles só gastam uma unidade se o erro de fato acontecer (Escudo e Segunda chance).
 *  Os outros agem na hora em que são usados e gastam na hora. */
export const ARMED_SUPPLIES: readonly SupplyId[] = ["retorno", "escudo"];
export const isArmedSupply = (id: SupplyId): boolean => ARMED_SUPPLIES.includes(id);

// A Lupa só faz sentido em modos de alternativas (tira 2 erradas); a Bússola só em modos de clicar no mapa (mostra o continente do alvo); a
// Primeira letra só onde se digita a resposta (escrita e silhueta). A Ampulheta serve em qualquer modo com cronômetro (`timed`) — não faz nada
// no Treino, que não tem cronômetro. Pular e Escudo servem em todos; a Segunda chance em todos menos o Travel (que já tem 10 tentativas por rota).
const OPTION_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set([
  "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta-opcoes", "nome-historica", "historica-nome", "idioma-nome", "idioma-pais",
]);
const MAP_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set(["mapa", "capital-pais"]);
const TYPED_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set(["escrita-pais", "escrita-capital", "silhueta"]);

/** Se o suprimento `id` faz sentido no modo `variant` — controla quais botões aparecem em cada motor de partida. */
export function supplyApplies(id: SupplyId, variant: AnyQuizVariant, timed = true): boolean {
  if (id === "lupa") return OPTION_VARIANTS.has(variant);
  if (id === "bussola") return MAP_VARIANTS.has(variant);
  if (id === "letra") return TYPED_VARIANTS.has(variant);
  if (id === "retorno") return variant !== "travel";
  if (id === "ampulheta") return timed;
  return true;
}

export type SupplyCounts = Record<SupplyId, number>;
export const emptySupplyCounts = (): SupplyCounts => ({ lupa: 0, bussola: 0, letra: 0, pular: 0, retorno: 0, escudo: 0, ampulheta: 0 });

/** Os suprimentos que fazem sentido no modo `variant` e que a pessoa tem pelo menos 1 (o que a bandeja de jogo mostra). */
export function usableSupplies(counts: SupplyCounts, variant: AnyQuizVariant, timed = true): SupplyId[] {
  return SUPPLY_IDS.filter((id) => counts[id] > 0 && supplyApplies(id, variant, timed));
}

/** A "região" que a Bússola mostra e pinta. É o continente, só que as Américas se dividem em duas (o item não serviria de nada se dissesse só
 *  "Américas"): América do Sul × América do Norte e Central (o Caribe vai com a do Norte). Vale SÓ para a Bússola; o resto do jogo segue usando o
 *  continente e os recortes de sempre. */
export function compassGroup(meta: { reg?: string; sub?: string | null } | undefined): string | null {
  if (!meta?.reg) return null;
  if (meta.reg !== "Americas") return meta.reg;
  return meta.sub === "South America" ? "america-do-sul" : "america-do-norte-central";
}

/** Primeira letra: a resposta escondida num molde. Só a inicial aparece; as demais letras viram "•" e os espaços e a pontuação ficam, para a
 *  pessoa ver quantas palavras e quantas letras tem a resposta ("Costa do Marfim" vira "C•••• •• ••••••"). Letras com acento contam como uma. */
export function letterHint(answer: string | undefined | null): string {
  const text = String(answer ?? "").trim();
  if (!text) return "";
  let revealed = false;
  return Array.from(text).map((char) => {
    if (!/[\p{L}\p{N}]/u.test(char)) return char;
    if (!revealed) { revealed = true; return char.toLocaleUpperCase(); }
    return "•";
  }).join("");
}
