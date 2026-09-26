import { RARITY_LABELS, rarityLevel } from "./achievement-summary.js";
import { compareText, intlLocale, t } from "./i18n/index.js";

// Tipos estruturais mínimos: o teste compila este arquivo sozinho, sem o resto do app.
export type ProgressColumns = { bandeiras?: number; mapa?: number; capitais?: number; escrita?: number };
export type CardMeta = {
  pt?: string; cap?: string; reg?: string; sub?: string; un?: boolean;
  lang?: string[]; cur?: string[]; pop?: number; area?: number; borders?: string[]; fato?: string;
};

export const LEVEL_NAMES = RARITY_LABELS;
export { rarityLevel };

const CONTINENTS: Record<string, string> = t.collection.continents;
const SUB_REGIONS: Record<string, string> = t.collection.subRegions;

export const continentLabel = (reg?: string) => (reg ? CONTINENTS[reg] ?? reg : "");
export const subRegionLabel = (sub?: string | null) => (sub ? SUB_REGIONS[sub] ?? sub : "");
// "Américas · Caribe"; só o continente quando não há sub-região.
// Quando a sub-região já traz o continente ("África Setentrional"), não repete.
export function placeLabel(meta: { reg?: string; sub?: string | null } | undefined) {
  const continent = continentLabel(meta?.reg);
  const sub = subRegionLabel(meta?.sub);
  if (!continent) return sub;
  if (sub && normalizeText(sub).includes(normalizeText(continent).slice(0, 4))) return sub;
  return [continent, sub].filter(Boolean).join(" · ");
}

export const normalizeText = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function matchesSearch(name: string, query: string) {
  const needle = normalizeText(query);
  return needle === "" || normalizeText(name).includes(needle);
}
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareText(a.name, b.name));
}

export function levelCounts(items: Array<{ mastery: number }>) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const item of items) counts[Math.max(0, Math.min(5, Math.round(item.mastery)))]++;
  return counts;
}

// O que cada nível abre. Nível = quantos modos diferentes já acertaram o país;
// o 5 pede ainda escrita e capital com 2+ acertos cada (ver masteryForProgress).
export const LEVEL_STEPS = t.collection.steps.map((step, index) => ({ level: index + 1, ...step }));

export type DetailRow = {
  key: "capital" | "idioma" | "moeda" | "populacao" | "area" | "onu" | "vizinhos" | "nota";
  label: string;
  minLevel: number;
  unlocked: boolean;
  wide?: boolean;
  text?: string;
  list?: string[];
};

export function formatPopulation(value: number | undefined) {
  if (!value || value <= 0) return undefined;
  if (value >= 1_000_000) return t.collection.millions((value / 1_000_000).toLocaleString(intlLocale, { maximumFractionDigits: 1 }));
  if (value >= 10_000) return t.collection.thousands(Math.round(value / 1_000).toLocaleString(intlLocale));
  return value.toLocaleString(intlLocale);
}
export function formatArea(value: number | undefined) {
  if (!value || value <= 0) return undefined;
  return `${value.toLocaleString(intlLocale)} km²`;
}

// Linhas da carta, com a camada em que cada uma abre. A região (nível 1) vai no cabeçalho.
export function cardDetailRows(meta: CardMeta | undefined, level: number, names: Record<string, string> = {}): DetailRow[] {
  const row = (r: Omit<DetailRow, "unlocked">): DetailRow => ({ ...r, unlocked: level >= r.minLevel });
  const neighbours = (meta?.borders ?? []).map((code) => names[code] ?? code).sort(compareText);
  const labels = t.collection.rows;
  const rows: DetailRow[] = [
    row({ key: "capital", label: labels.capital, minLevel: 2, text: meta?.cap || undefined }),
    row({ key: "idioma", label: labels.idioma, minLevel: 3, text: meta?.lang?.length ? meta.lang.join(", ") : undefined }),
    row({ key: "moeda", label: labels.moeda, minLevel: 3, text: meta?.cur?.length ? meta.cur.join(", ") : undefined }),
    row({ key: "populacao", label: labels.populacao, minLevel: 4, text: formatPopulation(meta?.pop) }),
    row({ key: "area", label: labels.area, minLevel: 4, text: formatArea(meta?.area) }),
    row({ key: "onu", label: labels.onu, minLevel: 4, text: meta?.un === undefined ? undefined : meta.un ? t.collection.member : t.collection.nonMember }),
    row({ key: "vizinhos", label: labels.vizinhos, minLevel: 4, wide: true, list: neighbours, text: neighbours.length ? undefined : Array.isArray(meta?.borders) ? t.collection.noLandBorder : undefined }),
  ];
  // Só promete uma nota histórica se ela existir.
  if (meta?.fato) rows.push(row({ key: "nota", label: labels.nota, minLevel: 5, wide: true, text: meta.fato }));
  return rows;
}

export const MODE_LABELS: Array<{ key: keyof ProgressColumns; label: string }> = [
  { key: "bandeiras", label: t.collection.modes.bandeiras }, { key: "mapa", label: t.collection.modes.mapa },
  { key: "capitais", label: t.collection.modes.capitais }, { key: "escrita", label: t.collection.modes.escrita },
];
export function modesDone(columns: ProgressColumns | undefined) {
  return MODE_LABELS.map(({ key, label }) => ({ key, label, count: columns?.[key] ?? 0, done: (columns?.[key] ?? 0) > 0 }));
}

// Texto da caixa "Próxima camada" (null quando a carta já está completa).
export function nextLevelHint(name: string, level: number, columns: ProgressColumns | undefined) {
  if (level >= 5) return null;
  if (level === 4) {
    const writing = Math.max(0, 2 - (columns?.escrita ?? 0));
    const capitals = Math.max(0, 2 - (columns?.capitais ?? 0));
    const missing = [writing > 0 ? t.collection.inWriting(writing) : "", capitals > 0 ? t.collection.inCapitals(capitals) : ""].filter(Boolean).join(t.collection.and);
    return { next: 5, text: t.collection.hintLevel5(name, missing) };
  }
  const next = Math.max(1, level + 1);
  const target = next; // níveis 2 a 4 pedem 2, 3 e 4 modos
  const done = modesDone(columns).filter((mode) => mode.done).length;
  const missing = Math.max(1, target - done);
  const step = LEVEL_STEPS[next - 1];
  return { next, text: t.collection.hintNext(name, missing, step.phrase) };
}

export type HistoricalLike = {
  pt?: string; tipo?: string; reg?: string; sub?: string; ini?: number; fim?: number; cap?: string; sucessor?: string; fato?: string;
};
export const HISTORICAL_TYPES: Record<string, { label: string; plural: string }> = t.collection.types;
export const historicalTypeLabel = (tipo?: string) => (tipo ? HISTORICAL_TYPES[tipo]?.label ?? tipo : "");
export function historicalPeriod(entity: { ini?: number; fim?: number } | undefined) {
  if (!entity || entity.ini === undefined) return "";
  return entity.fim === undefined ? `${entity.ini}–` : `${entity.ini}–${entity.fim}`;
}
