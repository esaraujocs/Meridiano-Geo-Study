import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-presets-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/presets.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "inherit" });
const P = await import(pathToFileURL(join(out, "presets.js")).href);

const draft = (over = {}) => ({ topFamily: "mapa", variant: "mapa", pace: "timed", roundTier: "short", region: "europa", onlyUn: false, ...over });
let n = 0;
const id = () => `id${++n}`;

// primeira da família vira ★; nome sugerido
let r = P.createPreset([], draft(), { id: id(), now: 1 });
assert.equal(r.ok, true);
assert.equal(r.preset.favorite, true);
assert.equal(r.preset.id, "preset:id1");
assert.equal(r.preset.name, "Clicar no mapa · Europa · 10");
let list = r.list;

// mesma configuração não duplica
r = P.createPreset(list, draft(), { id: id(), now: 2 });
assert.deepEqual([r.ok, r.error, r.existing.id], [false, "duplicate", "preset:id1"]);
// região vem normalizada: todas as regiões = mundo; ordem não importa
r = P.createPreset(list, draft({ region: ["europa", "asia"] }), { id: id(), now: 3 });
assert.equal(r.ok, true);
assert.equal(r.preset.favorite, false, "só a primeira da família vira ★");
assert.equal(r.preset.name, "Clicar no mapa · Europa + Ásia · 10");
list = r.list;
assert.equal(P.createPreset(list, draft({ region: ["asia", "europa"] }), { id: id(), now: 4 }).ok, false, "ordem das regiões não cria outra");

// treino/ONU no nome; nome digitado é limpo e cortado
r = P.createPreset(list, draft({ pace: "training", onlyUn: true, roundTier: "all", region: "mundo" }), { id: id(), now: 5, name: "  Estudo   da noite  " });
assert.equal(r.preset.name, "Estudo da noite");
assert.equal(P.defaultPresetName(P.configOf(draft({ pace: "training", onlyUn: true, roundTier: "all", region: "mundo" }))), "Clicar no mapa · Mundo · Todas · Treino · ONU");
assert.equal(P.createPreset([], draft(), { id: "x", now: 1, name: "a".repeat(80) }).preset.name.length, P.MAX_PRESET_NAME);
list = r.list;

// limite por família (5), outras famílias não contam
for (const region of ["africa", "caribe"]) list = P.createPreset(list, draft({ region }), { id: id(), now: 6 }).list;
assert.equal(P.presetsFor(list, "mapa").length, 5);
assert.deepEqual([P.createPreset(list, draft({ region: "pacifico" }), { id: id(), now: 7 }).ok, P.createPreset(list, draft({ region: "pacifico" }), { id: id(), now: 7 }).error], [false, "limit"]);
assert.equal(P.createPreset(list, draft({ topFamily: "capitais", variant: "capital-pais" }), { id: id(), now: 7 }).ok, true);

// ★ exclusiva por família
const second = P.presetsFor(list, "mapa")[1];
list = P.setFavorite(list, second.id, 8);
assert.deepEqual(P.presetsFor(list, "mapa").filter((p) => p.favorite).map((p) => p.id), [second.id]);
assert.equal(P.presetsFor(list, "mapa")[0].id, second.id, "★ aparece primeiro");
assert.equal(P.favoriteFor(list, "mapa").id, second.id);
assert.equal(P.favoriteFor(list, "idiomas"), null);

// apagar a ★ passa a coroa para a mais antiga que sobrou
list = P.removePreset(list, second.id, 9);
assert.equal(P.presetsFor(list, "mapa").length, 4);
assert.equal(P.presetsFor(list, "mapa").filter((p) => p.favorite).length, 1);
assert.equal(P.favoriteFor(list, "mapa").id, "preset:id1", "a mais antiga assume");
// apagar a última da família não deixa lixo
const solo = P.createPreset([], draft({ topFamily: "idiomas", variant: "idioma-nome", region: "mundo" }), { id: id(), now: 1 });
assert.deepEqual(P.removePreset(solo.list, solo.preset.id, 2), []);

// atualizar com o que está na tela: nome automático acompanha, nome próprio fica
let base = P.createPreset([], draft(), { id: id(), now: 1 }).list;
let u = P.updatePreset(base, base[0].id, draft({ region: "asia", pace: "training" }), 5);
assert.equal(u.ok, true);
assert.equal(u.preset.name, "Clicar no mapa · Ásia · 10 · Treino");
assert.equal(u.preset.updatedAt, 5);
const named = P.renamePreset(base, base[0].id, "Minha", 3);
u = P.updatePreset(named, named[0].id, draft({ region: "asia" }), 6);
assert.equal(u.preset.name, "Minha");
assert.equal(P.renamePreset(base, base[0].id, "   ", 4)[0].name, "Clicar no mapa · Europa · 10", "nome vazio volta ao sugerido");
// atualizar para uma config que já existe em outra favorita é recusado
const two = P.createPreset(base, draft({ region: "asia" }), { id: id(), now: 2 }).list;
assert.equal(P.updatePreset(two, two[0].id, draft({ region: "asia" }), 9).ok, false);

// leitura do banco: só registros do formato certo
const row = { ...base[0], source: "preset-v1" };
assert.deepEqual(P.parsePreset(row), base[0]);
for (const bad of [null, {}, { ...row, source: "outro" }, { ...row, id: "x" }, { ...row, topFamily: "xx" }, { ...row, variant: "capital-pais" }, { ...row, pace: "rapido" }, { ...row, roundTier: "1000" }, { ...row, region: [] }, { ...row, region: ["marte"] }]) {
  assert.equal(P.parsePreset(bad), null);
}
assert.equal(P.parsePreset({ ...row, name: "" }).name, "Clicar no mapa · Europa · 10", "nome vazio no banco volta ao sugerido");

// diferença entre listas (o que gravar e o que apagar)
const before = two;
const after = P.setFavorite(P.removePreset(before, before[1].id, 9), before[0].id, 9);
const d = P.diffPresets(before, after);
assert.deepEqual(d.removedIds, [before[1].id]);
assert.deepEqual(P.diffPresets(before, before), { changed: [], removedIds: [] });

console.log("presets: ok");

// última partida do Hub ("Continuar"): lê o que foi gravado e descarta o que o jogo não conhece
const last = P.configOf(draft({ topFamily: "capitais", variant: "escrita-capital", region: "mundo", roundTier: "long", pace: "timed" }));
assert.deepEqual(P.parseLastConfig(JSON.stringify(last), "capitais"), last, "ida e volta pelo localStorage");
assert.equal(P.parseLastConfig(JSON.stringify(last), "mapa"), null, "de outra família não vale");
assert.equal(P.parseLastConfig("{quebrado", "capitais"), null, "texto ilegível");
assert.equal(P.parseLastConfig(null, "capitais"), null);
assert.equal(P.parseLastConfig({ ...last, variant: "nao-existe" }, "capitais"), null, "modo desconhecido");
assert.equal(P.parseLastConfig({ ...last, pace: "veloz" }, "capitais"), null, "ritmo desconhecido");
assert.equal(P.parseLastConfig({ ...last, region: [] }, "capitais"), null, "sem recorte");
assert.equal(P.parseLastConfig({ ...last, region: ["marte"] }, "capitais"), null, "recorte desconhecido");
assert.equal(P.parseLastConfig({ ...last, onlyUn: 1 }, "capitais").onlyUn, true, "filtro vira booleano");
console.log("presets: última partida do Hub ok");
