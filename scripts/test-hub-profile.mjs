import assert from "node:assert/strict";
import {
  PILLAR_TITLES,
  TITLE_IDS,
  achievementCaption,
  clampPercent,
  collectionCaption,
  hubProfile,
  ratioPercent,
} from "../.tmp-hub-profile/hub-profile.js";

// Escala de maestria: cortes do jogo clássico.
const stageOf = (pct) => hubProfile({ masteryPct: pct, titleIds: [] }).title;
assert.deepEqual([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(stageOf),
  ["Novato", "Novato", "Aprendiz", "Aprendiz", "Explorador", "Explorador", "Navegador", "Navegador", "Geógrafo", "Geógrafo"]);
assert.equal(stageOf(-5), "Novato");
assert.equal(stageOf(250), "Geógrafo");
assert.equal(stageOf(Number.NaN), "Novato");

// Perfil novo (4%): título, próximo título e linha de maestria; sem selos.
const novato = hubProfile({ masteryPct: 4, titleIds: [] });
assert.equal(novato.title, "Novato");
assert.deepEqual(novato.next, { title: "Aprendiz", at: 20 });
assert.equal(novato.masteryLine, "4% de maestria · próximo: Aprendiz aos 20%");
assert.equal(novato.caption, "Próximo título: Aprendiz aos 20%");
assert.deepEqual(novato.earned, [], "sem título ganho, nenhum selo");

// Selos: só os ganhos, na ordem fixa dos pilares.
const geografo = hubProfile({ masteryPct: 97, titleIds: ["cartografo", "vexilologo"] });
assert.equal(geografo.title, "Geógrafo");
assert.equal(geografo.next, null, "no Geógrafo o próximo passo é o Cosmógrafo, não um corte de %");
assert.equal(geografo.masteryLine, "97% de maestria");
assert.deepEqual(geografo.earned.map((title) => title.id), ["vexilologo", "cartografo"]);
assert.equal(geografo.caption, "Falta Diplomata para Cosmógrafo");
assert.equal(hubProfile({ masteryPct: 85, titleIds: ["diplomata"] }).caption, "Faltam Vexilólogo e Cartógrafo para Cosmógrafo");
assert.equal(hubProfile({ masteryPct: 85, titleIds: [] }).caption, "Faltam Vexilólogo, Cartógrafo e Diplomata para Cosmógrafo");

// Cosmógrafo: os três títulos; vira o título do jogador e o teto.
const cosmo = hubProfile({ masteryPct: 40, titleIds: ["vexilologo", "cartografo", "diplomata", "cosmografo"] });
assert.equal(cosmo.title, "Cosmógrafo");
assert.equal(cosmo.next, null);
assert.equal(cosmo.caption, "Título máximo: Cosmógrafo");
assert.equal(cosmo.earned.length, 3);
assert.equal(hubProfile({ masteryPct: 90, titleIds: ["vexilologo", "cartografo", "diplomata"] }).caption, "Os três títulos de pilar estão completos");

// Com selos ganhos a linha de maestria não leva o "próximo título" (ele fica na legenda do card).
const comSelo = hubProfile({ masteryPct: 4, titleIds: ["vexilologo"] });
assert.equal(comSelo.masteryLine, "4% de maestria");
assert.equal(comSelo.caption, "Próximo título: Aprendiz aos 20%");

// Ids que o Hub lê das conquistas.
assert.deepEqual([...TITLE_IDS], ["vexilologo", "cartografo", "diplomata", "cosmografo"]);
assert.deepEqual(PILLAR_TITLES.map((title) => title.icon), ["flag", "map", "capital"]);

// Porcentagens.
assert.equal(clampPercent(3.6), 4);
assert.equal(clampPercent(-1), 0);
assert.equal(clampPercent(140), 100);
assert.equal(ratioPercent(210, 255), 82);
assert.equal(ratioPercent(1, 0), 0, "sem total não divide por zero");
assert.equal(ratioPercent(300, 255), 100);

// Legendas dos cards de progresso.
assert.equal(collectionCaption(210, 255), "45 faltando para completar o atlas");
assert.equal(collectionCaption(255, 255), "Atlas completo");
assert.equal(collectionCaption(0, 0), "", "carregando: sem legenda");
const base = { unlocked: 17, total: 30, titles: [], next: null };
assert.equal(achievementCaption({ ...base, next: { name: "Sete mares", current: 5, target: 7 } }), "Próximo: Sete mares · 5/7");
assert.equal(achievementCaption(base), "13 por desbloquear");
assert.equal(achievementCaption({ ...base, unlocked: 30 }), "Todas desbloqueadas");
assert.equal(achievementCaption({ unlocked: 0, total: 0, titles: [], next: null }), "");

console.log("hub profile: mastery title, earned badges and card captions verified");
