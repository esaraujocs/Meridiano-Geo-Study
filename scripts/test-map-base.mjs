// O fundo do mapa das partidas (map-base.ts): a escolha guardada, a paleta com o satélite e o relevo e a opacidade da terra.
import assert from "node:assert/strict";
import { DEFAULT_MAP_PALETTE } from "../.tmp-map-base/map-palette.js";
import { MAP_BASES, MAP_BASE_TILES, MAP_BASE_THEME, isSatellite, landOpacityPaint, mapBaseBorderLayers, readMapBase, withMapBase } from "../.tmp-map-base/map-base.js";

const store = (value) => ({ getItem: () => value });
assert.equal(readMapBase(store(null)), "padrao");
assert.equal(readMapBase(store("relevo")), "relevo");
assert.equal(readMapBase(store("qualquer")), "padrao", "valor desconhecido volta ao padrão");
assert.equal(readMapBase({ getItem: () => { throw new Error("sem armazenamento"); } }), "padrao");
assert.equal(readMapBase(undefined), "padrao");

// o padrão não mexe na paleta; todo fundo que não é o padrão tem ladrilhos
assert.equal(withMapBase(DEFAULT_MAP_PALETTE, "padrao"), DEFAULT_MAP_PALETTE);
for (const base of MAP_BASES) assert.equal(Boolean(MAP_BASE_TILES[base]), base !== "padrao", base);
for (const url of Object.values(MAP_BASE_TILES)) assert.match(url, /\{z\}\/\{x\}\/\{y\}\.webp$/);
// só o Satélite + Noturno troca a interface
assert.deepEqual(Object.keys(MAP_BASE_THEME), ["satelite-noturno"]);
assert.ok(isSatellite("satelite") && isSatellite("satelite-noturno") && !isSatellite("relevo") && !isSatellite("padrao"));

// satélite: a terra some (só os marcados acendem), sem sombra das costas, quadrícula, linhas de rumo e traço; acerto e erro intactos
const sat = withMapBase({ ...DEFAULT_MAP_PALETTE, coast: "#123456", graticule: "#ffffff", ink: { color: "#000", width: 1, opacity: 1 } }, "satelite");
assert.equal(sat.landOpacity, 0);
assert.ok(sat.landMarkedOpacity > 0.5 && sat.landOpacityNear > 0);
assert.equal(sat.coast, null); assert.equal(sat.graticule, null); assert.equal(sat.rhumb, null); assert.equal(sat.ink, null);
assert.equal(sat.answer, DEFAULT_MAP_PALETTE.answer); assert.equal(sat.wrong, DEFAULT_MAP_PALETTE.wrong);
// relevo: a terra fica translúcida por cima da foto e volta à opacidade da paleta de perto; o resto da paleta fica
const rel = withMapBase(DEFAULT_MAP_PALETTE, "relevo");
assert.ok(rel.landOpacity < DEFAULT_MAP_PALETTE.landOpacity);
assert.equal(rel.landOpacityNear, DEFAULT_MAP_PALETTE.landOpacity);
assert.equal(rel.ocean, DEFAULT_MAP_PALETTE.ocean); assert.equal(rel.coast, DEFAULT_MAP_PALETTE.coast);

// a opacidade da terra: sem os campos novos, um número; com eles, por zoom, e os marcados com a opacidade própria
assert.equal(landOpacityPaint(DEFAULT_MAP_PALETTE, [["==", 1, 1]]), DEFAULT_MAP_PALETTE.landOpacity);
const paint = landOpacityPaint(sat, [["==", ["get", "carta_id"], "76"]]);
assert.equal(paint[0], "interpolate");
assert.deepEqual(paint[4], ["case", ["==", ["get", "carta_id"], "76"], sat.landMarkedOpacity, 0]);
assert.deepEqual(paint[6], ["case", ["==", ["get", "carta_id"], "76"], sat.landMarkedOpacity, sat.landOpacityNear]);
assert.deepEqual(landOpacityPaint(sat, []), ["interpolate", ["linear"], ["zoom"], 6, 0, 8.5, sat.landOpacityNear]);
// as linhas sobre a foto: contorno escuro largo por baixo e traço claro fino por cima; nada no padrão
assert.deepEqual(mapBaseBorderLayers("padrao", DEFAULT_MAP_PALETTE), []);
for (const base of ["satelite", "relevo"]) {
  const [casing, core] = mapBaseBorderLayers(base, DEFAULT_MAP_PALETTE);
  assert.equal(casing.id, "map-base-casing"); assert.equal(core.id, "map-base-borders");
  assert.ok(casing.width[0] > core.width[0] && casing.width[1] > core.width[1], "o contorno é mais largo que o traço");
  assert.match(core.color, /^#[0-9a-f]{6}$/i);
}
assert.equal(withMapBase(DEFAULT_MAP_PALETTE, "relevo").outline, "rgba(0,0,0,0)", "no relevo o contorno de 1 px da terra sai (as linhas novas o substituem)");
console.log("map base: escolha, paletas, opacidade da terra e linhas verificadas");
