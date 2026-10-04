// A Vitrine do Hub: qual item da Loja aparece em destaque. Lógica pura, sem React.
import { SHOP_THEMES, isThemeOwned, type Theme } from "./themes.js";

/** O tema à venda que mais vale mostrar: entre os que a pessoa pode comprar agora, o mais caro (o "próximo passo" natural);
 *  se nenhum cabe no saldo, o mais barato que falta (o mais perto de ser alcançado). Sem nada a comprar, `null`. */
export function pickShowcaseTheme(balance: number, unlocked: readonly string[]): Theme | null {
  const forSale = SHOP_THEMES.filter((theme) => theme.cost > 0 && !isThemeOwned(theme.id, unlocked));
  if (forSale.length === 0) return null;
  const affordable = forSale.filter((theme) => theme.cost <= balance);
  if (affordable.length > 0) return affordable.reduce((best, theme) => (theme.cost > best.cost ? theme : best));
  return forSale.reduce((best, theme) => (theme.cost < best.cost ? theme : best));
}

/** Um "set" da Vitrine: um tema à venda ou três suprimentos. */
export type ShowcaseSet = { kind: "theme"; theme: Theme } | { kind: "supplies"; ids: readonly string[] };
/** Os conjuntos de suprimentos que preenchem a Vitrine (os 9 com mais cara de item; o Pular fica só na Loja). */
export const SUPPLY_SETS: readonly (readonly string[])[] = [["lupa", "escudo", "retorno"], ["bussola", "lanterna", "vizinho"], ["ampulheta", "letra", "tonico"]];
export const SHOWCASE_SETS = 3;
/** Quanto cada set fica na Vitrine antes de trocar (tempo de ler sem a troca chamar atenção). */
export const SHOWCASE_INTERVAL_MS = 14_000;

/**
 * Os 3 sets que a Vitrine alterna, em laço. Temas à venda vêm primeiro (o de `pickShowcaseTheme` na frente, depois os outros que cabem no saldo, do mais
 * caro para o mais barato, e então os que faltam, do mais perto ao mais longe); os lugares que sobram ficam com os conjuntos de suprimentos.
 */
export function showcaseSets(balance: number, unlocked: readonly string[]): ShowcaseSet[] {
  const forSale = SHOP_THEMES.filter((theme) => theme.cost > 0 && !isThemeOwned(theme.id, unlocked));
  const first = pickShowcaseTheme(balance, unlocked);
  const rest = forSale.filter((theme) => theme !== first);
  const affordable = rest.filter((theme) => theme.cost <= balance).sort((a, b) => b.cost - a.cost);
  const later = rest.filter((theme) => theme.cost > balance).sort((a, b) => a.cost - b.cost);
  const themes = [first, ...affordable, ...later].filter((theme): theme is Theme => Boolean(theme)).slice(0, SHOWCASE_SETS);
  const sets: ShowcaseSet[] = themes.map((theme) => ({ kind: "theme", theme }));
  for (const ids of SUPPLY_SETS) { if (sets.length >= SHOWCASE_SETS) break; sets.push({ kind: "supplies", ids }); }
  return sets;
}
