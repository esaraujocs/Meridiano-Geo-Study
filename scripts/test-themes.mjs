import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEAGUES } from "../.tmp-themes/league.js";
import { DEFAULT_MAP_PALETTE, graticuleLines } from "../.tmp-themes/map-palette.js";
import {
  DEFAULT_THEME,
  LEAGUE_THEMES,
  SHOP_THEMES,
  THEMES,
  THEME_TIERS,
  TIER_PRICES,
  isLeagueTheme,
  leagueThemesFor,
  mapPaletteFor,
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
assert.deepEqual(SHOP_THEMES.filter((theme) => theme.cost === 0).map((theme) => theme.id), [DEFAULT_THEME], "só o padrão é grátis entre os da Loja");
assert.ok(SHOP_THEMES.filter((theme) => theme.id !== DEFAULT_THEME).every((theme) => Number.isInteger(theme.cost) && theme.cost >= 1000), "os outros da Loja têm preço inteiro");
assert.equal(SHOP_THEMES.length + LEAGUE_THEMES.length, THEMES.length, "cada tema é da Loja ou de liga");
// faixas: todo tema da Loja tem uma, e o preço cabe nela (simples 0–16 mil, pintados 24–40 mil, elaborados 80–160 mil, prestígio 250–400 mil)
assert.deepEqual([...THEME_TIERS], ["simple", "painted", "elaborate", "prestige"]);
for (const theme of SHOP_THEMES) {
  assert.ok(THEME_TIERS.includes(theme.tier), theme.id + " tem faixa");
  const [low, high] = TIER_PRICES[theme.tier];
  assert.ok(theme.cost >= low && theme.cost <= high, `${theme.id}: ${theme.cost} fora da faixa ${theme.tier} (${low}–${high})`);
}
assert.ok(LEAGUE_THEMES.every((theme) => theme.tier === undefined), "tema de liga não tem faixa de preço");
assert.ok(TIER_PRICES.simple[1] < TIER_PRICES.painted[0] && TIER_PRICES.painted[1] < TIER_PRICES.elaborate[0] && TIER_PRICES.elaborate[1] < TIER_PRICES.prestige[0], "as faixas não se misturam");
assert.ok(LEAGUE_THEMES.length >= 1 && LEAGUE_THEMES.every((theme) => isLeagueTheme(theme) && theme.cost === 0 && LEAGUES.includes(theme.league) && theme.league !== "bronze"), "tema de liga não tem preço e é de uma liga depois do Bronze");
assert.equal(new Set(LEAGUE_THEMES.map((theme) => theme.league)).size, LEAGUE_THEMES.length, "no máximo um tema por liga");
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

// Tema de liga: só é do jogador com o desbloqueio dado ao entrar na liga (custo 0 não significa grátis)
assert.ok(!isThemeOwned("prata", []) && !isThemeOwned("prata", ["theme:atlas", "rounds:20"]));
assert.ok(isThemeOwned("prata", ["theme:prata"]));
assert.equal(resolveTheme("prata", []), DEFAULT_THEME, "sem ter chegado à Prata, volta ao padrão");
assert.equal(resolveTheme("prata", ["theme:prata"]), "prata");
// os temas a que a melhor liga dá direito (Bronze = 0 ... Mestre = 5); quem passou da liga do tema continua com ele
assert.deepEqual(leagueThemesFor(0).map((theme) => theme.id), []);
assert.deepEqual(leagueThemesFor(1).map((theme) => theme.id), ["prata"]);
assert.deepEqual(leagueThemesFor(5).map((theme) => theme.id), ["prata"]);

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
assert.deepEqual(themeAttributes("prata"), { theme: "prata", treat: "prata", wash: "0" });

// Mapa em jogo: o padrão é o de sempre; o tema muda oceano, terra, costas e marcadores e pode ligar a quadrícula
assert.deepEqual(mapPaletteFor(DEFAULT_THEME), DEFAULT_MAP_PALETTE);
assert.deepEqual(mapPaletteFor(undefined), DEFAULT_MAP_PALETTE);
assert.deepEqual(mapPaletteFor("nao-existe"), DEFAULT_MAP_PALETTE);
assert.equal(DEFAULT_MAP_PALETTE.graticule, null);
const prata = mapPaletteFor("prata");
assert.ok(prata.ocean !== DEFAULT_MAP_PALETTE.ocean && prata.land !== DEFAULT_MAP_PALETTE.land && prata.outline !== DEFAULT_MAP_PALETTE.outline && prata.graticule);
assert.ok(Object.values(prata).every((color) => /^#[0-9A-Fa-f]{6}$/.test(color)), "todas as cores do mapa da Prata são hex");
const lines = graticuleLines(30);
assert.equal(lines.features.length, 13 + 5, "13 meridianos (−180 a 180) e 5 paralelos (−60 a 60)");
assert.ok(lines.features.every((line) => line.geometry.type === "LineString" && line.geometry.coordinates.length > 30));

// O CSS tem uma paleta por tema e um bloco por tratamento (nada de tema sem estilo).
const css = readFileSync(new URL("../src/themes.css", import.meta.url), "utf8") + readFileSync(new URL("../src/themes-league.css", import.meta.url), "utf8");
for (const theme of THEMES) assert.ok(css.includes(`:root[data-theme="${theme.id}"]`), `paleta de ${theme.id} nos CSS dos temas`);
for (const treat of new Set(THEMES.map((theme) => theme.treat))) assert.ok(css.includes(`[data-treat="${treat}"]`), `tratamento ${treat} nos CSS dos temas`);
for (const theme of LEAGUE_THEMES) for (const file of [`../src/assets/themes/${theme.id}-compass.svg`]) if (theme.id === "prata") assert.ok(readFileSync(new URL(file, import.meta.url), "utf8").includes("<svg"), file + " existe");

console.log(`themes: ${THEMES.length} temas, ${new Set(THEMES.map((theme) => theme.treat)).size} tratamentos, preços ${THEMES.filter((t) => t.cost).map((t) => t.cost / 1000 + "k").join(" ")} — ok`);
