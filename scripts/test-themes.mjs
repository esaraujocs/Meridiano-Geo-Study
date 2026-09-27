import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEAGUES } from "../.tmp-themes/league.js";
import { COAST_BANDS, DEFAULT_MAP_PALETTE, coastBands, graticuleLines, mixHex, rhumbLines } from "../.tmp-themes/map-palette.js";
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
assert.deepEqual(themeAttributes("atelie"), { theme: "atelie", treat: "brush-wash", wash: "1", scheme: "light" });
assert.deepEqual(themeAttributes("listras"), { theme: "listras", treat: "brush-h", wash: "0", scheme: "light" });
assert.deepEqual(themeAttributes("nao-existe"), { theme: DEFAULT_THEME, treat: "tint", wash: "0", scheme: "light" }, "id inválido usa o padrão");
assert.deepEqual(themeAttributes("prata"), { theme: "prata", treat: "prata", wash: "0", scheme: "light" });
assert.deepEqual(themeAttributes("noturno"), { theme: "noturno", treat: "noturno", wash: "0", scheme: "dark" }, "tema escuro liga o esquema escuro");
assert.deepEqual(themeAttributes("cartografo"), { theme: "cartografo", treat: "cartografo", wash: "0", scheme: "light" }, "o Cartógrafo é claro");

