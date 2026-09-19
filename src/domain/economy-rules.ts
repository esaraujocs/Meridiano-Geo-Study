import type { AnyQuizVariant, Family, Region } from "./types";
import { REGION_ITEMS } from "./regions.js";

export type EconomyColumn = "bandeiras" | "mapa" | "capitais" | "escrita";
export type UnlockKey = `${Family}:${AnyQuizVariant}:${Region}`;

export type Policy = {
  key: UnlockKey;
  family: Family;
  variant: AnyQuizVariant;
  region: Region;
  cost: number;
  sessions: number;
  label: string;
};

export const REWARD_FIRST_CORRECT = 2;
export const REWARD_MASTERY_PROMOTION = 1;

const BASE_POLICIES: Policy[] = [
  { key: "mapa:mapa:caribe", family: "mapa", variant: "mapa", region: "caribe", cost: 0, sessions: 0, label: "Mapa · Caribe" },
  { key: "bandeiras:bandeira-nome:caribe", family: "bandeiras", variant: "bandeira-nome", region: "caribe", cost: 0, sessions: 0, label: "Bandeiras · Caribe" },
  { key: "capitais:capital-pais:caribe", family: "capitais", variant: "capital-pais", region: "caribe", cost: 0, sessions: 0, label: "Capitais · Caribe" },
  { key: "capitais:pais-capital:caribe", family: "capitais", variant: "pais-capital", region: "caribe", cost: 0, sessions: 0, label: "Capitais · Caribe (inverso)" },
  { key: "mapa:mapa:mundo", family: "mapa", variant: "mapa", region: "mundo", cost: 3, sessions: 1, label: "Mapa · Mundo" },
  { key: "mapa:mapa:pacifico", family: "mapa", variant: "mapa", region: "pacifico", cost: 2, sessions: 2, label: "Mapa · Pacífico" },
  { key: "bandeiras:bandeira-nome:mundo", family: "bandeiras", variant: "bandeira-nome", region: "mundo", cost: 3, sessions: 1, label: "Bandeiras · Mundo" },
  { key: "bandeiras:bandeira-nome:pacifico", family: "bandeiras", variant: "bandeira-nome", region: "pacifico", cost: 2, sessions: 2, label: "Bandeiras · Pacífico" },
  { key: "capitais:capital-pais:mundo", family: "capitais", variant: "capital-pais", region: "mundo", cost: 0, sessions: 0, label: "Capitais · Mundo" },
  { key: "capitais:capital-pais:pacifico", family: "capitais", variant: "capital-pais", region: "pacifico", cost: 0, sessions: 0, label: "Capitais · Pacífico" },
  { key: "capitais:pais-capital:mundo", family: "capitais", variant: "pais-capital", region: "mundo", cost: 0, sessions: 0, label: "Capitais · Mundo (inverso)" },
  { key: "capitais:pais-capital:pacifico", family: "capitais", variant: "pais-capital", region: "pacifico", cost: 0, sessions: 0, label: "Capitais · Pacífico (inverso)" },
  { key: "silhueta:silhueta:caribe", family: "silhueta", variant: "silhueta", region: "caribe", cost: 0, sessions: 0, label: "Silhueta · Caribe" },
  { key: "silhueta:silhueta:mundo", family: "silhueta", variant: "silhueta", region: "mundo", cost: 3, sessions: 1, label: "Silhueta · Mundo" },
  { key: "silhueta:silhueta:pacifico", family: "silhueta", variant: "silhueta", region: "pacifico", cost: 2, sessions: 2, label: "Silhueta · Pacífico" },
  { key: "travel:travel:caribe", family: "travel", variant: "travel", region: "caribe", cost: 0, sessions: 0, label: "Travel · Caribe" },
  { key: "travel:travel:mundo", family: "travel", variant: "travel", region: "mundo", cost: 3, sessions: 1, label: "Travel · Mundo" },
  { key: "travel:travel:pacifico", family: "travel", variant: "travel", region: "pacifico", cost: 2, sessions: 2, label: "Travel · Pacífico" },
];

const EXPOSED_VARIANTS: Record<Family, AnyQuizVariant[]> = {
  mapa: ["mapa"],
  bandeiras: ["bandeira-nome", "nome-bandeira"],
  capitais: ["capital-pais", "pais-capital"],
  escrita: ["escrita-pais", "escrita-capital"],
  historicas: ["historica-nome", "nome-historica"],
  idiomas: ["idioma-pais"],
  silhueta: ["silhueta"],
  travel: ["travel"],
};

const explicit = new Map(BASE_POLICIES.map((policy) => [policy.key, policy]));
const canonicalVariant = (family: Family, variant: AnyQuizVariant) => {
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) return "bandeira-nome";
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) return "historica-nome";
  return variant;
};
export function canonicalUnlockKey(family: Family, variant: AnyQuizVariant, region: Region): UnlockKey {
  return `${family}:${canonicalVariant(family, variant)}:${region}` as UnlockKey;
}
export function unlockAliases(family: Family, variant: AnyQuizVariant, region: Region): UnlockKey[] {
  const canonical = canonicalUnlockKey(family, variant, region);
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) {
    return [canonical, `${family}:bandeira-nome:${region}`, `${family}:nome-bandeira:${region}` as UnlockKey];
  }
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) {
    return [canonical, `${family}:historica-nome:${region}`, `${family}:nome-historica:${region}` as UnlockKey];
  }
  return [canonical];
}
const defaultPolicy = (family: Family, variant: AnyQuizVariant, region: Region): Policy => {
  const free = family === "capitais" || family === "escrita" || family === "historicas" || family === "idiomas";
  const cost = free ? 0 : region === "caribe" ? 0 : region === "mundo" ? 3 : region === "pacifico" ? 2 : 4;
  const sessions = free ? 0 : region === "caribe" ? 0 : region === "mundo" ? 1 : region === "pacifico" ? 2 : 3;
  return {
    key: canonicalUnlockKey(family, variant, region),
    family,
    variant,
    region,
    cost,
    sessions,
    label: `${family} · ${variant} · ${region}`,
  };
};

export const POLICIES: Policy[] = (Object.entries(EXPOSED_VARIANTS) as [Family, AnyQuizVariant[]][])
  .flatMap(([family, variants]) =>
    REGION_ITEMS.map(([region]) => region).map((region) =>
      variants.map((variant) => {
        const key = canonicalUnlockKey(family, variant, region);
        return explicit.get(key) ?? explicit.get(`${family}:${variant}:${region}` as UnlockKey) ?? defaultPolicy(family, variant, region);
      }),
    ).flat()
  ).filter((policy, index, policies) => policies.findIndex((item) => item.key === policy.key) === index);

export function policyFor(family: Family, variant: AnyQuizVariant, region: Region) {
  return POLICIES.find((item) => item.family === family && item.variant === variant && item.region === region)
    ?? POLICIES.find((item) => item.family === family && item.variant === canonicalVariant(family, variant) && item.region === region);
}

export function canUnlock(policy: Policy, balance: number, sessions: number) {
  return balance >= policy.cost && sessions >= policy.sessions;
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