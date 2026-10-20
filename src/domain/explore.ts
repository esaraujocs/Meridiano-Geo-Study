// Explorar (20/10/2026, pedido do Enzo: "os modos de mapa precisam de uma opção de acessar livre com os nomes aparentes", em todos os modos que usam o
// mapa): o mapa sem tempo, sem moedas e sem rodadas, com os nomes e as capitais à vista e a ficha do lugar tocado. Regras puras: quem vira rótulo,
// onde cada um cabe sem atropelar outro (do maior para o menor, então ampliar mostra mais nomes), a busca e o zoom para ir a um lugar.
import type { Legacy } from "./types";
import { normalizeTyped } from "./typed-answer.js";

export type ExploreUnit = {
  id: string;
  name: string;
  /** Ponto do rótulo, [lng, lat]. */
  at: [number, number];
  area: number;
  capital?: string;
  /** Onde fica a capital, [lng, lat] (sem ele, a capital só aparece na ficha). */
  capitalAt?: [number, number];
  /** Tamanho do rótulo: os maiores lugares em destaque. */
  tier: "big" | "mid" | "small";
  /** O que a busca compara (nome, outras grafias e a capital, sem acento). */
  keys: string[];
};

/** Os lugares com rótulo: os do mapa (ou do tabuleiro) que têm ponto e nome, do maior para o menor. O terço de cima por área tem rótulo médio e o
 *  primeiro décimo, grande (vale para o mundo e para os estados de um país). */
export function exploreUnits(data: Legacy, ids: readonly string[], capitals: Readonly<Record<string, readonly [number, number]>>): ExploreUnit[] {
  const rows = ids.flatMap((id) => {
    const meta = data.meta[id];
    if (!meta?.ll || !meta.pt || meta.absorvido || meta.mapa === false) return [];
    const at: [number, number] = [meta.ll[1], meta.ll[0]];
    const capitalAt = capitals[id];
    return [{
      id, name: meta.pt, at, area: meta.area ?? 0,
      ...(meta.cap ? { capital: meta.cap } : {}),
      ...(capitalAt && meta.cap ? { capitalAt: [capitalAt[0], capitalAt[1]] as [number, number] } : {}),
      keys: [...new Set([meta.pt, meta.en, ...(meta.al ?? []), meta.cap].filter((value): value is string => Boolean(value)).map(normalizeTyped))],
    }];
  }).sort((a, b) => b.area - a.area || a.name.localeCompare(b.name));
  return rows.map((row, index) => ({ ...row, tier: index < Math.ceil(rows.length * 0.1) ? "big" : index < Math.ceil(rows.length * 0.33) ? "mid" : "small" }));
}

export type Box = { x: number; y: number; w: number; h: number };
export type Placed = { id: string; kind: "name" | "capital"; x: number; y: number };

/** Onde cada rótulo cabe: o lugar escolhido primeiro (sempre que estiver na tela), depois os nomes do maior para o menor e as capitais por último; quem
 *  encostaria num já posto (com folga de `gap` px) ou sairia da tela fica de fora. `project` dá o ponto na tela (NaN fica de fora: a Antártida no
 *  polo projeta para o infinito no Mercator); `size` dá a largura e a altura de cada rótulo. O nome fica centrado no ponto; a capital, com o ponto
 *  à esquerda do nome. */
export function placeLabels({ units, project, size, width, height, selected, names = true, capitals = false, margin = 4, gap = 3 }: {
  units: readonly ExploreUnit[];
  project: (at: [number, number]) => { x: number; y: number };
  size: (id: string, kind: "name" | "capital") => { w: number; h: number } | null;
  width: number;
  height: number;
  selected?: string | null;
  names?: boolean;
  capitals?: boolean;
  margin?: number;
  gap?: number;
}): Placed[] {
  const boxes: Box[] = [];
  const out: Placed[] = [];
  const free = (box: Box) =>
    box.x >= margin && box.y >= margin && box.x + box.w <= width - margin && box.y + box.h <= height - margin
    && !boxes.some((other) => !(box.x + box.w + gap < other.x || other.x + other.w + gap < box.x || box.y + box.h + gap < other.y || other.y + other.h + gap < box.y));
  const tryPut = (unit: ExploreUnit, kind: "name" | "capital") => {
    const at = kind === "name" ? unit.at : unit.capitalAt;
    if (!at) return;
    const point = project(at);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const dims = size(unit.id, kind);
    if (!dims) return;
    const box = kind === "name"
      ? { x: point.x - dims.w / 2, y: point.y - dims.h / 2, w: dims.w, h: dims.h }
      : { x: point.x - 4, y: point.y - dims.h / 2, w: dims.w, h: dims.h };
    if (!free(box)) return;
    boxes.push(box);
    out.push({ id: unit.id, kind, x: box.x, y: box.y });
  };
  const first = selected ? units.find((unit) => unit.id === selected) : undefined;
  if (first) { tryPut(first, "name"); if (capitals) tryPut(first, "capital"); }
  if (names) for (const unit of units) if (unit !== first) tryPut(unit, "name");
  if (capitals) for (const unit of units) if (unit !== first) tryPut(unit, "capital");
  return out;
}

/** A busca: começo do nome (ou de outra grafia, ou da capital) primeiro, depois quem contém o texto; sem acento e sem diferenciar maiúsculas. */
export function searchUnits(units: readonly ExploreUnit[], query: string, limit = 6): ExploreUnit[] {
  const needle = normalizeTyped(query);
  if (!needle) return [];
  const score = (unit: ExploreUnit) => {
    if (unit.keys[0] === needle) return 0;
    if (unit.keys.some((key) => key === needle)) return 1;
    if (unit.keys.some((key) => key.startsWith(needle))) return 2;
    if (unit.keys.some((key) => key.split(" ").some((word) => word.startsWith(needle)))) return 3;
    if (unit.keys.some((key) => key.includes(needle))) return 4;
    return null;
  };
  return units.map((unit) => ({ unit, rank: score(unit) }))
    .filter((item): item is { unit: ExploreUnit; rank: number } => item.rank !== null)
    .sort((a, b) => a.rank - b.rank || b.unit.area - a.unit.area)
    .slice(0, limit)
    .map((item) => item.unit);
}

/** O zoom para ir a um lugar pela área (a Rússia perto do zoom 1,7; a Bélgica perto do 5; Mônaco, no 7,5). */
export const zoomForArea = (area: number) => Math.min(7.5, Math.max(1.5, 10 - 1.15 * Math.log10(Math.max(1, area))));

/** A longitude na cópia do mundo mais perto do centro da câmera (perto do antimeridiano, Fiji aparece do lado em que se está olhando). */
export const wrapNear = (lng: number, center: number) => lng + 360 * Math.round((center - lng) / 360);
