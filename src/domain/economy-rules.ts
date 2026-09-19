import type { AnyQuizVariant, Family, Region } from "./types";

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
  { key: "bandeiras:nome-bandeira:caribe", family: "bandeiras", variant: "nome-bandeira", region: "caribe", cost: 2, sessions: 1, label: "Bandeiras · Nome → bandeira" },
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
const defaultPolicy = (family: Family, variant: AnyQuizVariant, region: Region): Policy => {
  const free = family === "capitais" || family === "escrita" || family === "historicas" || family === "idiomas";
  const cost = free ? 0 : region === "caribe" ? 0 : region === "mundo" ? 3 : 2;
  const sessions = free ? 0 : region === "caribe" ? 0 : region === "mundo" ? 1 : 2;
  return {
    key: `${family}:${variant}:${region}` as UnlockKey,
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
    (["caribe", "mundo", "pacifico"] as Region[]).map((region) =>
      variants.map((variant) => {
        const key = `${family}:${variant}:${region}` as UnlockKey;
        return explicit.get(key) ?? defaultPolicy(family, variant, region);
      }),
    ).flat(),
  );

export function policyFor(family: Family, variant: AnyQuizVariant, region: Region) {
  return POLICIES.find((item) => item.family === family && item.variant === variant && item.region === region);
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