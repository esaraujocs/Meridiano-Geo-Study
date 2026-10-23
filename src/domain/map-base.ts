// O fundo do mapa das partidas (10/10/2026, mock hub-v38; pedido do Enzo: o satélite estático do Huge Quiz, "por enquanto nas configurações, depois
// pensamos na economia ou até se pode ser o padrão"). A foto é a Blue Marble Next Generation da NASA (agosto de 2004, com relevo e batimetria;
// domínio público, crédito "NASA Earth Observatory"), reprojetada para o Mercator do mapa, por baixo das nossas fronteiras (que continuam
// vetoriais e nítidas), em ladrilhos de 512 px (zooms 0–5). Vale só no mapa-múndi (os tabuleiros de país e de época ficam como estão). Lógica pura.
//   padrao            o mapa de sempre (a paleta do tema ou do estilo de mapa);
//   satelite          a foto inteira: a terra fica transparente e só os países marcados acendem; as fronteiras viram um traço claro e fino;
//   satelite-noturno  o mesmo mapa com a interface do Noturno (o app não tem modo escuro à parte: o escuro é o tema Noturno);
//   relevo            só a terra da foto (o mar recortado), apagada e tingida pela terra da paleta; o mar, as costas e o traço continuam os da paleta;
//   natural           a cobertura do solo desenhada (23/10/2026, o modo mapa do Google Earth): areia, cerrado, campo, floresta e gelo em cores suaves,
//                     tirados da mesma foto (scripts/map-base/build-natural.py), o mar azul-claro e as fronteiras num cinza.
import { mixHex, type MapPalette } from "./map-palette.js";

export type MapBase = "padrao" | "natural" | "satelite" | "satelite-noturno" | "relevo";
export const MAP_BASES: readonly MapBase[] = ["padrao", "natural", "satelite", "satelite-noturno", "relevo"];
export const MAP_BASE_KEY = "carta-map-base";
export const isMapBase = (value: unknown): value is MapBase => typeof value === "string" && (MAP_BASES as readonly string[]).includes(value);
export const isSatellite = (base: MapBase) => base === "satelite" || base === "satelite-noturno";
/** A imagem cobre a terra inteira (satélite e natural): a terra da paleta fica transparente e saem a fauna e os ornamentos do tema. */
export const coversLand = (base: MapBase) => isSatellite(base) || base === "natural";
/** O natural: o mar, a terra que decide a cor dos rótulos (a terra mesmo vem da imagem) e o cinza das fronteiras. */
export const NATURAL = { ocean: "#aacde3", land: "#e2e8cc", border: "#7d877e", division: "#98a198" } as const;

export function readMapBase(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): MapBase {
  try {
    const saved = storage?.getItem(MAP_BASE_KEY);
    return isMapBase(saved) ? saved : "padrao";
  } catch { return "padrao"; }
}

/** A projeção do mapa (23/10/2026, pedido do Enzo, em teste nas Opções): plana (o Mercator de sempre) ou o globo do MapLibre, em que a Groenlândia
 *  aparece no tamanho certo perto da África. Vale no mapa da partida e no Explorar; o Travel segue plano. */
export type MapProjection = "plana" | "globo";
export const MAP_PROJECTIONS: readonly MapProjection[] = ["plana", "globo"];
export const MAP_PROJECTION_KEY = "carta-map-projection";
export function readMapProjection(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): MapProjection {
  try { return storage?.getItem(MAP_PROJECTION_KEY) === "globo" ? "globo" : "plana"; } catch { return "plana"; }
}

/** O zoom em que o globo inteiro ocupa ~92% do lado menor da tela (no globo do MapLibre o diâmetro é 512·2^zoom/π px); o zoom do recorte Mundo
 *  foi feito para o plano e deixava o globo com metade da altura. */
export function globeFitZoom(width: number, height: number): number {
  const side = Math.max(200, Math.min(width, height)) * 0.92;
  return Math.log2((side * Math.PI) / 512);
}

