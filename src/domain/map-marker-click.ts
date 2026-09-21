export type MarkerClickFeature = {
  properties?: {
    carta_id?: string | number | null;
    answer_id?: string | number | null;
  } | null;
};

// Alcance dos marcadores, em px de tela. Sem limite, um país grande "caía" no marcador vizinho
// (Irã em Bahrein, Indonésia em Singapura, Malásia em Brunei).
export const MARKER_DOT_PX = 4; // dentro do desenho do ponto: foi o ponto que o jogador tocou
export const MARKER_TOUCH_PX = 14; // raio de toque de dedo em água aberta
export const MARKER_OVER_LAND_PX = 9; // sobre o terreno de OUTRO país só vale o núcleo do ponto

export type MarkerCandidate = {
  answerId: string;
  distancePx: number;
  coordinates?: [number, number];
};

export function markerWinsClick(
  markerDistancePx: number,
  markerAnswerId: string,
  landAnswerId: string,
) {
  const overOtherLand = landAnswerId !== "" && landAnswerId !== markerAnswerId;
  return markerDistancePx <= (overOtherLand ? MARKER_OVER_LAND_PX : MARKER_TOUCH_PX);
}

// Ordem: (1) tocou no desenho do ponto; (2) o país sob o toque tem marcador próprio ao alcance
// (Catar não é roubado pelo ponto do Bahrein a poucos px); (3) marcador perto o bastante, com o
// alcance menor sobre terreno de outro país; (4) senão vale o terreno (ou a água).
export function chooseClickAnswer(markers: MarkerCandidate[], landAnswerId: string) {
  const reachable = markers
    .filter((item) => item.answerId !== "" && item.distancePx <= MARKER_TOUCH_PX)
    .sort((a, b) => a.distancePx - b.distancePx);
  const nearest = reachable[0];
  if (nearest && nearest.distancePx <= MARKER_DOT_PX) return { answerId: nearest.answerId, marker: nearest };
  const own = landAnswerId ? reachable.find((item) => item.answerId === landAnswerId) : undefined;
  if (own) return { answerId: own.answerId, marker: own };
  if (nearest && markerWinsClick(nearest.distancePx, nearest.answerId, landAnswerId)) {
    return { answerId: nearest.answerId, marker: nearest };
  }
  return { answerId: landAnswerId, marker: undefined };
}

// Território absorvido (Guadalupe, Martinica...) responde pelo soberano (answer_id).
export function resolveMarkerClick(
  feature: MarkerClickFeature,
  targetId: string,
) {
  const value = feature.properties?.answer_id ?? feature.properties?.carta_id;
  const answerId = value === null || value === undefined ? "" : String(value);
  return { answerId, correct: answerId !== "" && answerId === targetId };
}
