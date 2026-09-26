// Para cada entidade histórica, acha o artigo na Wikipédia em português (título exato ou busca) e lê os títulos
// equivalentes em inglês e espanhol (langlinks). Saída: scripts/i18n/wikipedia-historical.json, só para conferência:
// os nomes finais ficam em scripts/i18n/<locale>/historical.json, revisados à mão.
// Uso: node scripts/i18n/fetch-wikipedia-titles.mjs   (precisa de rede)
import { readFileSync, writeFileSync } from "node:fs";

const entities = JSON.parse(readFileSync("public/data/legacy/historical.json", "utf8")).entities;
const API = "https://pt.wikipedia.org/w/api.php";
const headers = { "User-Agent": "meridiano-i18n/0.1 (projeto pessoal de jogo de geografia)" };

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.ok) return response.json();
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`Wikipédia não respondeu: ${url}`);
}

// Lotes de 50 títulos por consulta (a API recusa muitas consultas seguidas).
async function langlinksBatch(titles) {
  // Um idioma por consulta (lllang): assim cada página traz no máximo um link e o lote não é cortado ao meio.
  const result = Object.fromEntries(titles.map((title) => [title, null]));
  for (const lang of ["en", "es"]) {
    const data = await api({ action: "query", titles: titles.join("|"), redirects: "1", prop: "langlinks", lllang: lang, lllimit: "max" });
    const alias = new Map();
    for (const item of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) alias.set(item.from, item.to);
    const resolve = (title) => { let current = title; for (let i = 0; i < 3 && alias.has(current); i += 1) current = alias.get(current); return current; };
    const pages = new Map((data.query?.pages ?? []).map((page) => [page.title, page]));
    for (const title of titles) {
      const page = pages.get(resolve(title));
      if (!page || page.missing) continue;
      result[title] ??= { article: page.title };
      const link = (page.langlinks ?? [])[0];
      if (link) result[title][lang] = link.title;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return result;
}

const out = {};
for (let i = 0; i < entities.length; i += 50) {
  const batch = entities.slice(i, i + 50);
  const result = await langlinksBatch(batch.map((entity) => entity.pt));
  for (const entity of batch) out[entity.id] = { pt: entity.pt, ...(result[entity.pt] ?? {}) };
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
writeFileSync("scripts/i18n/wikipedia-historical.json", JSON.stringify(out, null, 1));
const missing = Object.entries(out).filter(([, value]) => !value.en || !value.es);
console.log(`\n${entities.length} entidades; sem en ou es: ${missing.length}`);
