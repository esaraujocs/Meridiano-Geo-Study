// Modo "Estados e províncias" (as divisões de primeiro nível de cada país, hoje o Brasil e os EUA): para cada país do índice gerado
// (src/domain/divisions-index.ts), os dados de public/data/divisions/<país>/ (catálogo, divisas, silhuetas e bandeiras, se houver), o mapa
// public/maps/divisions-<país>.pmtiles (tamanho e hash do índice, quem responde pelos pontos conhecidos da config e pelo rótulo de cada unidade) e o
// que é próprio de cada país; depois as regras (variantes, modos jogáveis por país, recortes, legado da família "brasil", câmera, preço, moedas,
// dificuldade, Mesa, estatísticas, fora do domínio, suprimentos). Uso: npm run test:divisions
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

// ---- domínio compilado à parte (o índice vem junto, importado por divisions.ts)
const out = join(tmpdir(), "carta-cega-divisions-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const MODULES = ["divisions", "divisions-index", "regions", "spoils", "pace", "economy-rules", "match-config", "mode-stats", "dominated", "pillars", "supplies", "flag-configuration"];
execFileSync("node_modules/.bin/tsc", [...MODULES.map((name) => `src/domain/${name}.ts`), "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"]);
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const [divisions, { DIVISION_INDEX }, regions, spoils, pace, economy, matchConfig, modeStats, dominated, pillars, supplies] = await Promise.all(
  ["divisions", "divisions-index", "regions", "spoils", "pace", "economy-rules", "match-config", "mode-stats", "dominated", "pillars", "supplies"].map(load));

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const boxOf = (geometry) => {
  const points = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).flat(2);
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
};
const inside = (rings, x, y) => {
  let hit = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};
/** Quem responde por um ponto no zoom máximo do mapa do país: o id da unidade, "" (terra neutra) ou null (fora do mapa). */
async function mapReader(file) {
  const bytes = await readFile(file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const archive = new PMTiles({ getKey: () => file, getBytes: async (offset, length) => ({ data: buffer.slice(offset, offset + length) }) });
  const Z = (await archive.getHeader()).maxZoom;
  return async (lon, lat) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    const wx = ((lon + 180) / 360) * 2 ** Z; const wy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** Z;
    const tile = await archive.getZxy(Z, Math.floor(wx), Math.floor(wy));
    if (!tile) return null;
    const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
    const x = (wx - Math.floor(wx)) * layer.extent; const y = (wy - Math.floor(wy)) * layer.extent;
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      if (feature.type === 3 && inside(feature.loadGeometry(), x, y)) return String(feature.properties.carta_id);
    }
    return null;
  };
}

