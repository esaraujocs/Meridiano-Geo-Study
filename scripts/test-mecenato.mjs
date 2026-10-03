// Mecenato v2: preços e tempos, aceleração (rendimento decrescente e teto de 70%), baú de bordo e achados, porto pelo Patronato, estado das rotas
// e a migração das peças do Museu antigo (quem já tinha Waldseemüller e Ortelius fica com as etapas 1 e 2 e os itens delas).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-mecenato-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/mecenato.ts", "src/domain/map-styles.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"]);
const mec = await import(`file://${out}/mecenato.js`);
const styles = await import(`file://${out}/map-styles.js`);

// ---- preços: ~9 mi no total (rotas 5,4 mi = 60%; as grandes ficam para a fase 3)
const routeTotal = (weight) => mec.STAGE_COSTS[weight].reduce((sum, value) => sum + value, 0);
assert.equal(routeTotal("cena"), 1_050_000);
assert.equal(routeTotal("toque"), 700_000);
assert.equal(routeTotal("duelo"), 870_000);
const allRoutes = mec.ROUTES.reduce((sum, route) => sum + routeTotal(route.weight), 0);
assert.equal(allRoutes, 3 * 1_050_000 + 2 * 700_000 + 870_000, "três rotas de cena, duas de toque e uma de duelo");
assert.deepEqual(mec.STAGE_HOURS, [2, 6, 12, 24]);
assert.equal(mec.ROUTES.filter((route) => route.open).map((route) => route.id).join(), "velho", "só o Velho Mundo abre na fase 1");
const velho = mec.routeById("velho");
assert.deepEqual(velho.stages.map((stage) => stage.item), ["estilo-1507", "moldura-teatro", "estilo-navegante", "estilo-iluminura"]);
assert.deepEqual(velho.stages.map((stage) => stage.piece), ["waldseemuller-1507", "ortelius-1570", "mercator-1569", "fra-mauro-1450"]);
for (const id of mec.ITEM_IDS) assert.ok(mec.itemPiece(id), `${id} tem uma peça`);

// ---- aceleração: corta cada vez menos, nunca passa de 70%, depois enche o baú
const record = { id: "velho-3", route: "velho", stage: 2, startedAt: 0, durationMs: 12 * 3_600_000, cost: 300_000 };
let progress = mec.emptyProgress();
progress = mec.applyHit(record, progress, { tier: 2 });
assert.equal(progress.cutMs, 20_000, "o primeiro acerto médio corta 20 s");
const easy = mec.applyHit(record, mec.emptyProgress(), { tier: 1 }).cutMs, hard = mec.applyHit(record, mec.emptyProgress(), { tier: 3 }).cutMs;
assert.ok(easy < 20_000 && hard > 20_000, "país fácil rende menos, difícil rende mais");
assert.equal(mec.applyHit(record, mec.emptyProgress(), { tier: 2, training: true }).cutMs, 10_000, "Treino conta metade");
const cap = mec.maxCutMs(record.durationMs);
assert.equal(cap, Math.round(12 * 3_600_000 * 0.7));
let hits = 0; progress = mec.emptyProgress(); let previous = Infinity;
while (progress.cutMs < cap && hits < 100_000) { const before = progress.cutMs; progress = mec.applyHit(record, progress, { tier: 2 }); const gain = progress.cutMs - before; assert.ok(gain <= previous + 1e-6, "rendimento decrescente"); previous = gain; hits += 1; }
assert.equal(progress.cutMs, cap, "o corte para no teto");
assert.ok(hits > 2_000 && hits < 6_000, `uma etapa de 12 h pede alguns milhares de acertos na região (${hits})`);
const remainingAtCap = mec.remainingMs(record, progress, 0);
assert.equal(remainingAtCap, record.durationMs - cap, "no teto ainda faltam 30% da viagem");
const afterCap = mec.applyHit(record, progress, { tier: 3 });
assert.equal(afterCap.cutMs, cap, "depois do teto o corte não anda");
assert.equal(afterCap.chest, 1.4, "e o acerto vai para o baú, com o peso do país");
assert.equal(mec.isBack(record, progress, record.durationMs - cap), true, "volta quando o relógio alcança o que sobrou");
assert.equal(mec.isBack(record, progress, record.durationMs - cap - 1), false);

// ---- quais acertos aceleram o Velho Mundo: Mapa (variante mapa) em país da Europa
assert.equal(mec.hitMatches(velho, { family: "mapa", variant: "mapa", reg: "Europe" }), true);
assert.equal(mec.hitMatches(velho, { family: "mapa", variant: "mapa", reg: "Asia" }), false, "outro continente não acelera");
assert.equal(mec.hitMatches(velho, { family: "bandeiras", variant: "bandeira-nome", reg: "Europe" }), false, "outro modo não acelera");
assert.equal(mec.hitMatches(velho, { family: "silhueta", variant: "silhueta", reg: "Europe" }), false);

