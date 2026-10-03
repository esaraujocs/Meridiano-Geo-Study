import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as d from "../.tmp-domain/dominated.js";

// ---- sessões de teste (só o que a regra lê) ----
let clock = 0;
const session = (family, variant, hits, extra = {}) => ({ id: `s${(clock += 1)}`, family, variant, mode: variant, complete: true, startedAt: clock * 1000, rounds: hits.map(([targetId, correct, assisted]) => ({ targetId, correct, assisted, responseTimeMs: 900 })), ...extra });
const streak = (family, variant, id, n, ok = true) => Array.from({ length: n }, () => session(family, variant, [[id, ok]]));
const recognized = (id, pillars, n = 5) => pillars.flatMap((p) => streak(p === "mapa" ? "mapa" : p, p === "mapa" ? "mapa" : p === "bandeiras" ? "nome-bandeira" : "capital-pais", id, n));
const wroteCapital = (id) => session("escrita", "escrita-capital", [[id, true]]);

// ---- conquista num pilar: 5 certas seguidas, para sempre ----
assert.deepEqual(Object.keys(d.conqueredByPillar(recognized("BR", ["mapa"]))), ["mapa", "bandeiras", "capitais"]);
assert.ok(d.conqueredByPillar(recognized("BR", ["mapa"])).mapa.has("BR"));
assert.ok(!d.conqueredByPillar(recognized("BR", ["mapa"], 4)).mapa.has("BR"), "4 seguidas não bastam");
const broken = [...streak("mapa", "mapa", "BR", 3), ...streak("mapa", "mapa", "BR", 1, false), ...streak("mapa", "mapa", "BR", 4)];
assert.ok(!d.conqueredByPillar(broken).mapa.has("BR"), "o erro no meio zera a sequência");
const lost = [...recognized("BR", ["mapa"]), ...streak("mapa", "mapa", "BR", 3, false)];
assert.ok(d.conqueredByPillar(lost).mapa.has("BR"), "conquistou, é para sempre: errar depois não tira");
// os pilares não se misturam
const mixed = [...streak("mapa", "mapa", "BR", 3), ...streak("bandeiras", "nome-bandeira", "BR", 3), ...streak("mapa", "mapa", "BR", 2)];
assert.ok(d.conqueredByPillar(mixed).mapa.has("BR"), "a sequência é por pilar: 3 + 2 no Mapa, mesmo com Bandeiras no meio");
assert.ok(!d.conqueredByPillar(mixed).bandeiras.has("BR"));
// suprimento e partida abandonada não contam
const assisted = streak("mapa", "mapa", "BR", 5).map((s) => ({ ...s, rounds: s.rounds.map((r) => ({ ...r, assisted: true })) }));
assert.ok(!d.conqueredByPillar(assisted).mapa.has("BR"), "rodada com suprimento não conta");
assert.ok(!d.conqueredByPillar(recognized("BR", ["mapa"]).map((s) => ({ ...s, complete: false }))).mapa.has("BR"), "partida incompleta não conta");

// ---- dominado: 2 pilares + a capital escrita ----
assert.ok(d.masteredIdsFromSessions([...recognized("BR", ["mapa", "bandeiras"]), wroteCapital("BR")]).has("BR"), "2 pilares + capital escrita: dominado");
assert.ok(!d.masteredIdsFromSessions(recognized("BR", ["mapa", "bandeiras"])).has("BR"), "sem escrever a capital não domina");
assert.ok(!d.masteredIdsFromSessions([...recognized("BR", ["mapa"]), wroteCapital("BR")]).has("BR"), "1 pilar só não domina");
assert.ok(!d.masteredIdsFromSessions([...recognized("BR", ["mapa", "bandeiras"]), session("escrita", "escrita-capital", [["BR", false]])]).has("BR"), "capital escrita errada não vale");
assert.ok(!d.masteredIdsFromSessions([...recognized("BR", ["mapa", "bandeiras"]), session("escrita", "escrita-pais", [["BR", true]])]).has("BR"), "escrever o nome do país não substitui a capital");
const forever = [...recognized("BR", ["mapa", "bandeiras"]), wroteCapital("BR"), ...streak("mapa", "mapa", "BR", 6, false)];
assert.ok(d.masteredIdsFromSessions(forever).has("BR"), "dominado não se perde");
// a escrita da capital NÃO conta como sequência de reconhecimento em Capitais
const onlyWriting = [...streak("escrita", "escrita-capital", "BR", 5)];
assert.ok(!d.conqueredByPillar(onlyWriting).capitais.has("BR"), "5 escritas certas não conquistam o pilar Capitais (que é reconhecimento)");
// países sem capital (Antártida 10 e Macau 446): vale escrever o nome do país
assert.ok(d.masteredIdsFromSessions([...recognized("10", ["mapa", "bandeiras"]), session("escrita", "escrita-pais", [["10", true]])]).has("10"));
assert.ok(!d.masteredIdsFromSessions([...recognized("10", ["mapa", "bandeiras"]), wroteCapital("10")]).has("10"));

// ---- a regra antiga segue intacta (é o que o XP usa) ----
const old = [session("mapa", "mapa", [["x", true]]), session("bandeiras", "nome-bandeira", [["x", true]]), session("mapa", "mapa", [["x", true]])];
assert.equal(d.everDominatedFromSessions(old), 1, "3 certas em 2 modos ainda rendem XP");
assert.equal(d.masteredFromSessions(old), 0, "mas não bastam para dominar");

// ---- o catálogo confere com NO_CAPITAL_IDS ----
const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8"));
const withoutCapital = catalog.mapEntityIds.filter((id) => !catalog.meta[id].cap).map(String).sort();
assert.deepEqual(withoutCapital, [...d.NO_CAPITAL_IDS].sort(), "NO_CAPITAL_IDS tem de ser exatamente os países do mapa sem capital");

console.log("domain: conquista por pilar, dominado permanente, escrita da capital e regra antiga do XP verificados");