// ---- cada país do índice: o pacote inteiro, sem nada próprio dele
assert.deepEqual(DIVISION_INDEX.map((country) => country.id), ["br", "us"], "o índice traz o Brasil e os EUA, na ordem da Mesa");
const files = {};
let points = 0;
for (const country of DIVISION_INDEX) {
  const cc = country.id;
  const config = await json(`scripts/divisions/countries/${cc}.json`);
  const units = await json(`public/data/divisions/${cc}/units.json`);
  const shapes = await json(`public/data/divisions/${cc}/shapes.json`);
  const flags = country.flags ? await json(`public/data/divisions/${cc}/flags.json`) : null;
  files[cc] = { config, units, shapes, flags };
  const rows = Object.entries(units.units);
  const ids = rows.map(([id]) => id);

  // índice × config × pacote
  assert.equal(units.country, cc);
  assert.equal(country.carta, config.carta, `${cc}: entidade do mapa-múndi`);
  assert.deepEqual(country.name, config.name);
  assert.deepEqual(country.unit, config.unit);
  for (const locale of ["pt", "en", "es"]) assert.ok(country.unit[locale].one && country.unit[locale].many, `${cc}: palavra da unidade em ${locale}`);
  assert.deepEqual(country.regions.map((region) => region.key), Object.keys(config.regions), `${cc}: regiões na ordem da config`);
  assert.deepEqual(Object.keys(units.regions), Object.keys(config.regions));
  assert.equal(country.count, ids.length);
  assert.deepEqual([...ids].sort(), config.units.map((unit) => `${cc}-${unit.code.toLowerCase()}`).sort(), `${cc}: as unidades da lista curada`);
  for (const code of config.exclude ?? []) assert.equal(units.units[`${cc}-${code.toLowerCase()}`], undefined, `${cc}: ${code} fica de fora`);
  for (const region of country.regions) assert.equal(region.count, rows.filter(([, row]) => row.region === region.key).length, `${cc}:${region.key}: contagem do índice`);
  assert.equal(country.regions.reduce((total, region) => total + region.count, 0), ids.length, `${cc}: toda unidade numa região`);
  assert.equal(country.flags, Boolean(config.units.some((unit) => unit.flagFile)), `${cc}: bandeiras se a config lista os arquivos`);
  assert.equal(country.capitals, rows.every(([, row]) => row.capital), `${cc}: capitais`);
  if (config.frame) assert.deepEqual(country.frame, config.frame, `${cc}: enquadramento da config`);
  const [fw, fs, fe, fn] = country.frame;
  assert.ok(fw < fe && fs < fn, `${cc}: enquadramento válido`);

  // catálogo
  for (const [id, row] of rows) {
    assert.equal(id, `${cc}-${row.code.toLowerCase()}`, `${id}: id = <país>-<código>`);
    for (const locale of ["pt", "en", "es"]) assert.ok(row.name[locale]?.trim(), `${id}: nome em ${locale}`);
    if (country.capitals) assert.ok(row.capital.trim(), `${id}: capital`);
    assert.ok(row.area > 0, `${id}: área`);
    assert.ok(config.regions[row.region], `${id}: região ${row.region}`);
    const [west, south, east, north] = row.bbox;
    assert.ok(west < east && south < north, `${id}: caixa (${row.bbox})`);
    assert.ok(row.ll[1] > west && row.ll[1] < east && row.ll[0] > south && row.ll[0] < north, `${id}: ponto do rótulo dentro da caixa`);
  }
  assert.equal(new Set(rows.map(([, row]) => row.code)).size, ids.length, `${cc}: códigos sem repetição`);
  for (const locale of ["pt", "en", "es"]) assert.equal(new Set(rows.map(([, row]) => row.name[locale])).size, ids.length, `${cc}: nomes em ${locale} sem repetição`);

  // divisas simétricas
  let pairs = 0;
  for (const [id, row] of rows) {
    for (const other of row.borders) assert.ok(units.units[other]?.borders.includes(id), `divisa ${id}-${other} só de um lado`);
    assert.ok(!row.borders.includes(id), `${id}: vizinho de si mesmo`);
    pairs += row.borders.length;
  }
  files[cc].pairs = pairs / 2;

  // silhuetas: uma por unidade, inteiras (a caixa da silhueta é a caixa da unidade)
  assert.deepEqual(Object.keys(shapes).sort(), [...ids].sort(), `${cc}: uma silhueta por unidade`);
  for (const id of ids) {
    assert.ok(["Polygon", "MultiPolygon"].includes(shapes[id].type), `${id}: silhueta poligonal`);
    boxOf(shapes[id]).forEach((value, index) => assert.ok(Math.abs(value - units.units[id].bbox[index]) < 0.05, `${id}: silhueta e caixa da unidade batem (${boxOf(shapes[id])} × ${units.units[id].bbox})`));
  }

  // bandeiras (só se o país tem): todas, em domínio público, no formato do acervo do mapa-múndi
  if (flags) {
    assert.deepEqual(Object.keys(flags.flags).sort(), [...ids].sort(), `${cc}: uma bandeira por unidade`);
    for (const id of ids) {
      const value = flags.flags[id];
      assert.ok(value.startsWith("svg:<svg") || /^data:image\/(webp|png);base64,/.test(value), `${id}: bandeira em formato conhecido`);
      if (value.startsWith("svg:")) assert.match(/<svg\b[^>]*>/.exec(value)[0], /\swidth="[\d.e+]+"[\s\S]*\sheight="[\d.e+]+"|\sheight="[\d.e+]+"[\s\S]*\swidth="[\d.e+]+"/, `${id}: o SVG tem largura e altura na raiz`);
      assert.match(flags.sources[id].license, /public domain/i, `${id}: licença`);
      assert.ok(flags.ratio[id] > 0.4 && flags.ratio[id] < 0.8, `${id}: proporção ${flags.ratio[id]}`);
    }
    files[cc].flagBytes = Object.values(flags.flags).reduce((total, value) => total + value.length, 0);
  }

  // mapa: o arquivo do índice (tamanho e hash, que o service worker recebe no build), só com as unidades, e quem responde por cada ponto
  const file = `public${country.map.url}`;
  assert.equal(country.map.url, `/maps/divisions-${cc}.pmtiles`);
  const bytes = await readFile(file);
  const manifest = await json(file.replace(/\.pmtiles$/, ".manifest.json"));
  assert.equal(bytes.byteLength, country.map.bytes, `${cc}: tamanho do mapa = índice`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), country.map.sha256, `${cc}: hash do mapa = índice`);
  assert.equal(manifest.bytes, country.map.bytes); assert.equal(manifest.sha256, country.map.sha256);
  assert.deepEqual(manifest.entities.filter(Boolean).sort(), [...ids].sort(), `${cc}: o mapa tem as unidades e só elas`);
  const ownerAt = await mapReader(file);
  assert.ok(config.probes.length >= 10, `${cc}: pontos conhecidos na config`);
  for (const [label, lon, lat, expected] of config.probes) assert.equal(await ownerAt(lon, lat), expected, `${cc}: ${label}`);
  for (const [id, row] of rows) assert.equal(await ownerAt(row.ll[1], row.ll[0]), id, `${id}: o ponto do rótulo cai na própria unidade`);
  points += config.probes.length + rows.length;
}

