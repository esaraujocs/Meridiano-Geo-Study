// Família Brasil (os 26 estados e o Distrito Federal): os dados de public/data/brasil/ (catálogo, divisas, bandeiras e silhuetas), as regras
// (variantes, recortes, câmera, preço, moedas, dificuldade, Mesa, estatísticas, fora do domínio) e o mapa dos estados (public/maps/brasil-hd.pmtiles:
// quem responde por pontos conhecidos, ilhas oceânicas incluídas). Uso: npm run test:brasil
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const states = JSON.parse(await readFile("public/data/brasil/states.json", "utf8"));
const flags = JSON.parse(await readFile("public/data/brasil/flags.json", "utf8"));
const shapes = JSON.parse(await readFile("public/data/brasil/shapes.json", "utf8"));
const ids = Object.keys(states.states);

// ---- catálogo: 27 unidades, nas 5 regiões do IBGE, com nomes nos 3 idiomas e capitais
assert.equal(ids.length, 27);
const rows = Object.entries(states.states);
for (const [id, row] of rows) {
  assert.equal(id, `br-${row.sigla.toLowerCase()}`, `${id}: id = br-<sigla>`);
  for (const locale of ["pt", "en", "es"]) assert.ok(row.name[locale]?.trim(), `${id}: nome em ${locale}`);
  assert.ok(row.capital.trim(), `${id}: capital`);
  assert.ok(row.area > 0, `${id}: área`);
  const [west, south, east, north] = row.bbox;
  assert.ok(west < east && south < north && west >= -74.1 && east <= -34.7 && south >= -33.8 && north <= 5.3, `${id}: caixa dentro do Brasil continental (${row.bbox})`);
  assert.ok(row.ll[1] > west && row.ll[1] < east && row.ll[0] > south && row.ll[0] < north, `${id}: ponto do rótulo dentro da caixa`);
}
assert.equal(new Set(rows.map(([, row]) => row.sigla)).size, 27, "siglas sem repetição");
assert.equal(new Set(rows.map(([, row]) => row.code)).size, 27, "códigos do IBGE sem repetição");
const byRegion = (region) => rows.filter(([, row]) => row.region === region).map(([id]) => id).sort();
assert.deepEqual(byRegion("norte"), ["br-ac", "br-am", "br-ap", "br-pa", "br-ro", "br-rr", "br-to"]);
assert.deepEqual(byRegion("nordeste"), ["br-al", "br-ba", "br-ce", "br-ma", "br-pb", "br-pe", "br-pi", "br-rn", "br-se"]);
assert.deepEqual(byRegion("centro-oeste"), ["br-df", "br-go", "br-ms", "br-mt"]);
assert.deepEqual(byRegion("sudeste"), ["br-es", "br-mg", "br-rj", "br-sp"]);
assert.deepEqual(byRegion("sul"), ["br-pr", "br-rs", "br-sc"]);
const capital = (sigla) => states.states[`br-${sigla}`].capital;
assert.equal(capital("df"), "Brasília"); assert.equal(capital("to"), "Palmas"); assert.equal(capital("ma"), "São Luís"); assert.equal(capital("sc"), "Florianópolis"); assert.equal(capital("es"), "Vitória");
assert.deepEqual(states.states["br-ma"].capAl, ["São Luiz"], "a grafia antiga de São Luís vale na escrita");
assert.equal(states.states["br-df"].name.en, "Federal District");
assert.equal(states.states["br-ba"].name.es, "Bahía"); assert.equal(states.states["br-ro"].name.es, "Rondonia"); assert.equal(states.states["br-rs"].name.es, "Río Grande del Sur");

// ---- divisas: simétricas, 51 pares, todo estado com vizinho; as curtas também (o DF encosta em Minas por ~2,6 km)
let pairs = 0;
for (const [id, row] of rows) {
  assert.ok(row.borders.length > 0, `${id}: sem vizinho`);
  for (const other of row.borders) assert.ok(states.states[other]?.borders.includes(id), `divisa ${id}-${other} só de um lado`);
  pairs += row.borders.length;
}
assert.equal(pairs / 2, 51, "51 pares de estados vizinhos");
const borders = (sigla) => [...states.states[`br-${sigla}`].borders].sort();
assert.deepEqual(borders("df"), ["br-go", "br-mg"]);
assert.deepEqual(borders("rs"), ["br-sc"]);
assert.deepEqual(borders("ap"), ["br-pa"]);
assert.deepEqual(borders("am"), ["br-ac", "br-mt", "br-pa", "br-ro", "br-rr"]);
assert.deepEqual(borders("sp"), ["br-mg", "br-ms", "br-pr", "br-rj"]);
assert.equal(borders("ba").length, 8); assert.equal(borders("mg").length, 7);

