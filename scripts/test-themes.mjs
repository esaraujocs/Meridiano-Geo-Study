import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_THEME,
  THEMES,
  isThemeId,
  isThemeOwned,
  missingCoins,
  resolveTheme,
  themeAttributes,
  themeById,
  themeUnlockKey,
} from "../.tmp-themes/themes.js";

// Catálogo: ids únicos, um único padrão grátis, o resto com preço.
assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length, "ids únicos");
assert.equal(THEMES[0].id, DEFAULT_THEME, "o padrão vem primeiro");
assert.deepEqual(THEMES.filter((theme) => theme.cost === 0).map((theme) => theme.id), [DEFAULT_THEME], "só o padrão é grátis");
assert.ok(THEMES.filter((theme) => theme.id !== DEFAULT_THEME).every((theme) => Number.isInteger(theme.cost) && theme.cost >= 1000), "os outros têm preço inteiro");
assert.ok(THEMES.every((theme) => theme.swatches.length === 4 && theme.swatches.every((color) => /^#[0-9A-Fa-f]{6}$/.test(color))), "4 cores hex por tema");
assert.ok(THEMES.every((theme) => theme.name && theme.tagline), "nome e descrição");
assert.ok(THEMES.every((theme) => (theme.wash) === ["aquarela", "fusion", "brush-wash"].includes(theme.treat)), "manchas só nos tratamentos com aquarela");

// Ids: chave de desbloqueio e validação.
assert.equal(themeUnlockKey("aquarela"), "theme:aquarela");
assert.ok(isThemeId("atlas") && !isThemeId("nao-existe") && !isThemeId(null) && !isThemeId(3));
assert.equal(themeById("nao-existe"), undefined);

// Posse: o padrão sempre é do jogador; os outros só com a chave comprada.
assert.ok(isThemeOwned(DEFAULT_THEME, []));
assert.ok(!isThemeOwned("aquarela", []));
assert.ok(!isThemeOwned("aquarela", ["rounds:20", "theme:atlas"]));
assert.ok(isThemeOwned("aquarela", ["theme:aquarela"]));
assert.ok(!isThemeOwned("nao-existe", ["theme:nao-existe"]), "id fora do catálogo nunca é do jogador");

// Tema guardado: vale só se for do jogador; senão, padrão.
assert.equal(resolveTheme("aquarela", ["theme:aquarela"]), "aquarela");
assert.equal(resolveTheme("aquarela", []), DEFAULT_THEME, "sem ter comprado, volta ao padrão");
assert.equal(resolveTheme("lixo", ["theme:lixo"]), DEFAULT_THEME);
assert.equal(resolveTheme(null, []), DEFAULT_THEME);
assert.equal(resolveTheme(undefined, ["theme:aquarela"]), DEFAULT_THEME);

// Moedas que faltam.
assert.equal(missingCoins(12000, 28893), 0);
assert.equal(missingCoins(12000, 9000), 3000);
assert.equal(missingCoins(6000, 6000), 0);

// Atributos que o CSS lê.
assert.deepEqual(themeAttributes("atelie"), { theme: "atelie", treat: "brush-wash", wash: "1" });
assert.deepEqual(themeAttributes("listras"), { theme: "listras", treat: "brush-h", wash: "0" });
assert.deepEqual(themeAttributes("nao-existe"), { theme: DEFAULT_THEME, treat: "tint", wash: "0" }, "id inválido usa o padrão");

// O CSS tem uma paleta por tema e um bloco por tratamento (nada de tema sem estilo).
const css = readFileSync(new URL("../src/themes.css", import.meta.url), "utf8");
for (const theme of THEMES) assert.ok(css.includes(`:root[data-theme="${theme.id}"]`), `paleta de ${theme.id} em themes.css`);
for (const treat of new Set(THEMES.map((theme) => theme.treat))) assert.ok(css.includes(`[data-treat="${treat}"]`), `tratamento ${treat} em themes.css`);

console.log(`themes: ${THEMES.length} temas, ${new Set(THEMES.map((theme) => theme.treat)).size} tratamentos, preços ${THEMES.filter((t) => t.cost).map((t) => t.cost / 1000 + "k").join(" ")} — ok`);