// ---- Brasil: os 26 estados e o DF, nas 5 regiões do IBGE, com bandeiras
{
  const { units, pairs, flagBytes } = files.br;
  const row = (sigla) => units.units[`br-${sigla}`];
  const byRegion = (region) => Object.entries(units.units).filter(([, value]) => value.region === region).map(([id]) => id).sort();
  assert.equal(Object.keys(units.units).length, 27);
  assert.deepEqual(byRegion("norte"), ["br-ac", "br-am", "br-ap", "br-pa", "br-ro", "br-rr", "br-to"]);
  assert.deepEqual(byRegion("nordeste"), ["br-al", "br-ba", "br-ce", "br-ma", "br-pb", "br-pe", "br-pi", "br-rn", "br-se"]);
  assert.deepEqual(byRegion("centro-oeste"), ["br-df", "br-go", "br-ms", "br-mt"]);
  assert.deepEqual(byRegion("sudeste"), ["br-es", "br-mg", "br-rj", "br-sp"]);
  assert.deepEqual(byRegion("sul"), ["br-pr", "br-rs", "br-sc"]);
  assert.equal(row("df").capital, "Brasília"); assert.equal(row("to").capital, "Palmas"); assert.equal(row("ma").capital, "São Luís"); assert.equal(row("sc").capital, "Florianópolis");
  assert.deepEqual(row("ma").capAl, ["São Luiz"], "a grafia antiga de São Luís vale na escrita");
  assert.equal(row("df").name.en, "Federal District"); assert.equal(row("ba").name.es, "Bahía"); assert.equal(row("rs").name.es, "Río Grande del Sur");
  // 51 pares; as divisas curtas também (o DF encosta em Minas por ~2,6 km)
  assert.equal(pairs, 51, "51 pares de estados vizinhos");
  assert.ok(Object.values(units.units).every((value) => value.borders.length > 0), "todo estado tem vizinho");
  const borders = (sigla) => [...row(sigla).borders].sort();
  assert.deepEqual(borders("df"), ["br-go", "br-mg"]); assert.deepEqual(borders("rs"), ["br-sc"]); assert.deepEqual(borders("ap"), ["br-pa"]);
  assert.deepEqual(borders("sp"), ["br-mg", "br-ms", "br-pr", "br-rj"]); assert.equal(borders("ba").length, 8); assert.equal(borders("mg").length, 7);
  // silhuetas inteiras (antes da correção de 06/10 o Amazonas e o Pará perdiam pedaços na emenda da grade do mapa HD)
  assert.ok(boxOf(files.br.shapes["br-am"])[2] > -57, "o Amazonas chega à divisa com o Pará");
  assert.ok(boxOf(files.br.shapes["br-pa"])[2] > -48.5, "o Pará chega ao Maranhão");
  assert.ok(flagBytes < 400_000, `bandeiras com ${flagBytes} bytes`);
  assert.deepEqual(DIVISION_INDEX[0].frame.map(Math.round), [-74, -34, -35, 5], "o quadro do Brasil continental");
}

