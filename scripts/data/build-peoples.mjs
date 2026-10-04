// Gera public/data/peoples.json (gentílicos e moedas dos modos Gentílicos e Moedas) a partir de:
// - scripts/data/peoples/eu-a5-2026-10.json: Anexo A5 do Código de Redação Interinstitucional da UE (países, gentílicos e moedas com o código
//   ISO 4217, em pt/es/en), baixado de style-guide.europa.eu em 04/10/2026;
// - scripts/data/peoples/overrides.json: formas brasileiras, lacunas do anexo (das listas de gentílicos das Wikipédias) e a moeda principal.
// Sem rede. Uso: node scripts/data/build-peoples.mjs
import { readFileSync, writeFileSync } from "node:fs";

const a5 = JSON.parse(readFileSync("scripts/data/peoples/eu-a5-2026-10.json", "utf8"));
const overrides = JSON.parse(readFileSync("scripts/data/peoples/overrides.json", "utf8"));
const meta = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8")).meta;
const LOCALES = ["pt", "es", "en"];
// o anexo usa EL para a Grécia e UK para o Reino Unido
const A5_CODE = { GR: "EL", GB: "UK" };

const clean = (text) => text.replace(/‑|--/g, "-").replace(/\s+/g, " ").trim();
// "brasileiro/a(s)" → "brasileiro"; "alemão (alemães)//alemã(s)" → "alemão"
const ptDemonym = (text) => clean(text.split("//")[0].replace(/\(.*?\)/g, "").split("/")[0]);
const esDemonym = (text) => clean(text.split(",")[0].split("/")[0]);
const enDemonym = (text) => clean(text.split(";")[0].split(",")[0].split("/")[0]);
const DEMONYM = { pt: ptDemonym, es: esDemonym, en: enDemonym };
// "de Samoa Americana", "of Dominica": o anexo não dá gentílico
const noDemonym = (text) => !text || text === "—" || /^(de|da|do|das|dos|del|of)\b/i.test(text);
// "dólar [australiano]" → "dólar australiano"; tira "(inv.)", "(pl. reais)" e "(Santa Helena e Ascensão)"
const currencyName = (text) => clean(text.replace(/\[|\]/g, "").replace(/\((?:inv\.|pl\.[^)]*|[^)]*(?: e | y | and )[^)]*)\)/g, ""));

const currencies = {};
const entries = {};
const problems = [];
for (const [id, entity] of Object.entries(meta)) {
  if (entity.absorvido || entity.soBandeira) continue;
  const iso = (entity.cca2 ?? "").toUpperCase();
  const row = a5[A5_CODE[iso] ?? iso];
  const entry = {};
  // gentílico: do anexo, com as correções por cima; só entra com os três idiomas
  if (!overrides.excludeDemonyms.includes(id)) {
    const fix = overrides.demonyms[id] ?? {};
    const dem = {};
    for (const locale of LOCALES) {
      const raw = row?.[locale]?.dem;
      dem[locale] = fix[locale] ?? (noDemonym(raw) ? null : DEMONYM[locale](raw));
    }
    if (LOCALES.every((locale) => dem[locale])) entry.dem = dem;
  }
  // moedas: códigos ISO 4217 na ordem do anexo (a primeira é a principal)
  if (!overrides.excludeCurrencies.includes(id)) {
    const codes = [...(row?.pt.curs ?? []).filter(([, code]) => /^[A-Z]{3}$/.test(code)).map(([, code]) => code), ...(overrides.extraCurrencies[id] ?? [])];
    const main = overrides.mainCurrency[id];
    if (main) { if (!codes.includes(main)) problems.push(`${id}: moeda principal ${main} fora da lista`); codes.splice(codes.indexOf(main), 1); codes.unshift(main); }
    if (codes.length) entry.cur = [...new Set(codes)];
    for (const code of entry.cur ?? []) {
      if (currencies[code]) continue;
      const source = Object.values(a5).find((item) => item.pt.curs.some(([, other]) => other === code));
      const names = {};
      for (const locale of LOCALES) {
        const raw = source?.[locale].curs.find(([, other]) => other === code)?.[0];
        names[locale] = overrides.currencyNames[code]?.[locale] ?? (raw ? currencyName(raw) : null);
      }
      if (!LOCALES.every((locale) => names[locale])) problems.push(`${code}: nome faltando`);
      currencies[code] = names;
    }
  }
  if (entry.dem || entry.cur) entries[id] = entry;
}
// nenhum nome de moeda pode repetir no mesmo idioma (as alternativas ficariam iguais)
for (const locale of LOCALES) {
  const seen = new Map();
  for (const [code, names] of Object.entries(currencies)) {
    const key = names[locale].toLocaleLowerCase(locale);
    if (seen.has(key)) problems.push(`${locale}: "${names[locale]}" em ${seen.get(key)} e ${code}`);
    seen.set(key, code);
  }
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
const output = {
  version: 1,
  source: "Anexo A5 do Código de Redação Interinstitucional da UE (style-guide.europa.eu, 04/10/2026), com formas brasileiras e lacunas das listas de gentílicos das Wikipédias pt/en/es (scripts/data/peoples/overrides.json)",
  currencies: sorted(currencies),
  entries: sorted(entries),
};
writeFileSync("public/data/peoples.json", `${JSON.stringify(output)}\n`);
const withDem = Object.values(entries).filter((entry) => entry.dem).length;
const withCur = Object.values(entries).filter((entry) => entry.cur).length;
console.log(`peoples.json: ${withDem} gentílicos, ${withCur} entidades com moeda, ${Object.keys(currencies).length} moedas`);
