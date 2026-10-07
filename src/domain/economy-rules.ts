import type { AnyQuizVariant, Family, Region } from "./types";

export type EconomyColumn = "bandeiras" | "mapa" | "capitais" | "escrita";
/** Unlocks belong to a variant, not to a map cut. */
export type UnlockKey = `${Family}:${AnyQuizVariant}` | "rounds:20" | "rounds:50" | "rounds:100" | "rounds:all" | `theme:${string}`;

export type Policy = {
  key: `${Family}:${AnyQuizVariant}`;
  family: Family;
  variant: AnyQuizVariant;
  /** Kept for callers which display a selected region; policies ignore it. */
  region?: Region;
  cost: number;
  /** Só moedas: desde a economia v2 nenhum modo exige cobertura ou partidas (os campos ficam por compatibilidade). */
  coverage?: EconomyColumn;
  coverageCount: number;
  sessions: number;
  qualifyingSessions: number;
  label: string;
};

const canonicalVariant = (family: Family, variant: AnyQuizVariant) => {
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) return "bandeira-nome";
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) return "historica-nome";
  if (family === "divisoes" && (variant === "dv-bandeira-nome" || variant === "dv-nome-bandeira")) return "dv-bandeira-nome";
  return variant;
};

const makePolicy = (family: Family, variant: AnyQuizVariant, cost: number): Policy => ({
  key: canonicalUnlockKey(family, variant, "mundo"),
  family, variant, cost, coverageCount: 0, sessions: 0, qualifyingSessions: 0,
  label: `${family} · ${variant}`,
});
// Em ordem de preço (test:policies confere a escada: cada degrau custa de 1,1 a 2,2 vezes o anterior). Os modos de Estados e províncias entram
// nos degraus mais baixos e valem para todos os países (o mapa é grátis para todo mundo poder provar).
const BASE_POLICIES: Policy[] = [
  makePolicy("mapa", "mapa", 0),
  makePolicy("bandeiras", "bandeira-nome", 0),
  makePolicy("capitais", "capital-pais", 0),
  makePolicy("capitais", "pais-capital", 0),
  makePolicy("divisoes", "dv-mapa", 0),
  makePolicy("divisoes", "dv-bandeira-nome", 2000),
  makePolicy("divisoes", "dv-capital-mapa", 3000),
  makePolicy("divisoes", "dv-capital", 4000),
  makePolicy("escrita", "escrita-pais", 5000),
  makePolicy("divisoes", "dv-silhueta-opcoes", 6000),
  makePolicy("gentilicos", "gentilico-pais", 8000),
  makePolicy("divisoes", "dv-escrita-nome", 9000),
  makePolicy("silhueta", "silhueta-opcoes", 11000),
  makePolicy("divisoes", "dv-escrita-capital", 13000),
  makePolicy("escrita", "escrita-capital", 15000),
  makePolicy("gentilicos", "pais-gentilico", 18000),
  makePolicy("divisoes", "dv-silhueta", 20000),
  makePolicy("moedas", "pais-moeda", 22000),
  makePolicy("silhueta", "silhueta", 27000),
  makePolicy("moedas", "moeda-pais", 30000),
  makePolicy("historicas", "historica-nome", 36000),
  makePolicy("idiomas", "idioma-nome", 40000),
  makePolicy("idiomas", "idioma-pais", 48000),
  makePolicy("travel", "travel", 64000),
];
export function canonicalUnlockKey(family: Family, variant: AnyQuizVariant, region: Region): Policy["key"] {
  return `${family}:${canonicalVariant(family, variant)}` as Policy["key"];
}
export function unlockAliases(family: Family, variant: AnyQuizVariant, region: Region): Array<Policy["key"]> {
  const canonical = canonicalUnlockKey(family, variant, region);
  if (family === "bandeiras" && (variant === "bandeira-nome" || variant === "nome-bandeira")) {
    return [canonical, `${family}:bandeira-nome`, `${family}:nome-bandeira` as Policy["key"]];
  }
  if (family === "historicas" && (variant === "historica-nome" || variant === "nome-historica")) {
    return [canonical, `${family}:historica-nome`, `${family}:nome-historica` as Policy["key"]];
  }
  if (family === "divisoes" && (variant === "dv-bandeira-nome" || variant === "dv-nome-bandeira")) {
    return [canonical, "divisoes:dv-bandeira-nome", "divisoes:dv-nome-bandeira"];
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