// ---- EUA (MVP, sem bandeiras): os 50 estados nas 4 regiões do Census Bureau, sem o DC
{
  const { units, pairs, flags } = files.us;
  const row = (code) => units.units[`us-${code}`];
  const count = (region) => Object.values(units.units).filter((value) => value.region === region).length;
  assert.equal(Object.keys(units.units).length, 50);
  assert.equal(row("dc"), undefined, "o DC fica de fora");
  assert.equal(flags, null, "sem bandeiras por enquanto");
  assert.deepEqual(["northeast", "midwest", "south", "west"].map(count), [9, 12, 16, 13]);
  assert.equal(row("ny").name.pt, "Nova York"); assert.equal(row("ny").name.es, "Nueva York"); assert.equal(row("nc").name.pt, "Carolina do Norte");
  assert.equal(row("ak").name.pt, "Alasca"); assert.equal(row("hi").name.pt, "Havaí");
  assert.equal(row("ak").capital, "Juneau"); assert.equal(row("ca").capital, "Sacramento"); assert.equal(row("ny").capital, "Albany"); assert.equal(row("tx").capital, "Austin");
  assert.equal(pairs, 107, "107 pares de estados vizinhos (Michigan encosta em Illinois e em Minnesota pelos lagos)");
  assert.deepEqual(row("ak").borders, [], "o Alasca não tem vizinho"); assert.deepEqual(row("hi").borders, [], "nem o Havaí");
  assert.ok(Object.entries(units.units).every(([id, value]) => value.borders.length > 0 || id === "us-ak" || id === "us-hi"), "os outros 48 têm vizinho");
  const borders = (code) => [...row(code).borders].sort();
  assert.deepEqual(borders("me"), ["us-nh"]); assert.deepEqual(borders("ca"), ["us-az", "us-nv", "us-or"]); assert.deepEqual(borders("wa"), ["us-id", "us-or"]);
  assert.equal(borders("tn").length, 8); assert.equal(borders("mo").length, 8);
  assert.ok(borders("md").includes("us-va"), "Maryland e Virgínia encostam (pelo Potomac, sem o DC no meio)");
  assert.deepEqual(DIVISION_INDEX[1].frame, [-125, 24.3, -66.9, 49.5], "o quadro dos 48 contíguos");
  assert.ok(row("ak").bbox[0] > -180 && row("ak").bbox[0] < -160, "a caixa do Alasca não atravessa o antimeridiano (Attu fica no mapa, fora da caixa)");
}

// ---- regras
const D = divisions;
const br = D.divisionCatalog(files.br.units, "pt");
const brEs = D.divisionCatalog(files.br.units, "es");
const brEn = D.divisionCatalog(files.br.units, "en");
const us = D.divisionCatalog(files.us.units, "pt");
const usEs = D.divisionCatalog(files.us.units, "es");

// catálogo no formato do acervo: nome no idioma da interface, código como cca3, divisas como códigos, região "<país>:<região>"
assert.equal(br.country, "br"); assert.deepEqual(br.data.mapEntityIds.sort(), Object.keys(files.br.units.units).sort());
assert.equal(br.data.meta["br-sp"].pt, "São Paulo"); assert.equal(br.data.meta["br-sp"].cca3, "SP"); assert.equal(br.data.meta["br-sp"].fl, "br-sp"); assert.equal(br.data.meta["br-sp"].reg, "br:sudeste");
assert.deepEqual([...br.data.meta["br-df"].borders].sort(), ["GO", "MG"]);
assert.equal(brEs.data.meta["br-ba"].pt, "Bahía", "o nome no idioma da interface");
const accepted = (meta) => [meta.pt, meta.en, ...(meta.al ?? [])];
assert.ok(accepted(brEs.data.meta["br-ba"]).includes("Bahia"), "e o nome em português vale na escrita");
assert.equal(brEn.data.meta["br-df"].pt, "Federal District"); assert.ok(accepted(brEn.data.meta["br-df"]).includes("Distrito Federal"));
assert.ok(accepted(br.data.meta["br-df"]).includes("Federal District"), "em português o nome em inglês também vale");
assert.deepEqual(br.data.meta["br-ma"].capAl, ["São Luiz"]);
assert.equal(us.data.meta["us-ny"].pt, "Nova York"); assert.equal(us.data.meta["us-ny"].reg, "us:northeast"); assert.equal(us.data.meta["us-ny"].cap, "Albany");
assert.ok(accepted(us.data.meta["us-ny"]).includes("New York") && accepted(us.data.meta["us-ny"]).includes("Nueva York"), "Nova York vale nos três idiomas");
assert.equal(usEs.data.meta["us-hi"].pt, "Hawái");
assert.deepEqual(us.data.meta["us-ak"].borders, []);

