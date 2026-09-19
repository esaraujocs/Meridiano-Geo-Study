import type { AnyQuizVariant, Family, Region } from "./types";

export type EconomyColumn = "bandeiras" | "mapa" | "capitais" | "escrita";
/** Unlocks belong to a variant, not to a map cut. */
export type UnlockKey = `${Family}:${AnyQuizVariant}`;

export type Policy = {
  key: UnlockKey;
  family: Family;
  variant: AnyQuizVariant;
  /** Kept for callers which display a selected region; policies ignore it. */
  region?: Region;
  cost: number;
  coverage?: EconomyColumn;
  coverageCount: number;
  /** Number of qualifying completed sessions required (not rounds). */
  sessions: number;
  qualifyingSessions: number;
  label: string;
};

export const REWARD_FIRST_CORRECT = 2;
export const REWARD_MASTERY_PROMOTION = 1;

const canonicalVariant = (family: Family, variant: AnyQuizVariant) => {
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) return "bandeira-nome";
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) return "historica-nome";
  return variant;
};

const makePolicy = (family: Family, variant: AnyQuizVariant, cost: number, coverage?: EconomyColumn, coverageCount = 0): Policy => ({
  key: canonicalUnlockKey(family, variant, "mundo"),
  family, variant, cost, coverage, coverageCount, sessions: 0, qualifyingSessions: 0,
  label: `${family} · ${variant}`,
});
const BASE_POLICIES: Policy[] = [
  makePolicy("mapa", "mapa", 0),
  makePolicy("bandeiras", "bandeira-nome", 0),
  makePolicy("capitais", "capital-pais", 0),
  makePolicy("capitais", "pais-capital", 0),
  makePolicy("silhueta", "silhueta", 4, "mapa", 12),
  makePolicy("silhueta", "silhueta-opcoes", 4, "mapa", 12),
  makePolicy("travel", "travel", 6, "mapa", 20),
  makePolicy("escrita", "escrita-pais", 3, "bandeiras", 10),
  makePolicy("historicas", "historica-nome", 5, "bandeiras", 20),
  makePolicy("escrita", "escrita-capital", 4, "capitais", 10),
  makePolicy("idiomas", "idioma-pais", 5, "bandeiras", 15),
];
export function canonicalUnlockKey(family: Family, variant: AnyQuizVariant, region: Region): UnlockKey {
  return `${family}:${canonicalVariant(family, variant)}` as UnlockKey;
}
export function unlockAliases(family: Family, variant: AnyQuizVariant, region: Region): UnlockKey[] {
  const canonical = canonicalUnlockKey(family, variant, region);
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) {
    return [canonical, `${family}:bandeira-nome`, `${family}:nome-bandeira` as UnlockKey];
  }
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) {
    return [canonical, `${family}:historica-nome`, `${family}:nome-historica` as UnlockKey];
  }
  return [canonical];
}
export const POLICIES: Policy[] = BASE_POLICIES;

export function policyFor(family: Family, variant: AnyQuizVariant, region: Region) {
  return POLICIES.find((item) => item.family === family && item.variant === canonicalVariant(family, variant));
}

export function canUnlock(policy: Policy, balance: number, sessions: number, coverage = 0) {
  return balance >= policy.cost && sessions >= policy.sessions && coverage >= policy.coverageCount;
}

export function rewardId(entityId: string, column: EconomyColumn) {
  return `reward:first-correct:${entityId}:${column}`;
}

export function firstCorrectReward(
  entityId: string,
  column: EconomyColumn,
  correct: boolean,
  alreadyCorrect: number,
) {
  if (!correct || alreadyCorrect > 0) return null;
  return { id: rewardId(entityId, column), amount: REWARD_FIRST_CORRECT, reason: "first-correct", source: `learning:${entityId}:${column}` };
}