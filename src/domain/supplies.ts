// Suprimentos de expedição: consumíveis comprados na Loja, usados durante uma rodada (em Partida e em Treino, nunca no duelo — quem chama garante
// isso; a Ampulheta só vale com cronômetro). Regras puras, sem IndexedDB (o estoque mora em supplies-store.ts).
import type { AnyQuizVariant, Meta } from "./types";

export type SupplyId = "lupa" | "bussola" | "lanterna" | "vizinho" | "letra" | "pular" | "retorno" | "escudo" | "ampulheta" | "tonico";
/** Na ordem da hotbar e da Loja: primeiro as dicas, depois os que mexem na rodada, o que protege e, por último, o tempo. */
export const SUPPLY_IDS: readonly SupplyId[] = ["lupa", "bussola", "lanterna", "vizinho", "letra", "pular", "retorno", "escudo", "ampulheta", "tonico"];

/** Os três em destaque na vitrine do Hub e no cartaz da Loja (os sete cabem só na aba Suprimentos). */
export const FEATURED_SUPPLIES: readonly SupplyId[] = ["lupa", "escudo", "retorno"];

/** Preço por unidade (chute inicial, a calibrar jogando — mesmo espírito dos outros números da economia). */
export const SUPPLY_COST: Record<SupplyId, number> = { lupa: 400, bussola: 250, lanterna: 300, vizinho: 350, letra: 200, pular: 120, retorno: 300, escudo: 500, ampulheta: 150, tonico: 600 };

/** Quantas opções erradas a Lupa tira (de 4, sobram 2: a certa e mais 1). */
export const LUPA_REMOVE_COUNT = 2;
/** Quantos segundos a Ampulheta soma ao cronômetro da rodada atual. */
export const AMPULHETA_BONUS_SECONDS = 5;

/** Lupa: quais alternativas esconder. Sobram duas visíveis — a certa e uma errada —, e a errada que fica é uma ainda não tentada (se a Segunda
 *  chance já riscou uma, ela sai junto com as outras: a pessoa já sabe que está errada). `shuffle` entra de fora para o sorteio ser testável. */
export function lupaToHide(options: readonly string[], target: string, hidden: ReadonlySet<string>, tried: ReadonlySet<string>, shuffle: <T>(items: T[]) => T[]): string[] {
  const wrong = options.filter((option) => option !== target && !hidden.has(option));
  const untried = wrong.filter((option) => !tried.has(option));
  const keep = shuffle(untried.length ? untried : wrong)[0];
  return wrong.filter((option) => option !== keep);
}

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
// A Pista de vizinhos fala de países: serve onde o alvo é um país (mapa, bandeiras, capitais, silhueta, escrita), não em históricas, idiomas nem Travel.
const COUNTRY_VARIANTS: ReadonlySet<AnyQuizVariant> = new Set([
  "mapa", "capital-pais", "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta", "silhueta-opcoes", "escrita-pais", "escrita-capital",
]);

/** Se o suprimento `id` faz sentido no modo `variant` — controla quais botões aparecem em cada motor de partida. */
export function supplyApplies(id: SupplyId, variant: AnyQuizVariant, timed = true): boolean {
  if (id === "lupa") return OPTION_VARIANTS.has(variant);
  if (id === "bussola" || id === "lanterna") return MAP_VARIANTS.has(variant);
  if (id === "vizinho") return COUNTRY_VARIANTS.has(variant);
  if (id === "letra") return TYPED_VARIANTS.has(variant);
  if (id === "retorno") return variant !== "travel";
  if (id === "ampulheta") return timed;
  return true; // pular, escudo e tônico
}

export type SupplyCounts = Record<SupplyId, number>;
export const emptySupplyCounts = (): SupplyCounts => ({ lupa: 0, bussola: 0, lanterna: 0, vizinho: 0, letra: 0, pular: 0, retorno: 0, escudo: 0, ampulheta: 0, tonico: 0 });

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

/** Lanterna: a janela do mapa que a câmera enquadra em volta do alvo, em km de lado a lado da tela. */
export const LANTERN_SPAN_KM = 1200;
const LANTERN_ZOOM_RANGE = [3, 7.5] as const;
/** O zoom do MapLibre (tiles de 512 px) em que `widthPx` pixels cobrem `LANTERN_SPAN_KM` na latitude `lat`. Limitado para o mapa não sumir nem estourar. */
export function lanternZoom(lat: number, widthPx: number): number {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const zoom = Math.log2((78271.517 * cosLat * Math.max(200, widthPx)) / (LANTERN_SPAN_KM * 1000));
  return Math.min(LANTERN_ZOOM_RANGE[1], Math.max(LANTERN_ZOOM_RANGE[0], zoom));
}

type HintMeta = Pick<Meta, "pt" | "cca3" | "borders" | "ll" | "un" | "absorvido">;
const cca3Index = new WeakMap<object, Map<string, string>>();
const idsByCca3 = (meta: Record<string, HintMeta>) => {
  let index = cca3Index.get(meta);
  if (!index) {
    index = new Map();
    for (const [id, entry] of Object.entries(meta)) if (entry.cca3) index.set(entry.cca3.toUpperCase(), id);
    cca3Index.set(meta, index);
  }
  return index;
};
const stableHash = (text: string) => { let hash = 2166136261; for (const char of text) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; };
const distanceKm = (a: readonly number[], b: readonly number[]) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Pista de vizinhos: um país que faz fronteira com o alvo (sempre o mesmo para o mesmo alvo) ou, se o alvo não tem fronteira por terra (ilhas),
 *  o país mais próximo — nesse caso `sea` é verdadeiro e a pista diz que é "por mar". Nulo se o alvo não tem coordenadas nem vizinhos. */
export function neighborHint(meta: Record<string, HintMeta>, targetId: string): { id: string; sea: boolean } | null {
  const me = meta[targetId];
  if (!me) return null;
  const index = idsByCca3(meta);
  const land = (me.borders ?? []).map((code) => index.get(String(code).toUpperCase())).filter((id): id is string => Boolean(id) && id !== targetId && Boolean(meta[id as string]?.pt)).sort();
  if (land.length) return { id: land[stableHash(targetId) % land.length], sea: false };
  if (!me.ll) return null;
  let best: { id: string; km: number } | null = null;
  for (const [id, entry] of Object.entries(meta)) {
    if (id === targetId || !entry.un || entry.absorvido || !entry.ll || !entry.pt) continue;
    const km = distanceKm(me.ll, entry.ll);
    if (!best || km < best.km) best = { id, km };
  }
  return best ? { id: best.id, sea: true } : null;
}