// o índice e a palavra da unidade
assert.equal(D.divisionCountry("us").name.pt, "EUA"); assert.equal(D.divisionCountry("xx"), null);
assert.deepEqual(D.unitWord(D.divisionCountry("br"), "pt"), { one: "estado", many: "estados", g: "m" });
assert.equal(D.unitWord(D.divisionCountry("us"), "en").one, "state");

// variantes: um modo vale para todos os países e joga com as regras do modo equivalente do mapa-múndi
assert.deepEqual(D.DIVISION_VARIANTS.map((variant) => D.baseVariant(variant)), ["mapa", "capital-pais", "silhueta-opcoes", "silhueta", "nome-bandeira", "bandeira-nome", "pais-capital", "escrita-pais", "escrita-capital"]);
assert.equal(D.baseVariant("mapa"), "mapa"); assert.equal(D.isDivisionVariant("dv-mapa"), true); assert.equal(D.isDivisionVariant("br-mapa"), false); assert.equal(D.isDivisionVariant("mapa"), false);
for (const variant of D.DIVISION_VARIANTS) {
  const base = D.baseVariant(variant);
  assert.equal(pace.timerSecondsFor(variant), pace.timerSecondsFor(base), `${variant}: o tempo do modo equivalente`);
  assert.equal(spoils.baseCoins(variant), Math.round(spoils.baseCoins(base) * 0.75), `${variant}: 3/4 das moedas do modo equivalente`);
  assert.equal(D.variantPlayable(D.divisionCountry("br"), variant), true, `${variant}: o Brasil tem todos os modos`);
}
// os EUA, sem bandeiras: os 6 modos sem bandeira
const usPlayable = D.DIVISION_VARIANTS.filter((variant) => D.variantPlayable(D.divisionCountry("us"), variant));
assert.deepEqual(usPlayable, ["dv-mapa", "dv-capital-mapa", "dv-silhueta-opcoes", "dv-silhueta", "dv-capital", "dv-escrita-capital"]);
assert.equal(D.variantPlayable(null, "dv-mapa"), false); assert.equal(D.variantPlayable(D.divisionCountry("br"), "mapa"), false);

