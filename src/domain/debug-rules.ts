// Regras puras das ferramentas de debug (sem IndexedDB), para poderem ser testadas.
export type DebugColumns = { bandeiras: number; mapa: number; capitais: number; escrita?: number };

export const MAX_DEBUG_LEVEL = 100;
export const clampLevel = (value: number) => Math.max(1, Math.min(MAX_DEBUG_LEVEL, Math.floor(Number.isFinite(value) ? value : 1)));

// Nível do jogador: cada nível N pede 50·N·(N+1) de XP no total (mesma regra de queryEconomy).
export const xpForLevel = (level: number) => 50 * (level - 1) * level;
export function levelForXp(xp: number) {
  let level = 1;
  while (50 * level * (level + 1) <= xp) level += 1;
  return level;
}
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

// URL ?debug=1 liga; ?debug=0 desliga. Qualquer outro valor não muda nada.
export function debugFlagFromSearch(search: string): boolean | null {
  const value = new URLSearchParams(search).get("debug");
  return value === "1" ? true : value === "0" ? false : null;
}
