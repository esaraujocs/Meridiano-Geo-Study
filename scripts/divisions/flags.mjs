// Bandeiras das unidades de um país do modo "Estados e províncias": build/divisions/<país>/flags/<CÓDIGO>.svg (baixadas do Wikimedia Commons
// por fetch-flags.py, todas em domínio público, licença conferida no download) → public/data/divisions/<país>/flags.json, no mesmo formato do
// acervo do mapa-múndi (public/data/legacy/flags.json): "svg:<svg…>" para as leves e uma imagem de 512 px para as pesadas (brasões com milhares
// de curvas: Rio de Janeiro, Alagoas, Rio Grande do Sul…), como o clássico fazia com as bandeiras pesadas dos países.
// Uso: node scripts/divisions/flags.mjs <país>  (precisa do Chrome; CHROME_PATH troca o caminho)
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rasterizer } from "../flag-tools.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const COUNTRY = (process.argv[2] ?? "").toLowerCase();
if (!COUNTRY) throw new Error("uso: node scripts/divisions/flags.mjs <país>");
const SOURCE = join(ROOT, "build", "divisions", COUNTRY, "flags");
const TARGET = join(ROOT, "public", "data", "divisions", COUNTRY, "flags.json");

const config = JSON.parse(await readFile(join(import.meta.dirname, "countries", `${COUNTRY}.json`), "utf8"));
const states = config.units.filter((unit) => unit.flagFile);
/** Domínio público ou CC0 sempre; CC BY e CC BY-SA só com "flagCredit" na config (as épocas), com o autor nos créditos das Opções. */
const accepted = (license) => /public domain|^cc0/i.test(license) || (Boolean(config.flagCredit) && /^cc by(-sa)? \d/i.test(license));
const licenses = JSON.parse(await readFile(join(SOURCE, "licenses.json"), "utf8"));

const tools = rasterizer();

const flags = {};
const ratios = {};
const sources = {};
for (const state of states) {
  const sigla = state.code;
  const id = `${COUNTRY}-${sigla.toLowerCase()}`;
  const { value, ratio, heavy } = await tools.flagValue(await readFile(join(SOURCE, `${sigla}.svg`), "utf8"));
  flags[id] = value;
  ratios[id] = Math.round(ratio * 1000) / 1000;
  const license = licenses[sigla];
  if (!license || !accepted(license.license)) throw new Error(`${sigla}: licença não conferida em licenses.json`);
  sources[id] = { file: license.file, url: license.url, license: license.license, ...(license.artist ? { artist: license.artist } : {}) };
  console.log(`${sigla}: ${heavy ? "imagem" : "svg"} · ${Math.round(flags[id].length / 1000)} kB · proporção ${ratios[id]}`);
}
await tools.close();

const document = {
  source: `Wikimedia Commons (${config.flagCredit ? "domínio público, CC0 e CC BY-SA com o autor em sources" : "bandeiras oficiais, domínio público"}); scripts/divisions/flags.mjs`,
  flags, ratio: ratios, sources,
};
await writeFile(TARGET, JSON.stringify(document));
const total = Object.values(flags).reduce((sum, value) => sum + value.length, 0);
console.log(`ok: ${Object.keys(flags).length} bandeiras · ${Math.round(total / 1000)} kB → ${TARGET}`);