/** As costas e fronteiras sobre a foto (10/10/2026; o Enzo: "a cor das linhas dos países contrastou mal com o Saara"): um contorno escuro largo
 *  por baixo e um traço claro fino por cima, que se lê tanto no deserto claro quanto na floresta escura. No relevo o traço claro é o contorno
 *  da paleta, clareado. */
export function mapBaseBorderLayers(base: MapBase, palette: MapPalette): { id: string; color: string; opacity: number; width: [number, number] }[] {
  if (base === "padrao") return [];
  if (base === "natural") return [{ id: "map-base-borders", color: NATURAL.border, opacity: 0.9, width: [0.5, 1.2] }];
  const core = isSatellite(base) ? "#ffffff" : mixHex(palette.outline.startsWith("#") ? palette.outline : "#4c8890", "#ffffff", 0.45);
  return [
    { id: "map-base-casing", color: "#06121a", opacity: isSatellite(base) ? 0.5 : 0.55, width: [1.6, 3.2] },
    { id: "map-base-borders", color: core, opacity: isSatellite(base) ? 0.78 : 0.85, width: [0.5, 1.1] },
  ];
}

/** O tema da interface que o fundo pede por cima do escolhido (o Satélite + Noturno); sem pedido, vale o do jogador. */
export const MAP_BASE_THEME: Partial<Record<MapBase, string>> = { "satelite-noturno": "noturno" };

/** Os ladrilhos da foto (512 px, zooms 0–5 do MapLibre, em public/maps/sat; o service worker guarda cada um na primeira vez e depois valem sem
 *  internet). Uma imagem só de 8192 px (a 1ª versão) só era nítida até o zoom 4; com os ladrilhos a fonte de 2 km/pixel rende até o zoom ~5,4. */
export const MAP_BASE_TILES: Partial<Record<MapBase, string>> = {
  satelite: "/maps/sat/bm/{z}/{x}/{y}.webp",
  "satelite-noturno": "/maps/sat/bm/{z}/{x}/{y}.webp",
  relevo: "/maps/sat/bm-terra/{z}/{x}/{y}.webp",
  natural: "/maps/sat/natural/{z}/{x}/{y}.webp",
};
export const MAP_BASE_MAXZOOM = 5;
export const MAP_BASE_CREDIT = "Blue Marble: NASA Earth Observatory";
/** Além do zoom ~5,4 a foto amacia: entre estes zooms ela some aos poucos e a terra da paleta volta. */
export const MAP_BASE_NEAR: readonly [number, number] = [6, 8.5];

/** A paleta com o fundo: o satélite apaga a terra (só os marcados acendem), a sombra das costas, a quadrícula, as linhas de rumo e o traço; o relevo
 *  só deixa a terra translúcida por cima da foto. */
export function withMapBase(palette: MapPalette, base: MapBase): MapPalette {
  if (isSatellite(base)) return { ...palette, landOpacity: 0, landOpacityNear: 0.6, landMarkedOpacity: 0.85, outline: "rgba(0,0,0,0)", coast: null, graticule: null, rhumb: null, ink: null };
  // o natural não some de perto: desenhado em cores chapadas, ampliado ele só fica mais macio
  if (base === "natural") return { ...palette, ocean: NATURAL.ocean, land: NATURAL.land, landOpacity: 0, landOpacityNear: undefined, landMarkedOpacity: 0.85, outline: "rgba(0,0,0,0)", coast: null, graticule: null, rhumb: null, ink: null };
  if (base === "relevo") return { ...palette, landOpacity: 0.42, landOpacityNear: palette.landOpacity, landMarkedOpacity: 0.85, outline: "rgba(0,0,0,0)" };
  return palette;
}

/** A pintura da camada da foto (raster): no relevo apagada; nos dois, some aos poucos de perto. */
export function mapBaseRasterPaint(base: MapBase): Record<string, unknown> {
  if (base === "natural") return { "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear" };
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
