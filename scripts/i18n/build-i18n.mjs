// Gera public/data/i18n/<locale>/{catalog,historical,languages}.json: o conteúdo do jogo traduzido, sobreposto ao
// acervo em português na hora de carregar (domain/i18n/content.ts). O português continua saindo de public/data/legacy.
//
// Fontes (tudo em scripts/i18n):
//   wikidata-catalog.json      nomes, apelidos e capitais de países (fetch-wikidata.mjs)
//   names-overrides.json       correções à mão sobre o Wikidata (nome comum, capital usada no jogo, desambiguação)
//   <locale>/terms.json        { lang: {pt: tradução}, cur: {pt: tradução}, places: {pt: tradução} } (idiomas, moedas, lugares)
//   facts/*.json               { id: [nota em inglês, nota em espanhol] } (notas históricas dos países, em lotes)
//   <locale>/historical.json   { id: { name, cap?, sucessor?, fato? } }
//   <locale>/languages.json    { id: { idioma, significado, falantes?, ranking? } }
// Uso: node scripts/i18n/build-i18n.mjs   (sem rede; rode de novo depois de editar qualquer fonte)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const LOCALES = ["en", "es"];
const read = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const catalog = read("public/data/legacy/catalog.json").meta;
const historical = read("public/data/legacy/historical.json").entities;
const languages = read("public/data/legacy/languages.json").entries;
const wikidata = read("scripts/i18n/wikidata-catalog.json");
const overrides = read("scripts/i18n/names-overrides.json");
const factParts = existsSync("scripts/i18n/facts") ? readdirSync("scripts/i18n/facts").filter((name) => name.endsWith(".json")).sort() : [];
const allFacts = Object.assign({}, ...factParts.map((name) => read(`scripts/i18n/facts/${name}`)));
const byPt = new Map(Object.entries(catalog).map(([id, meta]) => [meta.pt, id]));

// Apelido do Wikidata só vale como resposta digitada se parecer um nome (nada de siglas, códigos ou emoji).
const usableAlias = (alias, name) =>
  alias.length >= 4 && alias !== name && /\p{Ll}/u.test(alias) && !/[\p{Extended_Pictographic}]/u.test(alias) && !/\d/.test(alias);

let problems = 0;
const warn = (message) => { problems += 1; console.log(`  ! ${message}`); };

