import * as maplibregl from "maplibre-gl";
import { faunaOpacity, faunaScale } from "../domain/map-fauna-scale";
import { MAP_STYLES, isMapStyleId, roseSvg } from "../domain/map-styles";

// Rosas dos ventos do estilo de mapa equipado (Mecenato): como a fauna do Cartógrafo, cada uma fica ANCORADA num ponto do mar e cresce e encolhe com o mapa
// (mesma escala de map-fauna-scale.ts), sem clique. Devolve a função que as tira (a chamar antes de `map.remove()`).
export function addMapOrnaments(map: maplibregl.Map, styleId: string | undefined): () => void {
  if (!isMapStyleId(styleId)) return () => undefined;
  const style = MAP_STYLES[styleId];
  if (!style.roses.length) return () => undefined;
  const container = map.getContainer();
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(roseSvg(style))}`;
  const markers = style.roses.map(([lng, lat, px]) => {
    const element = document.createElement("div");
    element.className = "map-ornament";
    element.setAttribute("aria-hidden", "true");
    const image = new Image();
    image.alt = "";
    image.draggable = false;
    image.src = src;
    image.style.width = image.style.height = `calc(var(--ornament-k, 1) * ${px}px)`;
    element.appendChild(image);
    return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
  });
  const update = () => {
    const zoom = map.getZoom();
    container.style.setProperty("--ornament-k", String(faunaScale(zoom)));
    container.style.setProperty("--ornament-fade", String(faunaOpacity(zoom)));
  };
  map.on("zoom", update);
  update();
  return () => {
    map.off("zoom", update);
    markers.forEach((marker) => marker.remove());
    container.style.removeProperty("--ornament-k");
    container.style.removeProperty("--ornament-fade");
  };
}