// Mapa em jogo: o padrão é o de sempre; o tema muda oceano, terra, costas e marcadores e pode ligar a quadrícula
assert.deepEqual(mapPaletteFor(DEFAULT_THEME), DEFAULT_MAP_PALETTE);
assert.deepEqual(mapPaletteFor(undefined), DEFAULT_MAP_PALETTE);
assert.deepEqual(mapPaletteFor("nao-existe"), DEFAULT_MAP_PALETTE);
assert.equal(DEFAULT_MAP_PALETTE.graticule, null);
const prata = mapPaletteFor("prata");
assert.ok(prata.ocean !== DEFAULT_MAP_PALETTE.ocean && prata.land !== DEFAULT_MAP_PALETTE.land && prata.outline !== DEFAULT_MAP_PALETTE.outline && prata.graticule);
assert.ok(Object.values(prata).filter((value) => typeof value === "string").every((color) => /^#[0-9A-Fa-f]{6}$/.test(color)), "todas as cores do mapa da Prata são hex");
assert.equal(DEFAULT_MAP_PALETTE.graticuleOpacity, 0.2);
const noturno = mapPaletteFor("noturno");
assert.ok(noturno.graticule && noturno.graticuleOpacity > 0 && noturno.graticuleOpacity <= 1 && noturno.ocean !== DEFAULT_MAP_PALETTE.ocean, "o Noturno tem mapa próprio, com quadrícula");
assert.ok(Object.values(noturno).filter((value) => typeof value === "string").every((color) => /^#[0-9A-Fa-f]{6}$/.test(color)), "e as cores são hex");
// Cartógrafo: o primeiro mapa claro (terra opaca, acerto e erro em tons mais fundos, sombra nas costas e linhas de rumo)
const cartografo = mapPaletteFor("cartografo");
const isHex = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);
assert.ok(cartografo.landOpacity === 1 && DEFAULT_MAP_PALETTE.landOpacity < 1, "terra opaca só no tema claro");
assert.ok(cartografo.answer !== DEFAULT_MAP_PALETTE.answer && cartografo.wrong !== DEFAULT_MAP_PALETTE.wrong && cartografo.coast && cartografo.rhumb, "acerto, erro, costa e rumos próprios");
assert.ok(Object.values(cartografo).filter((value) => typeof value === "string").every(isHex) && isHex(cartografo.rhumb.color), "cores hex");
assert.ok([DEFAULT_MAP_PALETTE, prata, noturno].every((palette) => isHex(palette.answer) && isHex(palette.wrong)), "toda paleta tem acerto e erro");
assert.equal(DEFAULT_MAP_PALETTE.coast, null);
assert.equal(DEFAULT_MAP_PALETTE.rhumb, null);
assert.deepEqual(coastBands(DEFAULT_MAP_PALETTE), [], "sem sombra de costa, sem faixas");
const bands = coastBands(cartografo);
assert.equal(bands.length, COAST_BANDS.length);
assert.equal(bands[0].color, mixHex(cartografo.ocean, cartografo.coast, 0.3));
assert.equal(bands[2].color, cartografo.coast.toLowerCase(), "a faixa junto à terra é a cor cheia");
assert.ok(bands[0].w5 > bands[1].w5 && bands[1].w5 > bands[2].w5, "da mais larga à mais fina");
assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
assert.equal(mixHex("#102030", "#304050", 0.5), "#203040");
const rhumbs = rhumbLines(cartografo.rhumb.hubs);
assert.equal(rhumbs.features.length, cartografo.rhumb.hubs.length * 16, "16 rumos por rosa dos ventos");
assert.ok(rhumbs.features.every((line) => line.geometry.coordinates.length === 2 && line.geometry.coordinates.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 85)), "cada rumo cabe no mundo");
const [hubLon, hubLat] = cartografo.rhumb.hubs[0];
assert.ok(rhumbs.features.slice(0, 16).every((line) => line.geometry.coordinates[0][0] === hubLon && line.geometry.coordinates[0][1] === hubLat), "todos partem da rosa dos ventos");
const east = rhumbs.features[0].geometry.coordinates[1];
assert.ok(Math.abs(east[1] - hubLat) < 1e-6 && east[0] > hubLon, "o rumo 0 vai para leste na mesma latitude");
const lines = graticuleLines(30);
assert.equal(lines.features.length, 13 + 5, "13 meridianos (−180 a 180) e 5 paralelos (−60 a 60)");
assert.ok(lines.features.every((line) => line.geometry.type === "LineString" && line.geometry.coordinates.length > 30));

// O CSS tem uma paleta por tema e um bloco por tratamento (nada de tema sem estilo).
const css = ["themes", "themes-league", "themes-dark", "themes-elaborate"].map((name) => readFileSync(new URL(`../src/${name}.css`, import.meta.url), "utf8")).join("\n");
for (const theme of THEMES) assert.ok(css.includes(`:root[data-theme="${theme.id}"]`), `paleta de ${theme.id} nos CSS dos temas`);
for (const treat of new Set(THEMES.map((theme) => theme.treat))) assert.ok(css.includes(`[data-treat="${treat}"]`), `tratamento ${treat} nos CSS dos temas`);
for (const id of ["prata", "noturno", "cartografo"]) assert.ok(readFileSync(new URL(`../src/assets/themes/${id}-compass.svg`, import.meta.url), "utf8").includes("<svg"), id + ": rosa dos ventos existe");
// Cartógrafo: ornamentos e figuras do mar existem (um arquivo por figura, gerados por scripts/build-cartografo-assets.mjs)
for (const name of ["compass-dark", "paper", "corner-tl", "corner-tr", "corner-bl", "corner-br"]) assert.ok(readFileSync(new URL(`../src/assets/themes/cartografo-${name}.svg`, import.meta.url), "utf8").includes("<svg"), name + ": ornamento existe");
const faunaIds = ["drakkar", "snekkja", "knarr", "galeao", "sjoorm", "jormungandr", "kraken", "hafgufa", "narval", "nykur", "peixe"];
const fauna = JSON.parse(readFileSync(new URL("../src/assets/themes/cartografo-fauna.json", import.meta.url), "utf8"));
assert.deepEqual(fauna.map((item) => item.id).sort(), [...faunaIds].sort(), "o catálogo tem as 11 figuras, sem repetir");
for (const item of fauna) {
  assert.ok(readFileSync(new URL(`../src/assets/themes/cartografo-fauna-${item.id}.svg`, import.meta.url), "utf8").startsWith("<svg"), item.id + ": figura existe");
  assert.ok(Math.abs(item.lng) <= 180 && Math.abs(item.lat) <= 60, item.id + ": ancorada num ponto do mundo");
  assert.ok(item.px >= 40 && item.px <= 110, `${item.id}: pequena no mapa-múndi (${item.px} px)`);
  assert.ok(item.aspect > 0.3 && item.aspect < 1.2 && typeof item.flip === "boolean", item.id + ": proporção e espelhamento");
}
// tamanho fixo em px: o catálogo só guarda a largura, sem regra de zoom (as figuras não crescem nem somem com o zoom)
assert.ok(fauna.every((item) => !("scale" in item) && !("fade" in item)), "o catálogo não tem regra de escala");
// elaborados: preço na faixa e mapa próprio
for (const theme of SHOP_THEMES.filter((item) => item.tier === "elaborate" || item.tier === "prestige")) assert.ok(theme.map && theme.map.graticule !== undefined, theme.id + " (elaborado) muda o mapa em jogo");

console.log(`themes: ${THEMES.length} temas, ${new Set(THEMES.map((theme) => theme.treat)).size} tratamentos, preços ${THEMES.filter((t) => t.cost).map((t) => t.cost / 1000 + "k").join(" ")} — ok`);