// ---- baú de bordo e achados: sempre os mesmos para a mesma expedição
assert.equal(mec.chestTier(0), "normal"); assert.equal(mec.chestTier(149), "normal"); assert.equal(mec.chestTier(150), "farto"); assert.equal(mec.chestTier(400), "abundante");
const loot = mec.lootFor(record, 0);
assert.deepEqual(loot, mec.lootFor(record, 10), "mesmo nível de baú, mesmos achados");
assert.equal(Object.values(loot.supplies).reduce((a, b) => a + b, 0), 2);
assert.equal(loot.coins, 9_000, "3% das moedas de volta no baú normal");
const rich = mec.lootFor(record, 500);
assert.equal(Object.values(rich.supplies).reduce((a, b) => a + b, 0), 6);
assert.equal(rich.coins, 30_000, "10% no baú abundante");
assert.ok(!Object.keys(rich.supplies).some((id) => id === "tonico" || id === "escudo"), "Tônico e Escudo não vêm de expedição");

// ---- Patronato e porto
assert.equal(mec.rankFor(0), null); assert.equal(mec.rankFor(25_000).id, "amigo"); assert.equal(mec.rankFor(149_999).id, "amigo"); assert.equal(mec.rankFor(150_000).id, "colecionador"); assert.equal(mec.rankFor(5_000_000).id, "grande");
assert.equal(mec.nextRank(0).id, "amigo"); assert.equal(mec.nextRank(5_000_000), null);
assert.equal(mec.portSlots(0), 1); assert.equal(mec.portSlots(100_000), 1); assert.equal(mec.portSlots(150_000), 2); assert.equal(mec.portSlots(600_000), 3);

// ---- estado das rotas e quando dá para zarpar
const view = (patch = {}) => ({ ownedPieces: new Set(), expeditions: [], landed: new Set(), progress: {}, invested: 0, balance: 1_000_000, now: 10, ...patch });
assert.deepEqual(mec.stageStates(velho, view()), ["next", "locked", "locked", "locked"]);
assert.equal(mec.nextStage(velho, view()), 0);
assert.equal(mec.launchBlock(velho, view()), null);
assert.equal(mec.launchBlock(velho, view({ balance: 59_999 })), "coins");
assert.equal(mec.launchBlock(mec.routeById("indias"), view()), "closed");
// migração: peças do Museu antigo contam como etapas feitas e os itens já são da pessoa
const migrated = view({ ownedPieces: new Set(["waldseemuller-1507", "ortelius-1570", "blue-marble-1972"]), invested: 300_000 });
assert.deepEqual(mec.stageStates(velho, migrated), ["done", "done", "next", "locked"]);
assert.equal(mec.itemOwned("estilo-1507", migrated.ownedPieces), true);
assert.equal(mec.itemOwned("moldura-teatro", migrated.ownedPieces), true);
assert.equal(mec.itemOwned("estilo-navegante", migrated.ownedPieces), false);
assert.equal(mec.portSlots(migrated.invested), 2, "quem gastou 300 mil no Museu antigo já é Colecionador");
// uma expedição no mar: a rota fica ocupada; quando o porto enche, nenhuma outra sai
const sailing = { ...record, startedAt: 0 };
const atSea = view({ ownedPieces: migrated.ownedPieces, expeditions: [sailing], now: 1 });
assert.deepEqual(mec.stageStates(velho, atSea), ["done", "done", "running", "locked"]);
assert.equal(mec.launchBlock(velho, atSea), "busy");
const backView = { ...atSea, now: record.durationMs + 1 };
assert.equal(mec.stageStates(velho, backView)[2], "back");
assert.equal(mec.activeExpeditions(backView).length, 1, "voltou, mas ainda ocupa o porto até desembarcar");
const landed = { ...backView, landed: new Set(["velho-3"]), ownedPieces: new Set([...migrated.ownedPieces, "mercator-1569"]) };
assert.equal(mec.activeExpeditions(landed).length, 0, "desembarcou: o lugar no porto fica livre");
assert.deepEqual(mec.stageStates(velho, landed), ["done", "done", "done", "next"]);
const complete = view({ ownedPieces: new Set(velho.stages.map((stage) => stage.piece)) });
assert.equal(mec.launchBlock(velho, complete), "complete");
assert.equal(mec.expeditionId("velho", 0), "velho-1", "id da expedição é fixo por etapa (dois aparelhos não criam duas)");

// ---- estilos de mapa: o acerto e o erro se distinguem da terra e do mar
const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [id, style] of Object.entries(styles.MAP_STYLES)) {
  const p = style.palette;
  assert.ok(contrast(p.answer, p.land) >= 3, `${id}: acerto contra a terra (${contrast(p.answer, p.land).toFixed(2)})`);
  assert.ok(contrast(p.wrong, p.land) >= 3, `${id}: erro contra a terra (${contrast(p.wrong, p.land).toFixed(2)})`);
  assert.ok(contrast(p.outline, p.land) >= 3, `${id}: contorno contra a terra`);
  assert.ok(styles.roseSvg(style).startsWith("<svg"), `${id}: rosa dos ventos`);
  assert.ok(mec.ITEM_IDS.includes(id), `${id} é um item do Mecenato`);
}
assert.equal(styles.withMapStyle({ ocean: "#000", land: "#111" }, "estilo-1507").ocean, "#ECDCB6");
assert.equal(styles.withMapStyle({ ocean: "#000" }, "nenhum").ocean, "#000", "sem estilo, vale a paleta do tema");
console.log("mecenato: preços, aceleração, baú e achados, Patronato e porto, estado das rotas, migração e contraste dos estilos verificados");
