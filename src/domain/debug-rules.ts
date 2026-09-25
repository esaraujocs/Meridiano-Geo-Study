// Regras puras das ferramentas de debug (sem IndexedDB), para poderem ser testadas.
import { xpForLevel, levelForXp } from "./player-level.js";
export type DebugColumns = { bandeiras: number; mapa: number; capitais: number; escrita?: number };

export const MAX_DEBUG_LEVEL = 100;
export const clampLevel = (value: number) => Math.max(1, Math.min(MAX_DEBUG_LEVEL, Math.floor(Number.isFinite(value) ? value : 1)));

// Nível do jogador: a curva vive em player-level.ts (a mesma de queryEconomy e da tela de resultado).
export { xpForLevel, levelForXp };
// Ajuste de XP que faz o nível calculado ser exatamente `target`, dado o XP real do perfil.
export const xpAdjustFor = (target: number, realXp: number) => xpForLevel(clampLevel(target)) - realXp;

// Menor evidência de aprendizado que resulta em cada nível de carta (0 a 5), como em masteryForProgress.
export function columnsForLevel(mastery: number): DebugColumns {
  const level = Math.max(0, Math.min(5, Math.floor(mastery)));
  return {
    bandeiras: level >= 1 ? 1 : 0,
    mapa: level >= 2 ? 1 : 0,
    capitais: level >= 3 ? (level >= 5 ? 2 : 1) : 0,
    ...(level >= 4 ? { escrita: level >= 5 ? 2 : 1 } : {}),
  };
}
export const modesForColumns = (columns: DebugColumns) =>
  (["bandeiras", "mapa", "capitais", "escrita"] as const).filter((key) => (columns[key] ?? 0) > 0).length;

// Chaves dos registros guardados para restaurar os dados reais depois do debug.
export const STASH_PREFIX = "debug-stash:";
export const XP_ADJUST_ID = "debug-xp-adjust";
export const stashId = (store: string, key: string) => `${STASH_PREFIX}${store}:${key}`;
export const isStashId = (id: unknown): id is string => typeof id === "string" && id.startsWith(STASH_PREFIX);

// "Jogador novo": marca que o histórico real foi guardado e as lojas ficaram vazias para testar o começo do jogo.
export const FRESH_START_ID = "debug-fresh-start";
/** Registros criados depois do "jogador novo": tudo o que não está entre os originais guardados (esses voltam no lugar). */
export const createdSinceFreshStart = (currentKeys: readonly string[], stashedKeys: readonly string[]) => {
  const stashed = new Set(stashedKeys);
  return currentKeys.filter((key) => !stashed.has(key));
};

// Compras feitas com moedas de debug: ao restaurar, as moedas somem mas o débito da compra ficava e o saldo virava negativo.
export type LedgerLike = { id: string; kind: "credit" | "debit"; amount: number; source?: string; createdAt?: number };
export const PURCHASE_DEBIT_PREFIX = "debit:unlock:";
/** Compras (débitos de liberação) a desfazer, das mais recentes para as mais antigas, até o saldo deixar de ser negativo. */
export function purchasesToUndo<T extends LedgerLike>(entries: readonly T[]): T[] {
  let balance = entries.reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
  if (balance >= 0) return [];
  const purchases = entries
    .filter((entry) => entry.kind === "debit" && entry.id.startsWith(PURCHASE_DEBIT_PREFIX))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const undo: T[] = [];
  for (const purchase of purchases) {
    if (balance >= 0) break;
    undo.push(purchase);
    balance += purchase.amount;
  }
  return undo;
}

// URL ?debug=1 liga; ?debug=0 desliga. Qualquer outro valor não muda nada.
export function debugFlagFromSearch(search: string): boolean | null {
  const value = new URLSearchParams(search).get("debug");
  return value === "1" ? true : value === "0" ? false : null;
}