for (const locale of LOCALES) {
  console.log(`[${locale}]`);
  const fix = overrides[locale] ?? {};
  const terms = read(`scripts/i18n/${locale}/terms.json`, { lang: {}, cur: {}, places: {} });
  const facts = Object.fromEntries(Object.entries(allFacts).map(([id, pair]) => [id, pair[LOCALES.indexOf(locale)]]));
  const hist = read(`scripts/i18n/${locale}/historical.json`, {});
  const langs = read(`scripts/i18n/${locale}/languages.json`, {});
  const missing = { names: [], caps: [], facts: [], lang: new Set(), cur: new Set(), hist: [], langs: [] };

  // ---- países
  const meta = {};
  for (const [id, source] of Object.entries(catalog)) {
    const wd = wikidata[id] ?? { name: {}, aliases: {} };
    const own = fix[id] ?? {};
    // inglês: o nome comum do catálogo (REST Countries) quando ele não está em português; senão o Wikidata
    const englishCatalog = locale === "en" && source.en && source.en !== source.pt ? source.en : null;
    const name = own.name ?? englishCatalog ?? wd.name?.[locale];
    if (!name) { missing.names.push(id); continue; }
    const entry = { name };
    const aliases = new Set([...(own.al ?? []), ...(wd.aliases?.[locale] ?? []).filter((alias) => usableAlias(alias, name))]);
    if (wd.name?.[locale] && wd.name[locale] !== name) aliases.add(wd.name[locale]);
    aliases.delete(name);
    if (aliases.size) entry.al = [...aliases];
    if (source.cap) {
      const cap = own.cap ?? wd.cap?.[locale];
      if (cap) entry.cap = cap; else missing.caps.push(`${id} ${source.pt} (${source.cap})`);
      const capAl = own.capAl ?? [];
      if (capAl.length) entry.capAl = capAl;
    }
    if (source.fato) { if (facts[id]) entry.fato = facts[id]; else missing.facts.push(id); }
    for (const key of ["lang", "cur"]) {
      if (!Array.isArray(source[key])) continue;
      entry[key] = source[key].map((term) => { if (!terms[key]?.[term]) missing[key].add(term); return terms[key]?.[term] ?? term; });
    }
    meta[id] = entry;
  }
  // nomes precisam ser únicos (são as alternativas do quiz e as respostas digitadas)
  const seenNames = new Map();
  for (const [id, entry] of Object.entries(meta)) {
    if (catalog[id].absorvido) continue;
    if (seenNames.has(entry.name)) warn(`nome repetido "${entry.name}": ${seenNames.get(entry.name)} e ${id}`);
    seenNames.set(entry.name, id);
  }
  // apelido que coincide com o nome (ou apelido) de outro país deixaria a resposta digitada ambígua: sai dos dois
  const norm = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const owners = new Map();
  for (const [id, entry] of Object.entries(meta)) {
    if (catalog[id].absorvido) continue;
    for (const answer of [entry.name, catalog[id].en, ...(entry.al ?? [])].filter(Boolean)) {
      const key = norm(answer);
      owners.set(key, new Set([...(owners.get(key) ?? []), id]));
    }
  }
  for (const [key, ids] of owners) {
    if (ids.size < 2) continue;
    for (const id of ids) {
      const entry = meta[id];
      if (norm(entry.name) === key || norm(catalog[id].en ?? "") === key) continue; // o nome principal fica
      entry.al = (entry.al ?? []).filter((alias) => norm(alias) !== key);
      if (!entry.al.length) delete entry.al;
    }
    const still = [...ids].filter((id) => norm(meta[id].name) === key || norm(catalog[id].en ?? "") === key);
    if (still.length > 1) warn(`resposta ambígua "${key}": ${still.join(", ")}`);
  }
  const nameOfPt = (ptName) => {
    const id = byPt.get(ptName);
    if (id && meta[id]) return meta[id].name;
    if (terms.places?.[ptName]) return terms.places[ptName];
    return null;
  };
  // separa por vírgula fora de parênteses: "Estados Unidos (Arizona, Novo México e Utah)" é um item só
  const splitList = (list) => list.match(/(?:[^,(]|\([^)]*\))+/g).map((item) => item.trim()).filter(Boolean);
  const translateList = (list, where) => splitList(list).map((ptName) => {
    const translated = nameOfPt(ptName);
    if (!translated) warn(`${where}: lugar sem tradução "${ptName}" (ponha em terms.places)`);
    return translated ?? ptName;
  }).join(", ");

  // ---- bandeiras históricas
  const histOut = {};
  for (const entity of historical) {
    const own = hist[entity.id];
    if (!own?.name) { missing.hist.push(entity.id); continue; }
    const entry = { name: own.name };
    for (const key of ["cap", "sucessor", "fato"]) {
      if (!entity[key]) continue;
      if (own[key]) entry[key] = own[key]; else missing.hist.push(`${entity.id}.${key}`);
    }
    histOut[entity.id] = entry;
  }
  const seenHist = new Map();
  for (const [id, entry] of Object.entries(histOut)) {
    if (seenHist.has(entry.name)) warn(`histórica com nome repetido "${entry.name}": ${seenHist.get(entry.name)} e ${id}`);
    seenHist.set(entry.name, id);
  }

  // ---- idiomas
  const langOut = {};
  for (const entry of languages) {
    const own = langs[entry.id];
    if (!own?.idioma) { missing.langs.push(entry.id); continue; }
    const out = { idioma: own.idioma, paises: translateList(entry.paises, entry.id) };
    if (entry.tambem) out.tambem = translateList(entry.tambem, `${entry.id} (tambem)`);
    for (const key of ["significado", "falantes", "ranking"]) {
      if (!entry[key]) continue;
      if (own[key]) out[key] = own[key]; else missing.langs.push(`${entry.id}.${key}`);
    }
    langOut[entry.id] = out;
  }
  const seenLang = new Map();
  for (const [id, entry] of Object.entries(langOut)) {
    if (seenLang.has(entry.idioma)) warn(`idioma com nome repetido "${entry.idioma}": ${seenLang.get(entry.idioma)} e ${id}`);
    seenLang.set(entry.idioma, id);
  }

  mkdirSync(`public/data/i18n/${locale}`, { recursive: true });
  writeFileSync(`public/data/i18n/${locale}/catalog.json`, JSON.stringify({ meta }));
  writeFileSync(`public/data/i18n/${locale}/historical.json`, JSON.stringify({ entities: histOut }));
  writeFileSync(`public/data/i18n/${locale}/languages.json`, JSON.stringify({ entries: langOut }));

  const report = [
    [`países com nome`, Object.keys(meta).length, Object.keys(catalog).length],
    [`capitais`, Object.values(meta).filter((item) => item.cap).length, Object.values(catalog).filter((item) => item.cap).length],
    [`notas históricas de países`, Object.values(meta).filter((item) => item.fato).length, Object.values(catalog).filter((item) => item.fato).length],
    [`bandeiras históricas completas`, historical.length - new Set(missing.hist.map((key) => key.split(".")[0])).size, historical.length],
    [`idiomas completos`, languages.length - new Set(missing.langs.map((key) => key.split(".")[0])).size, languages.length],
  ];
  for (const [label, done, total] of report) console.log(`  ${label}: ${done}/${total}`);
  if (missing.lang.size) console.log(`  idiomas (nomes) sem tradução: ${missing.lang.size}`);
  if (missing.cur.size) console.log(`  moedas sem tradução: ${missing.cur.size}`);
  if (missing.names.length) warn(`sem nome: ${missing.names.join(", ")}`);
  if (missing.caps.length) warn(`sem capital: ${missing.caps.join(" | ")}`);
  if (process.argv.includes("--missing")) {
    console.log(JSON.stringify({ lang: [...missing.lang], cur: [...missing.cur], facts: missing.facts, hist: missing.hist, langs: missing.langs }, null, 1));
  }
}
if (problems) console.log(`${problems} problema(s) acima.`);