// ---- bandeiras: as 27, em domínio público, no formato do acervo do mapa-múndi, leves
assert.deepEqual(Object.keys(flags.flags).sort(), [...ids].sort());
let flagBytes = 0;
for (const id of ids) {
  const value = flags.flags[id];
  assert.ok(value.startsWith("svg:<svg") || /^data:image\/(webp|png);base64,/.test(value), `${id}: bandeira em formato conhecido`);
  if (value.startsWith("svg:")) assert.match(/<svg\b[^>]*>/.exec(value)[0], /\swidth="[\d.e+]+"[\s\S]*\sheight="[\d.e+]+"|\sheight="[\d.e+]+"[\s\S]*\swidth="[\d.e+]+"/, `${id}: o SVG tem largura e altura na raiz`);
  assert.match(flags.sources[id].license, /public domain/i, `${id}: licença`);
  assert.ok(flags.ratio[id] > 0.6 && flags.ratio[id] < 0.75, `${id}: proporção ${flags.ratio[id]}`);
  flagBytes += value.length;
}
assert.ok(flagBytes < 400_000, `bandeiras com ${flagBytes} bytes`);

// ---- silhuetas: as 27, inteiras (antes da correção de 06/10 o Amazonas e o Pará perdiam pedaços na emenda da grade do mapa HD)
assert.deepEqual(Object.keys(shapes).sort(), [...ids].sort());
const boxOf = (geometry) => {
  const points = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flat(2);
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
};
for (const id of ids) {
  assert.ok(["Polygon", "MultiPolygon"].includes(shapes[id].type), `${id}: silhueta poligonal`);
  boxOf(shapes[id]).forEach((value, index) => assert.ok(Math.abs(value - states.states[id].bbox[index]) < 0.05, `${id}: silhueta e caixa do estado batem`));
}
assert.ok(boxOf(shapes["br-am"])[2] > -57, "o Amazonas chega à divisa com o Pará");
assert.ok(boxOf(shapes["br-pa"])[2] > -48.5, "o Pará chega ao Maranhão");

