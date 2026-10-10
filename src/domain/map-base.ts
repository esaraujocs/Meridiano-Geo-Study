// O fundo do mapa das partidas (10/10/2026, mock hub-v38; pedido do Enzo: o satélite estático do Huge Quiz, "por enquanto nas configurações, depois
// pensamos na economia ou até se pode ser o padrão"). A foto é a Blue Marble Next Generation da NASA (agosto de 2004, com relevo e batimetria;
// domínio público, crédito "NASA Earth Observatory"), reprojetada para o Mercator do mapa, 8192 px, por baixo das nossas fronteiras (que continuam
// vetoriais e nítidas). Vale só no mapa-múndi (os tabuleiros de país e de época ficam como estão). Lógica pura.
//   padrao            o mapa de sempre (a paleta do tema ou do estilo de mapa);
//   satelite          a foto inteira: a terra fica transparente e só os países marcados acendem; as fronteiras viram um traço claro e fino;
//   satelite-noturno  o mesmo mapa com a interface do Noturno (o app não tem modo escuro à parte: o escuro é o tema Noturno);
//   relevo            só a terra da foto (o mar recortado), apagada e tingida pela terra da paleta; o mar, as costas e o traço continuam os da paleta.
import type { MapPalette } from "./map-palette.js";

export type MapBase = "padrao" | "satelite" | "satelite-noturno" | "relevo";
export const MAP_BASES: readonly MapBase[] = ["padrao", "satelite", "satelite-noturno", "relevo"];
export const MAP_BASE_KEY = "carta-map-base";
export const isMapBase = (value: unknown): value is MapBase => typeof value === "string" && (MAP_BASES as readonly string[]).includes(value);
export const isSatellite = (base: MapBase) => base === "satelite" || base === "satelite-noturno";

export function readMapBase(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): MapBase {
  try {
    const saved = storage?.getItem(MAP_BASE_KEY);
    return isMapBase(saved) ? saved : "padrao";
  } catch { return "padrao"; }
}

/** O tema da interface que o fundo pede por cima do escolhido (o Satélite + Noturno); sem pedido, vale o do jogador. */
export const MAP_BASE_THEME: Partial<Record<MapBase, string>> = { "satelite-noturno": "noturno" };

/** As imagens (em public/maps/sat; o service worker guarda na primeira partida e depois vale sem internet). */
export const MAP_BASE_IMAGE: Partial<Record<MapBase, string>> = {
  satelite: "/maps/sat/blue-marble-200408-8192.webp",
  "satelite-noturno": "/maps/sat/blue-marble-200408-8192.webp",
  relevo: "/maps/sat/blue-marble-200408-terra-8192.webp",
};
/** Os cantos da imagem no Mercator (o quadrado do mapa: ±85,0511° de latitude). */
export const MAP_BASE_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]];
export const MAP_BASE_CREDIT = "Blue Marble: NASA Earth Observatory";
/** De perto a foto (8192 px ≈ zoom 5) amacia: entre estes zooms ela some aos poucos e a terra da paleta volta. */
export const MAP_BASE_NEAR: readonly [number, number] = [6, 9];

/** A paleta com o fundo: o satélite apaga a terra (só os marcados acendem), a sombra das costas, a quadrícula, as linhas de rumo e o traço; o relevo
 *  só deixa a terra translúcida por cima da foto. */
export function withMapBase(palette: MapPalette, base: MapBase): MapPalette {
  if (isSatellite(base)) return { ...palette, landOpacity: 0, landOpacityNear: 0.6, landMarkedOpacity: 0.85, outline: "rgba(0,0,0,0)", coast: null, graticule: null, rhumb: null, ink: null };
  if (base === "relevo") return { ...palette, landOpacity: 0.42, landOpacityNear: palette.landOpacity, landMarkedOpacity: 0.85 };
  return palette;
}

/** A pintura da camada da foto (raster): no relevo apagada; nos dois, some aos poucos de perto. */
export function mapBaseRasterPaint(base: MapBase): Record<string, unknown> {
  const fade = ["interpolate", ["linear"], ["zoom"], MAP_BASE_NEAR[0], 1, MAP_BASE_NEAR[1], isSatellite(base) ? 0.35 : 0.4];
  return { "raster-opacity": fade, "raster-fade-duration": 0, "raster-resampling": "linear", ...(base === "relevo" ? { "raster-saturation": -0.45, "raster-contrast": -0.08 } : {}) };
}

/** A opacidade da terra (`fill-opacity`): os países que casam com uma das condições (acerto, erro, dicas) com `landMarkedOpacity`, os outros com a da
 *  paleta, que de perto vai até `landOpacityNear`. Sem os dois campos, só `landOpacity`. */
export function landOpacityPaint(palette: MapPalette, conditions: readonly unknown[]): unknown {
  const at = (rest: number) => (conditions.length && palette.landMarkedOpacity !== undefined ? ["case", ...conditions.flatMap((condition) => [condition, palette.landMarkedOpacity]), rest] : rest);
  if (palette.landOpacityNear === undefined) return at(palette.landOpacity);
  return ["interpolate", ["linear"], ["zoom"], MAP_BASE_NEAR[0], at(palette.landOpacity), MAP_BASE_NEAR[1], at(palette.landOpacityNear)];
}
