// Idiomas da interface: escolha do idioma, sobreposição do conteúdo traduzido e cobertura dos arquivos public/data/i18n.
// (A paridade das chaves de texto entre pt/en/es é garantida pelo tsc: en.ts e es.ts são do tipo Messages.)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-i18n-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/i18n/content.ts", "src/domain/i18n/index.ts", "src/domain/presets.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const url = (file) => pathToFileURL(join(out, file)).href;
const i18n = await import(url("i18n/index.js"));
const content = await import(url("i18n/content.js"));
const presets = await import(url("presets.js"));

// sem nada salvo e fora do navegador, o jogo abre em português
assert.equal(i18n.locale, "pt");
assert.equal(i18n.t, i18n.MESSAGES.pt);
// detecção pelo idioma do aparelho (vale quando LOCALE_RELEASED estiver ligado)
assert.equal(i18n.localeFromNavigator(["es-AR", "en-US"]), "es");
assert.equal(i18n.localeFromNavigator(["en-GB"]), "en");
assert.equal(i18n.localeFromNavigator(["fr-FR", "de-DE"]), "pt");
assert.equal(i18n.localeFromNavigator(["pt-BR"]), "pt");

// os três dicionários têm as mesmas seções e as mesmas conquistas/temas
for (const code of ["en", "es"]) {
  const messages = i18n.MESSAGES[code];
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(i18n.MESSAGES.pt).sort(), `${code}: seções`);
  assert.deepEqual(Object.keys(messages.achievements).sort(), Object.keys(i18n.MESSAGES.pt.achievements).sort(), `${code}: conquistas`);
  assert.deepEqual(Object.keys(messages.themes).sort(), Object.keys(i18n.MESSAGES.pt.themes).sort(), `${code}: temas`);
  assert.equal(messages.dates.monthsShort.length, 12);
  assert.equal(messages.rarity.length, 6);
}

// sobreposição do catálogo: nome e capital no idioma, `en` preservado, apelidos do idioma, vizinhos renomeados
const legacy = {
  meta: {
    "76": { pt: "Brasil", en: "Brazil", cap: "Brasília", cca3: "BRA", al: ["Brazil"], fato: "texto pt", lang: ["Português"] },
    "600": { pt: "Paraguai", en: "Paraguay", cap: "Assunção", cca3: "PRY" },
  },
  names3: { BRA: "Brasil", PRY: "Paraguai" },
  mapEntityIds: ["76", "600"],
};
const localized = content.applyCatalogOverlay(legacy, {
  "76": { name: "Brasil", cap: "Brasilia", al: ["República Federativa del Brasil"], fato: "texto es", lang: ["Portugués"] },
  "600": { name: "Paraguay", cap: "Asunción" },
});
assert.equal(localized.meta["76"].cap, "Brasilia");
assert.equal(localized.meta["76"].en, "Brazil");
assert.deepEqual(localized.meta["76"].al, ["República Federativa del Brasil"]);
assert.equal(localized.meta["76"].fato, "texto es");
assert.deepEqual(localized.meta["76"].lang, ["Portugués"]);
assert.equal(localized.names3.PRY, "Paraguay");
assert.equal(legacy.meta["600"].pt, "Paraguai", "não altera o catálogo original");

// nome sugerido das Favoritas: reconhecido em qualquer idioma, mostrado no idioma atual
const preset = { topFamily: "mapa", variant: "mapa", pace: "timed", roundTier: "short", region: ["europa"], onlyUn: false, id: "preset:x", favorite: true, createdAt: 0, updatedAt: 0 };
const englishName = presets.defaultPresetName(preset, i18n.MESSAGES.en);
assert.equal(englishName, "Click the map · Europe · 10");
assert.equal(presets.isAutoName({ ...preset, name: englishName }), true);
assert.equal(presets.presetLabel({ ...preset, name: englishName }), "Clicar no mapa · Europa · 10");
assert.equal(presets.presetLabel({ ...preset, name: "Minha Europa" }), "Minha Europa");

// arquivos gerados por scripts/i18n/build-i18n.mjs cobrem todo o acervo
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const catalog = (await json("public/data/legacy/catalog.json")).meta;
const historical = (await json("public/data/legacy/historical.json")).entities;
const languages = (await json("public/data/legacy/languages.json")).entries;
for (const code of ["en", "es"]) {
  const meta = (await json(`public/data/i18n/${code}/catalog.json`)).meta;
  for (const [id, source] of Object.entries(catalog)) {
    assert.ok(meta[id]?.name, `${code}: ${id} sem nome`);
    if (source.cap) assert.ok(meta[id].cap, `${code}: ${id} sem capital`);
    if (source.fato) assert.ok(meta[id].fato, `${code}: ${id} sem nota histórica`);
  }
  const hist = (await json(`public/data/i18n/${code}/historical.json`)).entities;
  for (const entity of historical) assert.ok(hist[entity.id]?.name, `${code}: histórica ${entity.id} sem nome`);
  const langs = (await json(`public/data/i18n/${code}/languages.json`)).entries;
  for (const entry of languages) {
    assert.ok(langs[entry.id]?.idioma && langs[entry.id]?.paises, `${code}: idioma ${entry.id} incompleto`);
  }
  // nomes únicos: são as alternativas do quiz
  const names = Object.entries(meta).filter(([id]) => !catalog[id].absorvido).map(([, item]) => item.name);
  assert.equal(new Set(names).size, names.length, `${code}: nomes de país repetidos`);
  const idiomas = Object.values(langs).map((item) => item.idioma);
  assert.equal(new Set(idiomas).size, idiomas.length, `${code}: nomes de idioma repetidos`);
}

console.log("i18n: locale, dicionários, sobreposição, favoritas e cobertura en/es ok");