// recortes: "dv:<país>" e "dv:<país>:<região>", um país só por vez, à parte dos do mapa-múndi
assert.deepEqual(regions.normalizeRegionSelection(["dv:br:norte", "dv:br:nordeste", "dv:br:centro-oeste", "dv:br:sudeste", "dv:br:sul"]), ["dv:br"], "todas as regiões = o país");
assert.deepEqual(regions.normalizeRegionSelection(["dv:br:sul", "dv:br"]), ["dv:br"]);
assert.deepEqual(regions.normalizeRegionSelection(["dv:br:sul", "dv:br:norte"]), ["dv:br:norte", "dv:br:sul"], "na ordem do índice");
assert.deepEqual(regions.normalizeRegionSelection(["dv:us:west", "dv:br:sul"]), ["dv:us:west"], "um país só (o primeiro)");
assert.deepEqual(regions.normalizeRegionSelection(["dv:br:atlantida"]), ["dv:br"], "região desconhecida = o país");
assert.deepEqual(regions.normalizeRegionSelection("mundo"), ["mundo"], "o mapa-múndi segue igual");
assert.deepEqual(regions.normalizeRegionSelection(["europa", "asia"]), ["europa", "asia"]);
assert.equal(regions.regionLabel("dv:br:nordeste"), "Nordeste"); assert.equal(regions.regionLabel("dv:br"), "Brasil"); assert.equal(regions.regionLabel("dv:us"), "EUA");
assert.equal(regions.regionLabel(["dv:br:norte", "dv:br:sul"]), "2 recortes");
assert.equal(D.divisionRegionLabel("us:west", "en"), "West"); assert.equal(D.divisionRegionLabel("dv:us:midwest", "es"), "Medio Oeste");
assert.equal(regions.regionMatches({ reg: "br:sul" }, "dv:br:sul"), true); assert.equal(regions.regionMatches({ reg: "br:sul" }, "dv:br:norte"), false);
assert.equal(regions.regionMatches({ reg: "br:sul" }, "dv:br"), true); assert.equal(regions.regionMatches({ reg: "us:south" }, "dv:br"), false, "estado dos EUA não entra no recorte do Brasil");
assert.equal(regions.regionMatches({ reg: "br:sul" }, "dv:us:south"), false);
assert.equal(regions.regionMatches({ reg: "Europe" }, "dv:br"), false, "país do mapa-múndi não entra no recorte de um país");
assert.equal(regions.regionMatches({ reg: "br:sul" }, "europa"), false);
assert.equal(regions.regionSelectionIncludes("dv:br", "dv:br:sul"), true); assert.equal(regions.regionSelectionIncludes("dv:br", "dv:us:west"), false);
assert.deepEqual(regions.cameraFor("dv:us"), regions.REGION_CAMERA.mundo, "a câmera de um país é a das unidades (o fallback é o mundo)");
assert.deepEqual(D.divisionRegionItems("us", "pt").map(([key, name]) => `${key}=${name}`), ["dv:us=EUA", "dv:us:northeast=Nordeste", "dv:us:midwest=Meio-Oeste", "dv:us:south=Sul", "dv:us:west=Oeste"]);
assert.deepEqual(D.divisionRegionItems("xx"), []);
assert.equal(D.divisionCountryOf("dv:us:west"), "us"); assert.equal(D.divisionCountryOf(["mundo", "dv:br"]), "br"); assert.equal(D.divisionCountryOf("mundo"), null);
assert.equal(D.divisionCountryOf("nordeste"), "br", "o recorte da família brasil (antes deste modo) é do Brasil");
// contagens da Mesa sem carregar o pacote
const counts = D.divisionCounts();
assert.equal(counts["dv:br"], 27); assert.equal(counts["dv:br:nordeste"], 9); assert.equal(counts["dv:us"], 50); assert.equal(counts["dv:us:south"], 16);
assert.equal(D.divisionSelectedCount(["dv:us:west", "dv:us:south"]), 29); assert.equal(D.divisionSelectedCount("dv:br"), 27); assert.equal(D.divisionSelectedCount("mundo"), 0);
// unidades e câmera do recorte
assert.equal(D.divisionIdsIn(br, "dv:br").length, 27); assert.equal(D.divisionIdsIn(br, "dv:br:nordeste").length, 9); assert.equal(D.divisionIdsIn(br, ["dv:br:norte", "dv:br:sul"]).length, 10);
assert.equal(D.divisionIdsIn(us, "dv:us:west").length, 13); assert.ok(D.divisionIdsIn(us, "dv:us:west").includes("us-hi"));
assert.equal(D.divisionIdsIn(br, "mundo").length, 27, "sem recorte do país, o país inteiro");
assert.deepEqual(D.divisionBounds(br, D.divisionIdsIn(br, "dv:br"), "dv:br").map(Math.round), [-74, -34, -35, 5], "o país inteiro: o quadro do índice");
assert.deepEqual(D.divisionBounds(us, D.divisionIdsIn(us, "dv:us"), "dv:us"), [-125, 24.3, -66.9, 49.5], "os EUA inteiros: os 48 contíguos (o Alasca e o Havaí a um zoom de distância)");
assert.deepEqual(D.divisionBounds(br, D.divisionIdsIn(br, "dv:br:sul"), "dv:br:sul").map(Math.round), [-58, -34, -48, -23]);
assert.deepEqual(D.divisionBounds(us, D.divisionIdsIn(us, "dv:us:northeast"), "dv:us:northeast").map(Math.round), [-81, 39, -67, 47], "o Nordeste: da Pensilvânia (80,5° O) ao Maine");
assert.ok(D.divisionBounds(us, D.divisionIdsIn(us, "dv:us:west"), "dv:us:west")[0] < -165, "o Oeste enquadra o Alasca e o Havaí");

