import assert from "node:assert/strict";
import {
  LEVEL_STEPS,
  cardDetailRows,
  formatArea,
  formatPopulation,
  historicalPeriod,
  historicalTypeLabel,
  levelCounts,
  matchesSearch,
  modesDone,
  nextLevelHint,
  normalizeText,
  placeLabel,
  sortByName,
  subRegionLabel,
} from "../.tmp-collection-view/collection-view.js";

// Rótulos em português (a tela mostrava "Asia" / "Europe").
assert.equal(placeLabel({ reg: "Africa", sub: "Northern Africa" }), "África Setentrional", "não repete o continente");
assert.equal(placeLabel({ reg: "Asia", sub: "South-Eastern Asia" }), "Sudeste Asiático");
assert.equal(placeLabel({ reg: "Europe", sub: "Southeast Europe" }), "Sudeste Europeu");
assert.equal(placeLabel({ reg: "Americas", sub: "Central America" }), "América Central");
assert.equal(placeLabel({ reg: "Americas", sub: "Caribbean" }), "Américas · Caribe");
assert.equal(placeLabel({ reg: "Oceania", sub: "Polynesia" }), "Oceania · Polinésia");
assert.equal(placeLabel({ reg: "Asia", sub: null }), "Ásia");
assert.equal(placeLabel({ reg: "Antarctic", sub: null }), "Antártida");
assert.equal(placeLabel(undefined), "");
assert.equal(subRegionLabel("Alguma Coisa Nova"), "Alguma Coisa Nova", "desconhecido cai no valor original");

// Busca sem acento e sem diferença de caixa; ordem A–Z em português.
assert.equal(normalizeText("  Áustria "), "austria");
assert.equal(matchesSearch("Áustria", "aus"), true);
assert.equal(matchesSearch("Antígua e Barbuda", "antigua"), true);
assert.equal(matchesSearch("Bahrein", "  "), true, "busca vazia mostra tudo");
assert.equal(matchesSearch("Bahrein", "xyz"), false);
assert.deepEqual(sortByName([{ name: "Áustria" }, { name: "Alemanha" }, { name: "África do Sul" }, { name: "Zâmbia" }, { name: "Andorra" }]).map((x) => x.name),
  ["África do Sul", "Alemanha", "Andorra", "Áustria", "Zâmbia"]);

assert.deepEqual(levelCounts([{ mastery: 0 }, { mastery: 1 }, { mastery: 1 }, { mastery: 5 }, { mastery: 9 }]), [1, 2, 0, 0, 0, 2], "acima de 5 é limitado ao 5");

// Formatação.
assert.equal(formatPopulation(42228429), "42,2 milhões");
assert.equal(formatPopulation(55197), "55 mil");
assert.equal(formatPopulation(770), "770");
assert.equal(formatPopulation(undefined), undefined);
assert.equal(formatPopulation(0), undefined);
assert.equal(formatArea(2381741), "2.381.741 km²");
assert.equal(formatArea(undefined), undefined);

// Campos por nível: Argélia no nível 3 abre capital, idioma e moeda; o resto fica trancado.
const argelia = { pt: "Argélia", cap: "Argel", lang: ["Árabe"], cur: ["Dinar argelino"], pop: 42228429, area: 2381741, un: true, borders: ["TUN", "MAR"], fato: "Independência em 1962." };
const names = { TUN: "Tunísia", MAR: "Marrocos" };
const rows = cardDetailRows(argelia, 3, names);
const by = (key) => rows.find((row) => row.key === key);
assert.deepEqual(rows.map((row) => row.key), ["capital", "idioma", "moeda", "populacao", "area", "onu", "vizinhos", "nota"]);
assert.equal(by("capital").unlocked, true);
assert.equal(by("idioma").text, "Árabe");
assert.equal(by("moeda").unlocked, true);
assert.equal(by("populacao").unlocked, false);
assert.equal(by("populacao").minLevel, 4);
assert.equal(by("nota").unlocked, false);
assert.deepEqual(by("vizinhos").list, ["Marrocos", "Tunísia"], "vizinhos por nome, em ordem alfabética");
assert.equal(cardDetailRows(argelia, 1).filter((row) => row.unlocked).length, 0, "nível 1 só abre a região (no cabeçalho)");
assert.equal(cardDetailRows(argelia, 5).every((row) => row.unlocked), true);
assert.equal(cardDetailRows(argelia, 4).find((row) => row.key === "onu").text, "Membro");
assert.equal(cardDetailRows({ ...argelia, un: false }, 4).find((row) => row.key === "onu").text, "Não membro");

// Dado ausente não quebra nem promete o que não existe.
const semNota = cardDetailRows({ pt: "Ilha", borders: [] }, 5);
assert.equal(semNota.some((row) => row.key === "nota"), false, "sem nota histórica não há linha de nota");
assert.equal(semNota.find((row) => row.key === "vizinhos").text, "Sem fronteira terrestre");
assert.equal(semNota.find((row) => row.key === "capital").text, undefined);
assert.equal(cardDetailRows({ pt: "Sem dado" }, 5).find((row) => row.key === "vizinhos").text, undefined, "sem o campo borders não afirma que é ilha");
assert.equal(cardDetailRows(undefined, 3).length, 7);

// Modos acertados e próxima camada.
assert.deepEqual(modesDone({ bandeiras: 3, mapa: 1, capitais: 2 }).map((mode) => mode.done), [true, true, true, false]);
assert.equal(modesDone(undefined).every((mode) => !mode.done), true);
assert.equal(nextLevelHint("Argélia", 3, { bandeiras: 1, mapa: 1, capitais: 1 }).text, "Acerte Argélia em mais um modo para abrir população, área, vizinhos e ONU.");
assert.equal(nextLevelHint("Argélia", 3, { bandeiras: 1, mapa: 1, capitais: 1 }).next, 4);
assert.equal(nextLevelHint("Chile", 2, { bandeiras: 1, mapa: 1 }).text, "Acerte Chile em mais um modo para abrir o idioma e a moeda.");
assert.equal(nextLevelHint("Peru", 1, { bandeiras: 1 }).text, "Acerte Peru em mais um modo para abrir a capital.");
assert.equal(nextLevelHint("Peru", 1, undefined).text, "Acerte Peru em mais 2 modos para abrir a capital.", "sem colunas registradas: faltam 2 modos para o nível 2");
assert.match(nextLevelHint("Cuba", 4, { bandeiras: 1, mapa: 1, capitais: 1, escrita: 1 }).text, /faltam 1 na escrita e 1 em capitais/);
assert.match(nextLevelHint("Cuba", 4, { bandeiras: 1, mapa: 1, capitais: 2, escrita: 1 }).text, /faltam 1 na escrita\)/);
assert.equal(nextLevelHint("Cuba", 5, {}), null);
assert.deepEqual(LEVEL_STEPS.map((step) => step.level), [1, 2, 3, 4, 5]);

// Históricas.
assert.equal(historicalPeriod({ ini: 1299, fim: 1922 }), "1299–1922");
assert.equal(historicalPeriod({ ini: 1949 }), "1949–");
assert.equal(historicalPeriod({}), "");
assert.equal(historicalTypeLabel("extinto"), "País extinto");
assert.equal(historicalTypeLabel(undefined), "");

console.log("collection view: labels, search, reveal rules and next-level hint verified");
