import type { CSSProperties } from "react";

// Navios e criaturas do mar por cima do mapa (só decoração, sem clique): o tema Cartógrafo espalha figuras nórdicas pelo oceano do mapa-múndi.
// As figuras ficam presas à tela, nos vãos de oceano da câmera do Mundo, e somem sozinhas quando o mapa é aproximado ou arrastado (o mapa-game
// escreve `--art-fade` no elemento do mapa), para nunca cobrirem um país. Desenhos gerados por `scripts/build-cartografo-assets.mjs`.
const FIGURES = import.meta.glob("../assets/themes/cartografo-fauna-*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const figureUrl = (id: string) => FIGURES[`../assets/themes/cartografo-fauna-${id}.svg`];

/** Posição em px a partir do centro do mapa (a câmera do Mundo fica centrada e com zoom fixo, então o oceano fica no mesmo lugar em qualquer janela), largura em px. */
type Placement = { id: string; dx: number; dy: number; w: number; flip?: boolean };
const FAUNA: Record<string, readonly Placement[]> = {
  cartografo: [
    { id: "kraken", dx: -122, dy: -146, w: 88 },
    { id: "snekkja", dx: -50, dy: 135, w: 100, flip: true },
    { id: "hafgufa", dx: -29, dy: 271, w: 108 },
    { id: "drakkar", dx: -576, dy: -81, w: 118 },
    { id: "galeao", dx: -576, dy: 236, w: 108 },
    { id: "sjoorm", dx: -367, dy: 257, w: 150, flip: true },
    { id: "knarr", dx: 288, dy: 164, w: 100, flip: true },
    { id: "jormungandr", dx: 216, dy: 279, w: 104 },
    { id: "nykur", dx: 562, dy: 297, w: 86, flip: true },
    { id: "narval", dx: 619, dy: -81, w: 120 },
    { id: "peixe", dx: -432, dy: 63, w: 104 },
  ],
};

/** As figuras do tema, ou nada (tema sem figuras, ou recorte que não é o Mundo inteiro: a disposição vale só para a câmera do Mundo). */
export const hasMapFauna = (themeId: string | undefined, world: boolean) => Boolean(world && themeId && FAUNA[themeId]);

export function MapFauna({ themeId, world }: { themeId: string | undefined; world: boolean }) {
  if (!hasMapFauna(themeId, world)) return null;
  return (
    <div className="map-fauna" aria-hidden="true">
      {FAUNA[themeId as string].map((item) => (
        <img
          key={item.id}
          src={figureUrl(item.id)}
          alt=""
          draggable={false}
          style={{ left: `calc(50% + ${item.dx}px)`, top: `calc(50% + ${item.dy}px)`, width: item.w, transform: item.flip ? "translate(-50%, -50%) scaleX(-1)" : "translate(-50%, -50%)" } as CSSProperties}
        />
      ))}
    </div>
  );
}