// legado: a família "brasil" (06/10) vale como este modo no país br, sem regravar nada
assert.equal(Object.keys(D.LEGACY_VARIANT).length, 9);
assert.equal(new Set(Object.values(D.LEGACY_VARIANT)).size, 9, "cada variante antiga vira um modo diferente");
assert.ok(Object.values(D.LEGACY_VARIANT).every((variant) => D.isDivisionVariant(variant)));
for (const [old, now] of Object.entries(D.LEGACY_VARIANT)) assert.equal(old.replace(/^br-/, "").replace("estado-capital", "capital").replace("escrita-estado", "escrita-nome"), now.replace(/^dv-/, ""), `${old} → ${now}`);
const legacy = D.asDivisionSession({ family: "brasil", variant: "br-estado-capital", mode: "br-estado-capital", region: "nordeste", regions: ["norte", "sul"], correct: 7 });
assert.deepEqual(legacy, { family: "divisoes", variant: "dv-capital", mode: "dv-capital", region: "dv:br:nordeste", regions: ["dv:br:norte", "dv:br:sul"], correct: 7 });
assert.equal(D.asDivisionSession({ family: "brasil", variant: "br-mapa" }).region, "dv:br", "sem recorte gravado, o Brasil inteiro");
const world = { family: "mapa", variant: "mapa", region: "europa" };
assert.equal(D.asDivisionSession(world), world, "as outras sessões ficam como estão");
assert.equal(D.isDivisionFamily("brasil"), true); assert.equal(D.isDivisionFamily("divisoes"), true); assert.equal(D.isDivisionFamily("mapa"), false);

// dificuldade: sem população, pela área (os grandes rendem menos, os pequenos mais), um terço em cada faixa
assert.equal(spoils.entityTier(br.data.meta, "br-am"), 1); assert.equal(spoils.entityTier(br.data.meta, "br-df"), 3); assert.equal(spoils.entityTier(br.data.meta, "br-se"), 3);
assert.equal(spoils.entityTier(us.data.meta, "us-ak"), 1); assert.equal(spoils.entityTier(us.data.meta, "us-tx"), 1); assert.equal(spoils.entityTier(us.data.meta, "us-ri"), 3); assert.equal(spoils.entityTier(us.data.meta, "us-de"), 3);
for (const pack of [br, us]) {
  const ids = Object.keys(pack.data.meta);
  const tiers = [1, 2, 3].map((tier) => ids.filter((id) => spoils.entityTier(pack.data.meta, id) === tier).length);
  assert.ok(tiers.every((value) => Math.abs(value - ids.length / 3) <= 1), `${pack.country}: um terço em cada faixa (${tiers})`);
}

// preço: o mapa das unidades é grátis, as bandeiras são um modo só nos dois sentidos, e um modo comprado vale para todos os países
assert.equal(economy.policyFor("divisoes", "dv-mapa", "dv:br").cost, 0);
assert.equal(economy.policyFor("divisoes", "dv-nome-bandeira", "dv:br").key, "divisoes:dv-bandeira-nome");
assert.equal(economy.policyFor("divisoes", "dv-silhueta", "dv:us").key, economy.policyFor("divisoes", "dv-silhueta", "dv:br").key);
assert.ok(D.DIVISION_VARIANTS.every((variant) => economy.policyFor("divisoes", variant, "dv:br")), "todo modo tem preço");

// Mesa: 8 modos (as bandeiras valem os dois sentidos e não engolem os outros modos, que dividem a família do motor)
const modes = matchConfig.modesFor("divisoes");
assert.equal(modes.length, 8);
assert.equal(matchConfig.selectedMode("divisoes", "divisoes", "dv-bandeira-nome").key, "dv-bandeiras");
assert.equal(matchConfig.selectedMode("divisoes", "divisoes", "dv-nome-bandeira").key, "dv-bandeiras");
for (const variant of ["dv-mapa", "dv-capital-mapa", "dv-silhueta-opcoes", "dv-silhueta", "dv-escrita-nome", "dv-capital", "dv-escrita-capital"]) {
  assert.equal(matchConfig.selectedMode("divisoes", "divisoes", variant).key, variant, `${variant}: o próprio modo`);
}
assert.equal(matchConfig.selectedMode("bandeiras", "bandeiras", "bandeira-nome").key, "atuais", "as bandeiras do mapa-múndi seguem iguais");
assert.deepEqual(modes.filter((mode) => D.variantPlayable(D.divisionCountry("us"), mode.variant)).map((mode) => mode.key),
  ["dv-mapa", "dv-capital-mapa", "dv-silhueta-opcoes", "dv-silhueta", "dv-capital", "dv-escrita-capital"], "a Mesa dos EUA: 6 modos");
