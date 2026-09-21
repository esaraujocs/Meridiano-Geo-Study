// Toque no mar: qual território está mais perto do toque e a que distância o toque ficou de um território. Lógica pura.

/** Alcance, em px de tela, de um toque em água aberta: perto o bastante de um território vale como toque nele. */
export const SEA_TAP_PX = 22;

export type Position = [number, number];
export type GeoLike = { type: string; coordinates: unknown };
export type ScreenProject = (lngLat: Position) => { x: number; y: number };

const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.195;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pontos, linhas abertas e anéis de qualquer geometria (o que importa para a distância) e os polígonos (para saber se o toque caiu dentro).
function shapesOf(geometry: GeoLike) {
  const points: Position[] = [];
  const lines: Position[][] = [];
  const polygons: Position[][][] = [];
  const walk = (node: GeoLike) => {
    const c = node.coordinates as any;
    if (node.type === "Point") points.push(c as Position);
    else if (node.type === "MultiPoint") points.push(...(c as Position[]));
    else if (node.type === "LineString") lines.push(c as Position[]);
    else if (node.type === "MultiLineString") lines.push(...(c as Position[][]));
    else if (node.type === "Polygon") polygons.push(c as Position[][]);
    else if (node.type === "MultiPolygon") polygons.push(...(c as Position[][][]));
    else if (node.type === "GeometryCollection") for (const inner of ((node as unknown as { geometries?: GeoLike[] }).geometries ?? [])) walk(inner);
  };
  walk(geometry);
  return { points, lines, polygons };
}

// ---- distância em pixels de tela (escolher o território mais perto de um toque na água)
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Menor distância, em px, do toque (x, y) à geometria projetada na tela. Testa também as cópias do mundo
 * (±360° de longitude) quando a primeira não chega ao `limit`, para toques perto da linha de data.
 */
export function geometryDistancePx(geometry: GeoLike, project: ScreenProject, x: number, y: number, limit = Infinity) {
  const { points, lines, polygons } = shapesOf(geometry);
  const paths = [...lines, ...polygons.flat()];
  let best = Infinity;
  for (const shift of [0, -360, 360]) {
    if (shift !== 0 && best <= limit) break;
    const at = (position: Position) => project([position[0] + shift, position[1]]);
    for (const point of points) { const p = at(point); best = Math.min(best, Math.hypot(p.x - x, p.y - y)); }
    for (const path of paths) {
      let previous = path.length ? at(path[0]) : null;
      if (previous && path.length === 1) best = Math.min(best, Math.hypot(previous.x - x, previous.y - y));
      for (let index = 1; index < path.length; index += 1) {
        const current = at(path[index]);
        best = Math.min(best, segmentDistance(x, y, previous!.x, previous!.y, current.x, current.y));
        previous = current;
      }
    }
  }
  return best;
}

export type NearestCandidate = { answerId: string; geometry: GeoLike };

/** O candidato mais perto do toque, se estiver dentro do alcance (empate: o primeiro da lista). */
export function nearestWithin(candidates: readonly NearestCandidate[], project: ScreenProject, x: number, y: number, radiusPx = SEA_TAP_PX) {
  let best: { answerId: string; distancePx: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.answerId) continue;
    const distancePx = geometryDistancePx(candidate.geometry, project, x, y, radiusPx);
    if (distancePx <= radiusPx && (!best || distancePx < best.distancePx)) best = { answerId: candidate.answerId, distancePx };
  }
  return best;
}

// ---- distância em km do toque ao território pedido (erro do jogador)
function ringContains(ring: Position[], lng: number, lat: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Distância mínima, em km, do ponto (lng, lat) até as geometrias: 0 se cair dentro de um polígono, senão a
 * distância até a borda (ou ponto) mais perto. Sem nenhuma geometria com vértices: null.
 */
export function distanceToGeometriesKm(geometries: readonly GeoLike[], lng: number, lat: number): number | null {
  const cosLat = Math.max(0.05, Math.cos(rad(lat)));
  const local = (position: Position): Position => {
    let dl = position[0] - lng;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    return [dl * cosLat * KM_PER_DEGREE, (position[1] - lat) * KM_PER_DEGREE];
  };
  const back = (x: number, y: number): Position => [lng + x / (cosLat * KM_PER_DEGREE), lat + y / KM_PER_DEGREE];
  const toPoint = (x: number, y: number) => { const [pl, pt] = back(x, y); return haversineKm(lat, lng, pt, pl); };
  let best = Infinity;
  for (const geometry of geometries) {
    const { points, lines, polygons } = shapesOf(geometry);
    for (const polygon of polygons) {
      const [outer, ...holes] = polygon;
      if (outer && ringContains(outer, lng, lat) && !holes.some((hole) => ringContains(hole, lng, lat))) return 0;
    }
    for (const point of points) { const [x, y] = local(point); best = Math.min(best, toPoint(x, y)); }
    for (const path of [...lines, ...polygons.flat()]) {
      if (path.length === 1) { const [x, y] = local(path[0]); best = Math.min(best, toPoint(x, y)); }
      for (let index = 1; index < path.length; index += 1) {
        const [ax, ay] = local(path[index - 1]);
        const [bx, by] = local(path[index]);
        const dx = bx - ax;
        const dy = by - ay;
        const length2 = dx * dx + dy * dy;
        const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / length2));
        best = Math.min(best, toPoint(ax + t * dx, ay + t * dy));
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}
