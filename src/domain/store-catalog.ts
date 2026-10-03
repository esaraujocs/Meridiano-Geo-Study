// O que a Loja vende além dos temas: modos de jogo, cortes de rodadas e suprimentos, e as sugestões da vitrine. Lógica pura, sem React.
import type { AnyQuizVariant, Family } from "./types";
import { POLICIES, unlockAliases } from "./economy-rules.js";
import { ROUND_UNLOCKS, isRoundTierUnlocked, type RoundTier, type RoundUnlockKey } from "./pace.js";
import { SHOP_THEMES, isThemeOwned, type Theme } from "./themes.js";
import { SUPPLY_COST, SUPPLY_IDS, type SupplyId } from "./supplies.js";
import { pickShowcaseTheme } from "./hub-showcase.js";

export type StoreMode = { key: string; family: Family; variant: AnyQuizVariant; price: number; owned: boolean };
export type StoreRounds = { key: RoundUnlockKey; tier: RoundTier; price: number; owned: boolean };

/** Os modos à venda (os grátis não entram), do mais barato ao mais caro. */
export function storeModes(unlocked: readonly string[]): StoreMode[] {
  return POLICIES.filter((policy) => policy.cost > 0)
    .map((policy) => ({
      key: policy.key,
      family: policy.family,
      variant: policy.variant,
      price: policy.cost,
      owned: unlockAliases(policy.family, policy.variant, "mundo").some((key) => unlocked.includes(key)),
    }))
    .sort((a, b) => a.price - b.price);
}

/** Os cortes de rodadas à venda. Comprar um corte maior já inclui os menores (`isRoundTierUnlocked`). */
export const storeRounds = (unlocked: readonly string[]): StoreRounds[] =>
  ROUND_UNLOCKS.map((item) => ({ key: item.key, tier: item.tier, price: item.cost, owned: isRoundTierUnlocked(item.tier, unlocked) }));

/** O que falta comprar em cada seção (para os contadores das abas). */
export function storeCounts(unlocked: readonly string[]) {
  return {
    themes: SHOP_THEMES.filter((theme) => theme.cost > 0 && !isThemeOwned(theme.id, unlocked)).length,
    modes: storeModes(unlocked).filter((mode) => !mode.owned).length,
    rounds: storeRounds(unlocked).filter((item) => !item.owned).length,
  };
}

export type Suggestion =
  | { kind: "theme"; theme: Theme }
  | { kind: "mode"; mode: StoreMode }
  | { kind: "rounds"; rounds: StoreRounds }
  | { kind: "supply"; id: SupplyId };

/** As sugestões da vitrine: o que está mais perto de ser da pessoa, uma de cada tipo (o tema em destaque do topo não repete). Só o que ainda falta comprar. */
export function storeSuggestions(balance: number, unlocked: readonly string[], featuredId: string | null): Suggestion[] {
  const out: Suggestion[] = [];
  const cheapest = <T extends { price: number }>(items: readonly T[]) => items.filter((item) => !("owned" in item) || !(item as unknown as { owned: boolean }).owned).reduce<T | null>((best, item) => (best === null || item.price < best.price ? item : best), null);
  const mode = cheapest(storeModes(unlocked));
  if (mode) out.push({ kind: "mode", mode });
  const theme = SHOP_THEMES.filter((item) => item.cost > 0 && item.id !== featuredId && !isThemeOwned(item.id, unlocked)).reduce<Theme | null>((best, item) => (best === null || Math.abs(item.cost - balance) < Math.abs(best.cost - balance) ? item : best), null);
  if (theme) out.push({ kind: "theme", theme });
  const rounds = cheapest(storeRounds(unlocked));
  if (rounds) out.push({ kind: "rounds", rounds });
  const supply = [...SUPPLY_IDS].sort((a, b) => SUPPLY_COST[a] - SUPPLY_COST[b])[0];
  if (supply) out.push({ kind: "supply", id: supply });
  return out;
}

export { pickShowcaseTheme };
