import * as maplibregl from "maplibre-gl";
import manifest from "../assets/themes/cartografo-fauna.json";
import { faunaOpacity, faunaScale } from "../domain/map-fauna-scale";

// Navios e criaturas do mar sobre o mapa (só decoração, sem clique): o tema Cartógrafo espalha figuras nórdicas pelo oceano. Cada figura é "desenhada no mar": fica
// ANCORADA num ponto do oceano (um maplibregl.Marker, que já acompanha o arrasto e o zoom sozinho) e CRESCE E ENCOLHE EXATAMENTE COMO O MAPA, então mantém sempre a mesma
// proporção em relação à geografia (o barco ao lado do Brasil é do mesmo tamanho relativo no mundo e no zoom; o Enzo pediu isso em 27/09). O traço dos desenhos tem largura
// fixa em tela (vector-effect: non-scaling-stroke), para não engrossar quando ampliam. Só somem em zoom muito alto, onde já são maiores que a tela.
// Desenhos, posições e tamanhos saem de scripts/build-cartografo-assets.mjs.
type Figure = { id: string; lng: number; lat: number; px: number; aspect: number; flip: boolean };
const FAUNA: Record<string, readonly Figure[]> = { cartografo: manifest };
const FIGURES = import.meta.glob("../assets/themes/cartografo-fauna-*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export const hasMapFauna = (themeId: string | undefined) => Boolean(themeId && FAUNA[themeId]);

/** Põe as figuras do tema no mapa; devolve a função que as tira (a chamar antes de `map.remove()`). Sem figuras no tema, não faz nada. */
export function addMapFauna(map: maplibregl.Map, themeId: string | undefined): () => void {
  const figures = themeId ? FAUNA[themeId] : undefined;
  if (!figures) return () => undefined;
  const container = map.getContainer();
  const markers = figures.map((figure) => {
    const element = document.createElement("div");
    element.className = "map-fauna-marker";
    element.setAttribute("aria-hidden", "true");
    const image = new Image();
    image.alt = "";
    image.draggable = false;
    image.src = FIGURES[`../assets/themes/cartografo-fauna-${figure.id}.svg`];
    image.style.width = `calc(var(--fauna-k, 1) * ${figure.px}px)`;
    image.style.height = `calc(var(--fauna-k, 1) * ${Math.round(figure.px * figure.aspect * 10) / 10}px)`;
    if (figure.flip) image.style.transform = "scaleX(-1)";
    element.appendChild(image);
    return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([figure.lng, figure.lat]).addTo(map);
  });
  const update = () => {
    const zoom = map.getZoom();
    container.style.setProperty("--fauna-k", String(faunaScale(zoom)));
    container.style.setProperty("--fauna-fade", String(faunaOpacity(zoom)));
  };
  map.on("zoom", update);
  update();
  return () => {
    map.off("zoom", update);
    markers.forEach((marker) => marker.remove());
    container.style.removeProperty("--fauna-k");
    container.style.removeProperty("--fauna-fade");
  };
}