// ---- regras (domínio compilado à parte)
const out = join(tmpdir(), "carta-cega-brasil-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const sources = ["brasil", "regions", "spoils", "pace", "economy-rules", "match-config", "mode-stats", "dominated", "pillars", "supplies", "flag-configuration"].map((name) => `src/domain/${name}.ts`);
execFileSync("node_modules/.bin/tsc", [...sources, "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"]);
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const [brasil, regions, spoils, pace, economy, matchConfig, modeStats, dominated, pillars, supplies] = await Promise.all(
  ["brasil", "regions", "spoils", "pace", "economy-rules", "match-config", "mode-stats", "dominated", "pillars", "supplies"].map(load));

const pt = brasil.brasilCatalog(states, "pt");
const es = brasil.brasilCatalog(states, "es");
const en = brasil.brasilCatalog(states, "en");
assert.deepEqual(pt.data.mapEntityIds.sort(), [...ids].sort());
assert.equal(pt.data.meta["br-sp"].pt, "São Paulo"); assert.equal(pt.data.meta["br-sp"].cca3, "SP"); assert.equal(pt.data.meta["br-sp"].fl, "br-sp"); assert.equal(pt.data.meta["br-sp"].reg, "sudeste");
assert.deepEqual([...pt.data.meta["br-df"].borders].sort(), ["GO", "MG"], "as divisas viram siglas (como o cca3 dos países)");
assert.equal(es.data.meta["br-ba"].pt, "Bahía", "o nome no idioma da interface");
// os nomes que a escrita aceita: pt (o do idioma da interface), en e al (os outros, sem repetir)
const accepted = (meta) => [meta.pt, meta.en, ...(meta.al ?? [])];
assert.ok(accepted(es.data.meta["br-ba"]).includes("Bahia"), "e o nome em português vale na escrita");
assert.ok(accepted(es.data.meta["br-rj"]).includes("Rio de Janeiro"));
assert.equal(en.data.meta["br-df"].pt, "Federal District"); assert.ok(accepted(en.data.meta["br-df"]).includes("Distrito Federal"));
assert.ok(accepted(pt.data.meta["br-df"]).includes("Federal District"), "em português o nome em inglês também vale");
assert.deepEqual(pt.data.meta["br-ma"].capAl, ["São Luiz"]);

// variantes: cada uma joga com as regras do modo equivalente do mapa-múndi
assert.deepEqual(brasil.BRASIL_VARIANTS.map((variant) => brasil.baseVariant(variant)), ["mapa", "capital-pais", "silhueta-opcoes", "silhueta", "nome-bandeira", "bandeira-nome", "pais-capital", "escrita-pais", "escrita-capital"]);
assert.equal(brasil.baseVariant("mapa"), "mapa"); assert.equal(brasil.isBrasilVariant("br-mapa"), true); assert.equal(brasil.isBrasilVariant("mapa"), false);
for (const variant of brasil.BRASIL_VARIANTS) {
  const base = brasil.baseVariant(variant);
  assert.equal(pace.timerSecondsFor(variant), pace.timerSecondsFor(base), `${variant}: o tempo do modo equivalente`);
  assert.equal(spoils.baseCoins(variant), Math.round(spoils.baseCoins(base) * 0.75), `${variant}: 3/4 das moedas do modo equivalente`);
}

// recortes: o Brasil inteiro e as 5 regiões, à parte dos do mapa-múndi
assert.deepEqual(regions.normalizeRegionSelection(["norte", "nordeste", "centro-oeste", "sudeste", "sul"]), ["brasil"]);
assert.deepEqual(regions.normalizeRegionSelection(["sul", "brasil"]), ["brasil"]);
assert.deepEqual(regions.normalizeRegionSelection(["sul", "norte"]), ["norte", "sul"]);
assert.deepEqual(regions.normalizeRegionSelection("mundo"), ["mundo"], "o mapa-múndi segue igual");
assert.equal(regions.regionLabel("nordeste"), "Nordeste"); assert.equal(regions.regionLabel("brasil"), "Brasil"); assert.equal(regions.regionLabel(["norte", "sul"]), "2 recortes");
assert.equal(regions.regionMatches({ reg: "sul" }, "sul"), true); assert.equal(regions.regionMatches({ reg: "sul" }, "norte"), false); assert.equal(regions.regionMatches({ reg: "sul" }, "brasil"), true);
assert.equal(regions.regionMatches({ reg: "Europe" }, "brasil"), false, "país do mapa-múndi não entra no recorte Brasil");
assert.equal(regions.regionMatches({ reg: "sul" }, "europa"), false);
assert.equal(regions.regionSelectionIncludes("brasil", "sul"), true);
assert.deepEqual(regions.BR_REGION_ITEMS.map(([key]) => key), ["brasil", "norte", "nordeste", "centro-oeste", "sudeste", "sul"]);
assert.equal(brasil.brasilIdsIn(pt, "brasil").length, 27); assert.equal(brasil.brasilIdsIn(pt, "nordeste").length, 9); assert.equal(brasil.brasilIdsIn(pt, ["norte", "sul"]).length, 10);
assert.equal(brasil.brasilIdsIn(pt, "mundo").length, 27, "sem recorte do Brasil, o país inteiro");
assert.deepEqual(brasil.brasilBounds(pt, brasil.brasilIdsIn(pt, "brasil")).map((value) => Math.round(value)), [-74, -34, -35, 5], "a câmera enquadra o Brasil continental");
assert.deepEqual(brasil.brasilBounds(pt, brasil.brasilIdsIn(pt, "sul")).map((value) => Math.round(value)), [-58, -34, -48, -23]);

// dificuldade: sem população, pela área (os grandes rendem menos, os pequenos mais)
assert.equal(spoils.entityTier(pt.data.meta, "br-am"), 1); assert.equal(spoils.entityTier(pt.data.meta, "br-pa"), 1);
assert.equal(spoils.entityTier(pt.data.meta, "br-df"), 3); assert.equal(spoils.entityTier(pt.data.meta, "br-se"), 3);
const tiers = ids.map((id) => spoils.entityTier(pt.data.meta, id));
assert.deepEqual([1, 2, 3].map((tier) => tiers.filter((value) => value === tier).length), [9, 9, 9], "um terço em cada faixa");

// preço: o mapa dos estados é grátis, as bandeiras são um modo só nos dois sentidos
assert.equal(economy.policyFor("brasil", "br-mapa", "brasil").cost, 0);
assert.equal(economy.policyFor("brasil", "br-nome-bandeira", "brasil").key, "brasil:br-bandeira-nome");
assert.ok(brasil.BRASIL_VARIANTS.every((variant) => economy.policyFor("brasil", variant, "brasil")), "todo modo tem preço");

// Mesa: 8 modos; o de bandeiras vale os dois sentidos e não engole os outros modos da família (que têm a mesma família do motor)
const modes = matchConfig.modesFor("brasil");
assert.equal(modes.length, 8);
assert.equal(matchConfig.selectedMode("brasil", "brasil", "br-bandeira-nome").key, "br-bandeiras");
assert.equal(matchConfig.selectedMode("brasil", "brasil", "br-nome-bandeira").key, "br-bandeiras");
for (const variant of ["br-mapa", "br-capital-mapa", "br-silhueta-opcoes", "br-silhueta", "br-escrita-estado", "br-estado-capital", "br-escrita-capital"]) {
  assert.equal(matchConfig.selectedMode("brasil", "brasil", variant).key, variant, `${variant}: o próprio modo`);
}
assert.equal(matchConfig.selectedMode("bandeiras", "bandeiras", "bandeira-nome").key, "atuais", "as bandeiras do mapa-múndi seguem iguais");
assert.ok(matchConfig.paceHint("training", "br-mapa").includes("estado"), "no Treino o estado perguntado fica marcado");
assert.deepEqual(matchConfig.variantContextFor("brasil", "br-silhueta"), { family: "brasil", variant: "br-silhueta" });
assert.equal(matchConfig.variantContextFor("brasil", "mapa"), null);

// estatísticas do modo de bandeiras: só as sessões de bandeira do Brasil
const flagMode = modes.find((mode) => mode.key === "br-bandeiras");
assert.equal(modeStats.sessionInMode({ family: "brasil", variant: "br-bandeira-nome" }, flagMode), true);
assert.equal(modeStats.sessionInMode({ family: "brasil", variant: "br-mapa" }, flagMode), false);

// fora do domínio, dos pilares e da Bússola de continentes (a Bússola mostra a região)
assert.equal(dominated.OUTSIDE_DOMAIN_FAMILIES.has("brasil"), true);
assert.equal(pillars.pillarOfSession({ family: "brasil", variant: "br-mapa", mode: "br-mapa" }), null);
assert.equal(supplies.compassGroup(pt.data.meta["br-ba"]), "nordeste");
const hint = supplies.neighborHint(pt.data.meta, "br-df");
assert.ok(hint && !hint.sea && ["br-go", "br-mg"].includes(hint.id), "a Pista de vizinhos acha a divisa");
assert.equal(supplies.neighborHint(pt.data.meta, "br-rs")?.id, "br-sc");

// ---- mapa dos estados
const FILE = "public/maps/brasil-hd.pmtiles";
const bytes = await readFile(FILE);
const manifest = JSON.parse(await readFile("public/maps/brasil-hd.manifest.json", "utf8"));
assert.equal(bytes.byteLength, manifest.bytes, "tamanho = manifesto");
assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256, "hash = manifesto");
assert.deepEqual([...manifest.entities].sort(), [...ids].sort(), "o mapa tem os 27 e só eles");
const offline = await readFile("src/domain/offline-map.ts", "utf8");
assert.equal(Number(/BRASIL_MAP_BYTES = ([\d_]+)/.exec(offline)[1].replaceAll("_", "")), bytes.byteLength, "BRASIL_MAP_BYTES em offline-map.ts");
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const archive = new PMTiles({ getKey: () => FILE, getBytes: async (offset, length) => ({ data: buffer.slice(offset, offset + length) }) });
const header = await archive.getHeader();
const Z = header.maxZoom;
const world = (lon, lat) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * 2 ** Z, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** Z];
};
const inside = (rings, x, y) => {
  let hit = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};
