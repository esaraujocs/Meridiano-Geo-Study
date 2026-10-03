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