assert.ok(matchConfig.paceHint("training", "dv-mapa", D.unitWord(D.divisionCountry("br"), "pt")).includes("estado"), "no Treino a unidade perguntada fica marcada");
assert.ok(!matchConfig.paceHint("training", "dv-silhueta", D.unitWord(D.divisionCountry("br"), "pt")).includes("estado"), "fora do mapa, não");
assert.deepEqual(matchConfig.variantContextFor("divisoes", "dv-silhueta"), { family: "divisoes", variant: "dv-silhueta" });
assert.equal(matchConfig.variantContextFor("divisoes", "mapa"), null);

// estatísticas: as do modo e do país (as sessões antigas da família brasil contam como as do Brasil)
const flagMode = { ...modes.find((mode) => mode.key === "dv-bandeiras"), country: "br" };
const mapMode = { ...modes.find((mode) => mode.key === "dv-mapa"), country: "us" };
assert.equal(modeStats.sessionInMode({ family: "divisoes", variant: "dv-bandeira-nome", region: "dv:br" }, flagMode), true);
assert.equal(modeStats.sessionInMode({ family: "divisoes", variant: "dv-mapa", region: "dv:br" }, flagMode), false);
assert.equal(modeStats.sessionInMode({ family: "brasil", variant: "br-nome-bandeira", region: "sul" }, flagMode), true, "sessão da família brasil");
assert.equal(modeStats.sessionInMode({ family: "divisoes", variant: "dv-mapa", region: "dv:us:west" }, mapMode), true);
assert.equal(modeStats.sessionInMode({ family: "divisoes", variant: "dv-mapa", region: "dv:br" }, mapMode), false, "a partida do Brasil não conta nos EUA");
assert.equal(modeStats.sessionInMode({ family: "brasil", variant: "br-mapa" }, mapMode), false);
assert.equal(modeStats.sessionInMode({ family: "divisoes", variant: "dv-mapa", regions: ["dv:us:west", "dv:us:south"] }, mapMode), true);

// fora do domínio e dos pilares
for (const family of ["divisoes", "brasil"]) {
  assert.equal(dominated.OUTSIDE_DOMAIN_FAMILIES.has(family), true, `${family}: fora do domínio`);
  assert.equal(pillars.pillarOfSession({ family, variant: "dv-mapa", mode: "dv-mapa" }), null, `${family}: fora dos pilares`);
}

// suprimentos: a Bússola mostra a região; a Pista de vizinhos acha a divisa (ou, numa ilha, o vizinho mais perto por mar)
assert.equal(supplies.compassGroup(br.data.meta["br-ba"]), "br:nordeste"); assert.equal(supplies.compassGroup(us.data.meta["us-ca"]), "us:west");
const hint = supplies.neighborHint(br.data.meta, "br-df");
assert.ok(hint && !hint.sea && ["br-go", "br-mg"].includes(hint.id), "a Pista de vizinhos acha a divisa");
assert.equal(supplies.neighborHint(br.data.meta, "br-rs")?.id, "br-sc"); assert.equal(supplies.neighborHint(us.data.meta, "us-me")?.id, "us-nh");
const hawaii = supplies.neighborHint(us.data.meta, "us-hi");
assert.ok(hawaii?.sea && hawaii.id === "us-ca", `o Havaí: a Califórnia, por mar (${JSON.stringify(hawaii)})`);
const alaska = supplies.neighborHint(us.data.meta, "us-ak");
assert.ok(alaska?.sea && alaska.id === "us-wa", `o Alasca: Washington, por mar (${JSON.stringify(alaska)})`);

console.log(`divisions: ${DIVISION_INDEX.map((country) => `${country.id} ${country.count} unidades/${files[country.id].pairs} divisas`).join(", ")}; ${Math.round(files.br.flagBytes / 1000)} kB de bandeiras do Brasil, silhuetas inteiras, regras e ${points} pontos dos mapas conferidos`);