async function ownerAt(lon, lat) {
  const [wx, wy] = world(lon, lat);
  const tile = await archive.getZxy(Z, Math.floor(wx), Math.floor(wy));
  if (!tile) return null;
  const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
  const x = (wx - Math.floor(wx)) * layer.extent; const y = (wy - Math.floor(wy)) * layer.extent;
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    if (feature.type === 3 && inside(feature.loadGeometry(), x, y)) return String(feature.properties.carta_id);
  }
  return null;
}
const probes = [
  ["São Paulo (cidade)", -46.63, -23.55, "br-sp"], ["Brasília", -47.88, -15.79, "br-df"], ["Rio de Janeiro", -43.2, -22.9, "br-rj"], ["Manaus", -60.02, -3.1, "br-am"],
  ["Ilhabela", -45.35, -23.8, "br-sp"], ["Florianópolis, na ilha", -48.55, -27.6, "br-sc"], ["Ilha de Marajó", -49.5, -0.9, "br-pa"], ["Ilha do Bananal", -50.2, -11.0, "br-to"],
  ["Fernando de Noronha", -32.42, -3.85, "br-pe"], ["Trindade", -29.32, -20.51, "br-es"], ["São Pedro e São Paulo", -29.346, 0.917, "br-pe"],
  ["Assunção, fora do Brasil", -57.6, -25.3, null], ["Atlântico", -30, -10, null],
];
for (const [label, lon, lat, expected] of probes) assert.equal(await ownerAt(lon, lat), expected, label);
for (const [id, row] of rows) assert.equal(await ownerAt(row.ll[1], row.ll[0]), id, `${id}: o ponto do rótulo cai no próprio estado`);

console.log(`brasil: 27 estados, 51 divisas, ${Math.round(flagBytes / 1000)} kB de bandeiras, silhuetas inteiras, regras e ${probes.length + rows.length} pontos do mapa conferidos`);
