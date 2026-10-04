// Gentílicos e Moedas: o arquivo de dados (cobertura, nomes sem repetição, moedas atuais), as alternativas dos quatro sentidos (nunca duas certas,
// nunca dois textos iguais), o baralho de "Moeda → país" (uma rodada por moeda) e que os dois modos ficam fora do domínio.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-peoples-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/peoples.ts", "src/domain/dominated.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"]);
const people = await import(`file://${out}/peoples.js`);
const dominated = await import(`file://${out}/dominated.js`);
const file = JSON.parse(await readFile("public/data/peoples.json", "utf8"));
const meta = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8")).meta;

// ---- cobertura: todo país do filtro ONU (193 + Palestina e Vaticano) tem moeda, e todos menos o Vaticano têm gentílico
const unIds = Object.entries(meta).filter(([id, item]) => !item.absorvido && (item.un || id === "275" || id === "336")).map(([id]) => id);
assert.equal(unIds.length, 195);
const pt = people.localizePeoples(file, "pt");
assert.deepEqual(unIds.filter((id) => !pt.demonym[id]), ["336"], "só o Vaticano fica sem gentílico");
assert.deepEqual(unIds.filter((id) => id !== "275" && !people.mainCurrency(pt, id)), [], "todo país da ONU tem moeda");
assert.equal(people.mainCurrency(pt, "275"), null, "a Palestina não tem moeda própria: fica fora de Moedas");
for (const locale of ["pt", "en", "es"]) {
  const local = people.localizePeoples(file, locale);
  const names = Object.values(local.currencyName).map((name) => name.toLocaleLowerCase());
  assert.equal(new Set(names).size, names.length, `${locale}: nomes de moeda sem repetição`);
  for (const [id, name] of Object.entries(local.demonym)) assert.ok(name && !/^(de|da|do|of|del) /i.test(name) && !/[\/()]/.test(name), `${locale}: gentílico limpo em ${id} (${name})`);
}
// moedas atuais (anexo de 2026) e as escolhas à mão
assert.equal(people.mainCurrency(pt, "100"), "EUR", "a Bulgária usa o euro desde 2026");
assert.equal(people.mainCurrency(pt, "716"), "ZWG", "Zimbábue: ouro do Zimbábue");
assert.equal(people.mainCurrency(pt, "222"), "USD", "El Salvador: dólar (o colón não circula)");
assert.equal(people.mainCurrency(pt, "926"), "EUR", "Kosovo: euro");
assert.ok(pt.currencies["591"].includes("USD") && people.mainCurrency(pt, "591") === "PAB", "Panamá: balboa, com o dólar como segunda moeda");
// formas brasileiras
assert.equal(pt.demonym["124"], "canadense"); assert.equal(pt.demonym["616"], "polonês"); assert.equal(pt.demonym["203"], "tcheco"); assert.equal(pt.demonym["76"], "brasileiro");
assert.equal(pt.currencyName.CAD, "dólar canadense"); assert.equal(pt.currencyName.USD, "dólar americano");

// ---- alternativas: em todos os alvos do mundo, nos quatro sentidos, saem 3 erradas válidas
const world = Object.entries(meta).filter(([, item]) => !item.absorvido && !item.soBandeira).map(([id]) => id);
const shuffle = (list, seed) => { const result = [...list]; let state = seed; for (let index = result.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) >>> 0; const swap = state % (index + 1); [result[index], result[swap]] = [result[swap], result[index]]; } return result; };
const lower = (text) => text.toLocaleLowerCase();
for (const variant of ["gentilico-pais", "pais-gentilico", "moeda-pais", "pais-moeda"]) {
  const family = people.familyOfPeoplesVariant(variant);
  const pool = people.peoplesPool(world, pt, family);
  for (const [index, target] of pool.entries()) {
    const wrong = people.peoplesOptions(target, shuffle(pool, index + 1), pt, variant);
    assert.equal(wrong.length, 3, `${variant}/${target}: 3 erradas`);
    assert.ok(!wrong.includes(target));
    if (variant === "gentilico-pais") for (const id of wrong) assert.notEqual(lower(pt.demonym[id]), lower(pt.demonym[target]), `${target}: ${id} teria o mesmo gentílico`);
    if (variant === "moeda-pais") for (const id of wrong) assert.ok(!pt.currencies[id].includes(people.mainCurrency(pt, target)), `${target}: ${id} também usa a moeda`);
    if (variant === "pais-moeda") for (const id of wrong) assert.ok(!pt.currencies[target].includes(people.mainCurrency(pt, id)), `${target}: a moeda de ${id} também é dele`);
    if (variant === "pais-gentilico" || variant === "pais-moeda") {
      const texts = [target, ...wrong].map((id) => lower(people.optionText(pt, variant, id)));
      assert.equal(new Set(texts).size, 4, `${variant}/${target}: textos repetidos ${texts}`);
    }
  }
}
// os dois Congos (mesmo gentílico) nunca são a errada um do outro
assert.ok(!people.peoplesOptions("178", ["180", "76", "32", "250", "276"], pt, "gentilico-pais").includes("180"));
// o Lesoto também usa o rand: não é a errada de "Rand → país"
assert.ok(!people.peoplesOptions("710", ["426", "516", "76", "32", "250"], pt, "moeda-pais").includes("426"));

// ---- baralho de Moeda → país: uma rodada por moeda; os outros sentidos usam o recorte inteiro
const europe = world.filter((id) => meta[id].reg === "Europe");
const euroPool = people.peoplesPool(europe, pt, "moedas");
const euroDeck = people.peoplesDeckPool(euroPool, pt, "moeda-pais", "seed");
assert.equal(euroDeck.filter((id) => people.mainCurrency(pt, id) === "EUR").length, 1, "o euro aparece uma vez só");
assert.equal(euroDeck.length, people.peoplesDeckSize(euroPool, pt, "moeda-pais"));
assert.deepEqual(people.peoplesDeckPool(euroPool, pt, "moeda-pais", "seed"), euroDeck, "mesma semente, mesmo baralho");
assert.equal(people.peoplesDeckPool(euroPool, pt, "pais-moeda").length, euroPool.length);
assert.ok(euroPool.length > euroDeck.length + 15);

// ---- textos da pergunta
assert.equal(people.promptText(pt, "gentilico-pais", "76"), "Brasileiro");
assert.equal(people.promptText(pt, "moeda-pais", "76"), "Real");
assert.equal(people.promptText(pt, "pais-moeda", "76"), null, "no sentido País → moeda a pergunta é o nome do país");
assert.equal(people.optionText(pt, "pais-moeda", "124"), "Dólar canadense");

// ---- fora do domínio: acertar o gentílico 5 vezes não conquista o Brasil em pilar nenhum
const session = (family, variant) => ({ family, variant, complete: true, startedAt: 1, rounds: Array.from({ length: 6 }, (_, index) => ({ targetId: "76", correct: true, answeredAt: index + 1 })) });
assert.equal(dominated.conquestFromSessions([session("gentilicos", "gentilico-pais"), session("moedas", "pais-moeda")]).size, 0);
assert.equal(dominated.conquestFromSessions([session("mapa", "mapa")]).get("76").pillars.has("mapa"), true, "o Mapa continua conquistando");
console.log(`peoples: ${Object.keys(pt.demonym).length} gentílicos, ${Object.keys(pt.currencyName).length} moedas; alternativas, baralho e domínio verificados`);
