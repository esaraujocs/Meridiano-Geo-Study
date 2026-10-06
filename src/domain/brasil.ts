// Família Brasil: os 26 estados e o Distrito Federal, com mapa, silhueta, bandeiras, capitais e escrita. Regras puras; os dados vêm de
// public/data/brasil/ (states.json e shapes.json de scripts/brasil/build-brasil.py, flags.json de scripts/brasil/flags.mjs) e chegam por
// brasil-data.ts. Os estados viram um catálogo à parte no mesmo formato do acervo do mapa-múndi (`Legacy`), então os motores de partida jogam
// com ele como jogam com os países; cada modo segue as regras de uma variante do mapa-múndi (BRASIL_BASE: motor, cronômetro, suprimentos).
// As sessões ficam com a família "brasil": fora da coleção, do domínio, dos pilares e do duelo (como Gentílicos e Moedas).
import type { AnyQuizVariant, Legacy, Meta, RegionSelection } from "./types";
import { BR_REGION_KEYS, normalizeRegionSelection, type BrRegion } from "./regions.js";

export const BRASIL_VARIANTS = [
  "br-mapa", "br-capital-mapa", "br-silhueta-opcoes", "br-silhueta", "br-nome-bandeira", "br-bandeira-nome", "br-estado-capital", "br-escrita-estado", "br-escrita-capital",
] as const;
export type BrasilVariant = (typeof BRASIL_VARIANTS)[number];
/** A variante do mapa-múndi que dá as regras de cada modo do Brasil. */
export const BRASIL_BASE = {
  "br-mapa": "mapa",
  "br-capital-mapa": "capital-pais",
  "br-silhueta-opcoes": "silhueta-opcoes",
  "br-silhueta": "silhueta",
  "br-nome-bandeira": "nome-bandeira",
  "br-bandeira-nome": "bandeira-nome",
  "br-estado-capital": "pais-capital",
  "br-escrita-estado": "escrita-pais",
  "br-escrita-capital": "escrita-capital",
} as const satisfies Record<BrasilVariant, AnyQuizVariant>;
export type BrasilBase = (typeof BRASIL_BASE)[BrasilVariant];

export const isBrasilVariant = (variant: string): variant is BrasilVariant => (BRASIL_VARIANTS as readonly string[]).includes(variant);
/** A regra do mapa-múndi por trás da variante: a do Brasil vira a do modo equivalente, as outras ficam como estão. */
export function baseVariant<V extends AnyQuizVariant>(variant: V): Exclude<V, BrasilVariant> | BrasilBase {
  return isBrasilVariant(variant) ? BRASIL_BASE[variant] : (variant as Exclude<V, BrasilVariant>);
}
/** Os estados vivem em ids próprios ("br-sp"), que nunca colidem com os do mapa-múndi (números ISO). */
export const isBrasilId = (id: string) => id.startsWith("br-");

// ---- Arquivos de public/data/brasil/ ----
type Names = { pt: string; en: string; es: string };
export type BrasilStateRow = {
  sigla: string;
  code: string;
  name: Names;
  capital: string;
  capAl?: string[];
  region: BrRegion;
  area: number;
  /** Ponto do rótulo, dentro do estado: [lat, lon] (como o `ll` do catálogo). */
  ll: [number, number];
  /** Caixa sem as ilhas oceânicas, [oeste, sul, leste, norte]. */
  bbox: [number, number, number, number];
  /** Vizinhos pelas divisas (ids). */
  borders: string[];
};
export type BrasilStatesFile = { source: string; regions: Record<BrRegion, Names>; states: Record<string, BrasilStateRow> };
export type BrasilFlagsFile = { source: string; flags: Record<string, string>; ratio: Record<string, number>; sources: Record<string, { file: string; url: string; license: string }> };
export type BrasilShapesFile = Record<string, { type: string; coordinates: unknown }>;

export type Brasil = {
  /** O catálogo no formato do mapa-múndi: `meta` por id de estado, com `pt` no idioma da interface. */
  data: Legacy;
  /** Caixa de cada estado (a câmera do mapa enquadra o recorte por ela). */
  bbox: Readonly<Record<string, readonly [number, number, number, number]>>;
};

/** O catálogo dos estados no formato que os motores de partida leem. `pt` traz o nome no idioma da interface (como no acervo traduzido); os
 *  nomes nos outros idiomas valem na escrita (`en` e `al`). A sigla é o `cca3` e as divisas são os `borders`, então a Pista de vizinhos funciona
 *  igual à dos países. A bandeira é o próprio id (`fl`), a chave de flags.json. */
export function brasilCatalog(file: BrasilStatesFile, locale: keyof Names = "pt"): Brasil {
  const meta: Record<string, Meta> = {};
  const bbox: Record<string, readonly [number, number, number, number]> = {};
  for (const [id, row] of Object.entries(file.states)) {
    const shown = row.name[locale] ?? row.name.pt;
    const others = [...new Set([row.name.pt, row.name.es, row.name.en])].filter((name) => name !== shown && name !== row.name.en);
    meta[id] = {
      pt: shown,
      en: row.name.en,
      ...(others.length ? { al: others } : {}),
      cap: row.capital,
      ...(row.capAl?.length ? { capAl: [...row.capAl] } : {}),
      fl: id,
      reg: row.region,
      ll: row.ll,
      cca3: row.sigla,
      borders: row.borders.map((neighbor) => file.states[neighbor]?.sigla ?? neighbor),
      area: row.area,
      un: true,
    };
    bbox[id] = row.bbox;
  }
  return { data: { sourceVersion: "brasil", sourceHash: file.source, meta, mapEntityIds: Object.keys(meta) }, bbox };
}

/** Os estados do recorte (o Brasil inteiro ou as regiões escolhidas). */
export function brasilIdsIn(brasil: Brasil, selection: RegionSelection): string[] {
  const regions = normalizeRegionSelection(selection);
  const all = regions.includes("brasil") || !regions.some((key) => (BR_REGION_KEYS as readonly string[]).includes(key));
  return Object.entries(brasil.data.meta).filter(([, meta]) => all || regions.includes(meta.reg as BrRegion)).map(([id]) => id);
}

/** Caixa [oeste, sul, leste, norte] que cobre os estados: o enquadramento da câmera do mapa no recorte. */
export function brasilBounds(brasil: Brasil, ids: readonly string[]): [number, number, number, number] {
  const boxes = ids.map((id) => brasil.bbox[id]).filter(Boolean);
  if (!boxes.length) return [-74, -34, -34.8, 5.3];
  return [
    Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3])),
  ];
}
