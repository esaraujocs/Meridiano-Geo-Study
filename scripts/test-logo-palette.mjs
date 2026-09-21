import assert from "node:assert/strict";
import { DEFAULT_LOGO_PALETTE, LOGO_PALETTES, readLogoPalette, resolveLogoPalette, setLogoPalette, subscribeLogoPalette } from "../.tmp-logo-palette/logo-palette.js";

// Contraste WCAG entre duas cores hex (1 = iguais, 21 = preto e branco).
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Paletas: ids únicos, todas as cores em hex, padrão é a primeira.
const ids = LOGO_PALETTES.map((palette) => palette.id);
assert.equal(new Set(ids).size, ids.length, "ids repetidos");
assert.equal(DEFAULT_LOGO_PALETTE, ids[0]);
for (const palette of LOGO_PALETTES) {
  for (const key of ["tile", "outline", "sclera", "iris", "grid", "dot", "ring"]) {
    assert.match(palette[key], /^#[0-9A-Fa-f]{6}$/, `${palette.id}.${key}`);
  }
  assert.ok(palette.label.length > 0);
  assert.ok(contrast(palette.outline, palette.tile) >= 1.8, `${palette.id}: contorno some no fundo`);
  assert.ok(contrast(palette.outline, palette.sclera) >= 1.8, `${palette.id}: contorno some no branco do olho`);
  assert.ok(contrast(palette.sclera, palette.iris) >= 3, `${palette.id}: globo some no branco do olho`);
  assert.ok(contrast(palette.grid, palette.iris) >= 1.8, `${palette.id}: meridianos somem no globo`);
  assert.ok(contrast(palette.dot, palette.iris) >= 1.4, `${palette.id}: ponto some no globo`);
}

// Id desconhecido ou vazio cai no padrão.
assert.equal(resolveLogoPalette("nao-existe").id, DEFAULT_LOGO_PALETTE);
assert.equal(resolveLogoPalette(null).id, DEFAULT_LOGO_PALETTE);
assert.equal(resolveLogoPalette(undefined).id, DEFAULT_LOGO_PALETTE);
assert.equal(resolveLogoPalette("bege").id, "bege");

// Armazenamento: lê, grava, avisa quem assina e ignora id inválido.
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, String(value)); } };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
assert.equal(readLogoPalette(), DEFAULT_LOGO_PALETTE, "sem nada salvo, vale o padrão");
let calls = 0;
const unsubscribe = subscribeLogoPalette(() => { calls += 1; });
setLogoPalette("carvao-terracota");
assert.equal(readLogoPalette(), "carvao-terracota");
assert.equal(calls, 1);
setLogoPalette("lixo");
assert.equal(readLogoPalette(), DEFAULT_LOGO_PALETTE, "id inválido volta ao padrão");
unsubscribe();
setLogoPalette("bege");
assert.equal(calls, 2, "não avisa depois de cancelar a assinatura");
store.set("carta-cega:logo-palette", "valor-antigo-quebrado");
assert.equal(readLogoPalette(), DEFAULT_LOGO_PALETTE);

console.log("logo palette: palettes, fallback and storage verified");
