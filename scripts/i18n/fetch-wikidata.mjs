// Busca no Wikidata os nomes (e apelidos) de países e capitais em en/es para o catálogo do jogo.
// Saída: scripts/i18n/wikidata-catalog.json (bruto, com o QID de cada entidade). Não é carregado pelo jogo:
// build-i18n.mjs lê este arquivo + as traduções à mão (scripts/i18n/<locale>/*.json) e gera public/data/i18n/.
// Uso: node scripts/i18n/fetch-wikidata.mjs   (precisa de rede; rode de novo só se o catálogo mudar)
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["en", "es", "pt"];
const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8")).meta;
// Entidades sem ISO alfa-3 no Wikidata (ou com código que aponta para outra coisa): QID escolhido à mão.
const MANUAL_QID = JSON.parse(readFileSync("scripts/i18n/wikidata-manual.json", "utf8"));

async function sparql(query) {
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": "meridiano-i18n/0.1 (projeto pessoal de jogo de geografia)" } });
    if (response.ok) return (await response.json()).results.bindings;
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  throw new Error("Wikidata não respondeu");
}
const qidOf = (uri) => uri.replace("http://www.wikidata.org/entity/", "");
const norm = (value) => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// 1) QID por ISO alfa-3 (P298), preferindo o item que é país/território atual
const codes = Object.values(catalog).map((m) => m.cca3).filter(Boolean);
const byCode = new Map();
for (let i = 0; i < codes.length; i += 80) {
  const values = codes.slice(i, i + 80).map((code) => `"${code}"`).join(" ");
  const rows = await sparql(`SELECT ?item ?code (COUNT(?sl) AS ?links) WHERE { VALUES ?code { ${values} } ?item wdt:P298 ?code . FILTER NOT EXISTS { ?item wdt:P576 [] } OPTIONAL { ?sl schema:about ?item } } GROUP BY ?item ?code`);
  for (const row of rows) {
    const code = row.code.value, links = Number(row.links.value);
    if (!byCode.has(code) || byCode.get(code).links < links) byCode.set(code, { qid: qidOf(row.item.value), links });
  }
}
const qids = {};
for (const [id, meta] of Object.entries(catalog)) {
  const qid = MANUAL_QID[id] ?? byCode.get(meta.cca3)?.qid;
  if (qid) qids[id] = qid;
}
const missing = Object.keys(catalog).filter((id) => !qids[id]);

// 2) rótulos, apelidos e capitais (P36) com rótulos
const all = [...new Set(Object.values(qids))];
const labels = {}, aliases = {}, capitals = {};
for (let i = 0; i < all.length; i += 60) {
  const values = all.slice(i, i + 60).map((q) => `wd:${q}`).join(" ");
  for (const row of await sparql(`SELECT ?item ?l WHERE { VALUES ?item { ${values} } ?item rdfs:label ?l FILTER(lang(?l) IN ("en","es","pt")) }`)) {
    (labels[qidOf(row.item.value)] ??= {})[row.l["xml:lang"]] = row.l.value;
  }
  for (const row of await sparql(`SELECT ?item ?a WHERE { VALUES ?item { ${values} } ?item skos:altLabel ?a FILTER(lang(?a) IN ("en","es")) }`)) {
    ((aliases[qidOf(row.item.value)] ??= {})[row.a["xml:lang"]] ??= []).push(row.a.value);
  }
  for (const row of await sparql(`SELECT ?item ?cap ?l WHERE { VALUES ?item { ${values} } ?item p:P36 ?st . ?st ps:P36 ?cap . FILTER NOT EXISTS { ?st pq:P582 [] } ?cap rdfs:label ?l FILTER(lang(?l) IN ("en","es","pt")) }`)) {
    const list = (capitals[qidOf(row.item.value)] ??= {});
    (list[qidOf(row.cap.value)] ??= {})[row.l["xml:lang"]] = row.l.value;
  }
}

// 3) casa a capital do jogo (em pt) com uma das capitais do Wikidata pelo rótulo pt
const out = {}, capProblems = [];
for (const [id, meta] of Object.entries(catalog)) {
  const qid = qids[id];
  if (!qid) continue;
  const entry = { qid, name: {}, aliases: {} };
  for (const locale of LOCALES) if (labels[qid]?.[locale]) entry.name[locale] = labels[qid][locale];
  for (const locale of ["en", "es"]) if (aliases[qid]?.[locale]) entry.aliases[locale] = aliases[qid][locale];
  if (meta.cap) {
    const options = Object.entries(capitals[qid] ?? {});
    const match = options.find(([, l]) => norm(l.pt) === norm(meta.cap)) ?? (options.length === 1 ? options[0] : null);
    if (match) entry.cap = { qid: match[0], en: match[1].en, es: match[1].es, pt: match[1].pt };
    else capProblems.push(`${id} ${meta.pt}: jogo="${meta.cap}" wikidata=[${options.map(([, l]) => l.pt ?? l.en).join(", ")}]`);
  }
  out[id] = entry;
}
writeFileSync("scripts/i18n/wikidata-catalog.json", JSON.stringify(out, null, 1));
console.log(`${Object.keys(out).length}/${Object.keys(catalog).length} entidades com QID`);
if (missing.length) console.log("sem QID:", missing.map((id) => `${id} ${catalog[id].pt} (${catalog[id].cca3})`).join(" | "));
if (capProblems.length) console.log(`capitais sem casamento (${capProblems.length}):\n  ` + capProblems.join("\n  "));
