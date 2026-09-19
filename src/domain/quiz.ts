import type { Family, Legacy, QuizVariant, Region } from "./types";
import { inRegion } from "./regions";

export type FlagCatalog = Record<string, string>;

let flagsPromise: Promise<FlagCatalog> | null = null;

export function flagSource(value: string) {
  if (value.startsWith("data:")) return value;
  if (value.startsWith("svg:")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.slice(4))}`;
  }
  if (value.trimStart().startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  return value;
}

export function loadFlags(): Promise<FlagCatalog> {
  flagsPromise ??= fetch("/data/legacy/flags.json").then(async (response) => {
    if (!response.ok) throw new Error("Falha ao carregar as bandeiras.");
    const payload = (await response.json()) as { flags?: FlagCatalog };
    if (!payload.flags) throw new Error("Catálogo de bandeiras inválido.");
    return payload.flags;
  });
  return flagsPromise;
}

function usableFlag(meta: Legacy["meta"][string], flags: FlagCatalog) {
  return Boolean(meta.fl && flags[meta.fl.toLowerCase()] && flagSource(flags[meta.fl.toLowerCase()]));
}

function usableCapital(meta: Legacy["meta"][string]) {
  return typeof meta.cap === "string" && meta.cap.trim().length > 0;
}

export function quizPool(
  data: Legacy,
  family: Family,
  region: Region,
  flags?: FlagCatalog,
) {
  return Object.entries(data.meta)
    .filter(([id, meta]) => {
      if (meta.absorvido || !inRegion(id, region, data)) return false;
      if (family === "bandeiras") return Boolean(flags && usableFlag(meta, flags));
      return Boolean(usableCapital(meta) && !meta.soBandeira);
    })
    .map(([id]) => id);
}

export function variantLabel(variant: QuizVariant) {
  return {
    "bandeira-nome": "Bandeira → nome",
    "nome-bandeira": "Nome → bandeira",
    "capital-pais": "Capital → país",
    "pais-capital": "País → capital",
    mapa: "Localizar no mapa",
    silhueta: "Silhueta",
    "silhueta-opcoes": "Silhueta · alternativas",
    travel: "Travel",
  }[variant];
}