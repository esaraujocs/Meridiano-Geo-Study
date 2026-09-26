import type { ProgressSnapshot, SurfaceSession } from "./progress-surfaces";
import { MAP_ERROR_GOAL_KM, MAP_ERROR_MIN_ROUNDS, meanMapErrorKm } from "./map-error.js";
import { t } from "./i18n/index.js";

export type AchievementCategory = "hab" | "exp" | "conh" | "evo" | "dom" | "desc";
export type AchievementDefinition = {
  id: string; category: AchievementCategory; rarity: 1 | 2 | 3 | 4 | 5;
  name: string; description: string; hidden?: boolean;
  target: (context: AchievementContext) => number;
  progress: (context: AchievementContext) => number;
};
export type AchievementLifecycleEvent = { phase: "round" | "finish"; sessionId: string; roundCount: number };
let lifecycleListener: ((event: AchievementLifecycleEvent) => void | Promise<void>) | null = null;
export function registerAchievementLifecycleListener(listener: ((event: AchievementLifecycleEvent) => void | Promise<void>) | null) {
  lifecycleListener = listener;
}
export async function notifyAchievementLifecycle(event: AchievementLifecycleEvent) {
  await lifecycleListener?.(event);
}
export type AchievementContext = {
  progress: ProgressSnapshot;
  sessions: SurfaceSession[];
  completed: SurfaceSession[];
  modes: Set<string>; regions: Set<string>; capitalRegions: Set<string>;
  bestStreak: number; perfect20: boolean; perfect40: boolean; precise: boolean;
  worldComplete: boolean; dominated: number; flags: number; capitals: number;
  micro: number; continents: number; wholeContinent: boolean; masteryIndex: number;
  fit: boolean; evolved: boolean; titles: Set<string>; cosmo: boolean;
  byWater: number; lightning: number; confines: boolean;
  /** Recortes (dos 7 regionais, Mundo à parte) fechados com o baralho inteiro e 100% de acerto, por modo. */
  perfectRegionsMapa: Set<string>; perfectRegionsCapitais: Set<string>;
  perfectRegionsBandeiras: Set<string>; perfectRegionsIdiomas: Set<string>;
  /** As 5 zonas (ver ZONES) já fechadas, por modo — cada zona exige todo recorte dela em perfectRegions. */
  zonesMapa: Set<string>; zonesCapitais: Set<string>; zonesBandeiras: Set<string>;
  /** Cobertura dos modos que nunca tiveram conquista própria (ver seção "revisitada" de 23/09/2026). */
  silhouettes: Set<string>; historicalEntities: Set<string>; languagesKnown: Set<string>;
  travelRoutes: number; writtenCorrect: number;
};
const one = (f: (c: AchievementContext) => boolean) => ({ target: () => 1, progress: (c: AchievementContext) => f(c) ? 1 : 0 });
const finiteTarget = (c: AchievementContext, min: number, fallback: number) => Math.max(min, Math.min(fallback, c.completed[0]?.rounds.length || fallback));

// Um recorte só conta se for um único recorte regional (não Mundo, não uma seleção combinada de vários) —
// "concluir o recorte" não faz sentido pra uma mistura de dois, o total muda.
const NON_WORLD_REGIONS = ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
const singleRegionOf = (s: SurfaceSession): string | null => {
  const region = s.regions?.length ? (s.regions.length === 1 ? s.regions[0] : null) : s.region;
  return region && NON_WORLD_REGIONS.includes(region) ? region : null;
};
// "Baralho inteiro" só é verificável se a sessão gravou `roundLimit` — em partida antiga migrada esse campo
// não existe (`undefined`), então ela nunca conta pra essas conquistas novas, mesmo se por acaso bateu 100%.
const perfectRegionsFor = (sessions: readonly SurfaceSession[], family: string) => {
  const regions = new Set<string>();
  for (const s of sessions) {
    if (s.family !== family || s.roundLimit !== null || !s.complete) continue;
    if (!s.rounds.length || s.correct !== s.rounds.length) continue;
    const region = singleRegionOf(s);
    if (region) regions.add(region);
  }
  return regions;
};

// Os 7 recortes regionais agrupados em 5 zonas maiores, só para as conquistas "zona sem falhas" — não muda
// a tela de Recorte nem exige uma partida combinada: cada recorte da zona ainda precisa ser fechado sozinho
// (perfectRegionsFor já garante isso). Américas junta os 3 recortes americanos; os outros 4 já eram um só.
const ZONES: { id: string; label: string; regions: string[] }[] = [
  { id: "americas", label: "Américas", regions: ["caribe", "america-do-sul", "america-do-norte-central"] },
  { id: "africa", label: "África", regions: ["africa"] },
  { id: "asia", label: "Ásia", regions: ["asia"] },
  { id: "europa", label: "Europa", regions: ["europa"] },
  { id: "oceania", label: "Oceania", regions: ["pacifico"] },
];
const zonesFor = (perfectRegions: Set<string>) =>
  new Set(ZONES.filter((zone) => zone.regions.every((region) => perfectRegions.has(region))).map((zone) => zone.id));

export const ACHIEVEMENT_CATEGORIES = [
  { id: "hab", label: t.achievementCategories.hab, icon: "target" },
  { id: "exp", label: t.achievementCategories.exp, icon: "globe" },
  { id: "conh", label: t.achievementCategories.conh, icon: "brain" },
  { id: "evo", label: t.achievementCategories.evo, icon: "trend" },
  { id: "dom", label: t.achievementCategories.dom, icon: "trophy" },
  { id: "desc", label: t.achievementCategories.desc, icon: "puzzle" },
] as const;

type AchievementSeed = Omit<AchievementDefinition, "name" | "description">;
const ACHIEVEMENT_SEEDS: AchievementSeed[] = [
  { id:"primeira",category:"hab",rarity:1,...one(c=>c.completed.length>0) },
  { id:"seq10",category:"hab",rarity:1,target:()=>10,progress:c=>c.bestStreak },
  { id:"seq25",category:"hab",rarity:3,target:()=>25,progress:c=>c.bestStreak },
  { id:"perfeita",category:"hab",rarity:3,...one(c=>c.perfect20) },
  { id:"perfeitaGrande",category:"hab",rarity:4,...one(c=>c.perfect40) },
  { id:"certeiro",category:"hab",rarity:2,...one(c=>c.precise) },
  { id:"travel20",category:"hab",rarity:3,target:()=>20,progress:c=>c.travelRoutes},
  { id:"escrita100",category:"hab",rarity:3,target:()=>100,progress:c=>c.writtenCorrect},
  { id:"todosModos",category:"exp",rarity:1,target:()=>4,progress:c=>c.modes.size},
  { id:"todosRecortes",category:"exp",rarity:2,target:()=>7,progress:c=>c.regions.size},
  { id:"voltaAoMundo",category:"exp",rarity:4,...one(c=>c.worldComplete) },
  { id:"pacifico",category:"exp",rarity:1,...one(c=>c.regions.has("oceania") || c.regions.has("pacifico")) },
  { id:"capitalRodada",category:"exp",rarity:2,target:()=>3,progress:c=>c.capitalRegions.size},
  { id:"dom50",category:"conh",rarity:3,target:()=>50,progress:c=>c.dominated},
  { id:"dom150",category:"conh",rarity:4,target:()=>150,progress:c=>c.dominated},
  { id:"band100",category:"conh",rarity:3,target:()=>100,progress:c=>c.flags},
  { id:"cap50",category:"conh",rarity:2,target:()=>50,progress:c=>c.capitals},
  { id:"cadaContinente",category:"conh",rarity:1,target:()=>5,progress:c=>c.continents},
  { id:"continenteInteiro",category:"conh",rarity:4,...one(c=>c.wholeContinent) },
  { id:"micro",category:"conh",rarity:3,target:()=>10,progress:c=>c.micro},
  // Silhueta e Históricas nunca tiveram conquista própria; Idiomas só tinha as de recorte (ver seção acima).
  // Mesmo padrão de dom50/dom150 e band100/cap50: contagem de entidades distintas já acertadas.
  { id:"silhueta50",category:"conh",rarity:3,target:()=>50,progress:c=>c.silhouettes.size},
  { id:"silhueta150",category:"conh",rarity:4,target:()=>150,progress:c=>c.silhouettes.size},
  { id:"historicas50",category:"conh",rarity:3,target:()=>50,progress:c=>c.historicalEntities.size},
  { id:"historicas150",category:"conh",rarity:4,target:()=>150,progress:c=>c.historicalEntities.size},
  { id:"idiomas40",category:"conh",rarity:3,target:()=>40,progress:c=>c.languagesKnown.size},
  { id:"gExplorador",category:"evo",rarity:1,...one(c=>c.masteryIndex>=2) },
  { id:"gNavegador",category:"evo",rarity:2,...one(c=>c.masteryIndex>=3) },
  { id:"gGeografo",category:"evo",rarity:3,...one(c=>c.masteryIndex>=4) },
  { id:"forma",category:"evo",rarity:3,...one(c=>c.fit) },
  { id:"evoluiu",category:"evo",rarity:3,...one(c=>c.evolved) },
  { id:"vexilologo",category:"dom",rarity:4,...one(c=>c.titles.has("Vexilólogo")) },
  { id:"cartografo",category:"dom",rarity:4,...one(c=>c.titles.has("Cartógrafo")) },
  { id:"diplomata",category:"dom",rarity:4,...one(c=>c.titles.has("Diplomata")) },
  { id:"cosmografo",category:"dom",rarity:5,...one(c=>c.cosmo) },
  // Escada de 3 degraus por modo — 1 recorte qualquer (Rara) → 3 das 5 zonas (Épica) → as 7 (Lendária).
  // Evitei uma conquista nomeada por zona (Américas/África/...) × modo: eram 15 quase idênticas, só
  // trocando a região — o degrau "3 de 5" já cobre a ideia de "cobrir o mundo" sem esse tanto de entradas.
  // O 1º degrau usa o recorte cru (não a zona): a zona Américas sozinha exige os 3 recortes americanos,
  // o que faria o primeiro degrau de todos os jeitos depender de qual recorte o jogador fecha primeiro.
  { id:"mapaRecorte1",category:"dom",rarity:3,target:()=>1,progress:c=>c.perfectRegionsMapa.size},
  { id:"mapaZonas3",category:"dom",rarity:4,target:()=>3,progress:c=>c.zonesMapa.size},
  { id:"mapaSemFalhas",category:"dom",rarity:5,target:()=>7,progress:c=>c.perfectRegionsMapa.size},
  { id:"capitaisRecorte1",category:"dom",rarity:3,target:()=>1,progress:c=>c.perfectRegionsCapitais.size},
  { id:"capitaisZonas3",category:"dom",rarity:4,target:()=>3,progress:c=>c.zonesCapitais.size},
  { id:"capitaisSemFalhas",category:"dom",rarity:5,target:()=>7,progress:c=>c.perfectRegionsCapitais.size},
  { id:"bandeirasRecorte1",category:"dom",rarity:3,target:()=>1,progress:c=>c.perfectRegionsBandeiras.size},
  { id:"bandeirasZonas3",category:"dom",rarity:4,target:()=>3,progress:c=>c.zonesBandeiras.size},
  { id:"bandeirasSemFalhas",category:"dom",rarity:5,target:()=>7,progress:c=>c.perfectRegionsBandeiras.size},
  // Idiomas tem escopo bem menor (77 entradas ao todo, algumas regiões com só 3-4) — sem escada de zona,
  // só um primeiro degrau (1 recorte qualquer) e o topo (os 7).
  { id:"idiomasRecorte1",category:"dom",rarity:3,...one(c=>c.perfectRegionsIdiomas.size>=1) },
  { id:"idiomasSemFalhas",category:"dom",rarity:5,target:()=>7,progress:c=>c.perfectRegionsIdiomas.size},
  { id:"tresPilaresSemFalhas",category:"dom",rarity:5,...one(c=>c.perfectRegionsMapa.size===7 && c.perfectRegionsCapitais.size===7 && c.perfectRegionsBandeiras.size===7) },
  { id:"pescador",category:"desc",rarity:3,hidden:true,target:()=>5,progress:c=>c.byWater},
  { id:"relampago",category:"desc",rarity:3,hidden:true,target:()=>10,progress:c=>c.lightning},
  { id:"confins",category:"desc",rarity:4,hidden:true,...one(c=>c.confines) },
];
/** Nome e descrição vêm do dicionário do idioma da interface (domain/i18n). */
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = ACHIEVEMENT_SEEDS.map((seed) => {
  const [name, description] = t.achievements[seed.id] ?? [seed.id, ""];
  return { ...seed, name, description };
});

export function achievementContext(progress: ProgressSnapshot, sessions: SurfaceSession[], catalog: Record<string, any> = {}): AchievementContext {
  const completed = sessions.filter(s => s.complete);
  const modes = new Set(sessions.map(s => s.mode));
  const regions = new Set(completed.flatMap(s => s.regions?.length ? s.regions : [s.region]).filter(Boolean));
  const capitalRegions = new Set(completed.filter(s => s.variant === "capital" || s.mode.includes("capital"))
    .flatMap(s => s.regions?.length ? s.regions : [s.region]).filter(Boolean));
  let bestStreak=0, byWater=0, lightning=0, flagsSet=new Set<string>(), capSet=new Set<string>(), perfect20=false, perfect40=false, precise=false, confines=false, worldComplete=false;
  let travelRoutes=0, writtenCorrect=0;
  const silhouettesSet=new Set<string>(), historicalSet=new Set<string>(), languagesSet=new Set<string>();
  for (const s of sessions) {
    let streak=0, rapid=0; const tiny=new Set<string>();
    for (const r of s.rounds) {
      if (r.byWater && r.correct) byWater++;
      if (r.correct) { streak++; bestStreak=Math.max(bestStreak,streak); rapid++; lightning=Math.max(lightning,rapid); }
      else { streak=0; rapid=0; }
      if (r.responseTimeMs === null || r.responseTimeMs >= 1500) { rapid=0; }
      if (s.family==="bandeiras" && r.correct) flagsSet.add(r.targetId);
      if ((s.variant==="capital" || s.mode.includes("capital")) && r.correct) capSet.add(r.targetId);
      // Modos que nunca tiveram conquista própria (ver seção "revisitada" de 23/09/2026).
      if (s.family==="silhueta" && r.correct) silhouettesSet.add(r.targetId);
      if (s.family==="historicas" && r.correct) historicalSet.add(r.targetId);
      if (s.family==="idiomas" && r.correct) languagesSet.add(r.targetId);
      if (s.family==="travel" && r.correct) travelRoutes++;
      if (s.family==="escrita" && r.correct) writtenCorrect++;
    }
    if (s.complete && s.rounds.length && s.correct===s.rounds.length) { if(s.rounds.length>=20) perfect20=true; if(s.rounds.length>=40) perfect40=true; }
    if (s.mode==="mapa" && s.complete) { const error = meanMapErrorKm(s.rounds); if (error && error.rounds >= MAP_ERROR_MIN_ROUNDS && error.km < MAP_ERROR_GOAL_KM) precise=true; }
    const selectedRegions = s.regions?.length ? s.regions : [s.region];
    if((selectedRegions.includes("mundo") || ["caribe","pacifico","europa","africa","asia","america-do-sul","america-do-norte-central"].every(region => selectedRegions.includes(region))) && s.complete && s.rounds.length>=150) worldComplete=true;
    // Tuvalu (798), Nauru (520) e Palau (585) pelo id: o nome muda com o idioma da interface.
    const hits = new Set(s.rounds.filter(r=>r.correct).map(r=>String(r.targetId)));
    if (["798","520","585"].every(id => hits.has(id))) confines = true;
  }
  const records = progress.records ?? [];
  const mastered = records.filter(record => Number(record.mastery ?? 0) > 0);
  const micro = mastered.filter(record => Number(catalog[String(record.entityId ?? record.id)]?.area) < 1000).length;
  const continentCounts = new Map<string, { seen: number; total: number }>();
  for (const [id, meta] of Object.entries(catalog)) {
    if (meta?.absorvido) continue;
    const continent = String(meta?.reg ?? meta?.continente ?? "");
    if (!continent) continue;
    const item = continentCounts.get(continent) ?? { seen: 0, total: 0 };
    item.total++; if (mastered.some(record => String(record.entityId ?? record.id) === id)) item.seen++;
    continentCounts.set(continent, item);
  }
  const continents = [...continentCounts.values()].filter(value => value.seen > 0).length;
  const wholeContinent = [...continentCounts.values()].some(value => value.total > 0 && value.seen === value.total);
  const pillarScores = Object.values(progress.pillars).map(p => p.bayesianScore ?? 0);
  const fit = pillarScores.some(score => score >= .9);
  const accuracy = completed.map(session => session.accuracy ?? 0);
  const evolved = accuracy.length >= 10 && accuracy.slice(-5).reduce((a,b)=>a+b,0)/5 - accuracy.slice(0,5).reduce((a,b)=>a+b,0)/5 >= .15;
  const masteryIndex = mastered.length ? Math.min(4, Math.max(...mastered.map(r => Number(r.mastery ?? 0))) - 1) : 0;
  // Current v2 does not store legacy title strings. Adapt the classic title
  // gates to pillar mastery plus written validation.
  const titles = new Set<string>();
  const strong = (key: string) => (progress.pillars[key]?.bayesianScore ?? 0) >= .9;
  const writingValidated = (progress.pillars.escrita?.correct ?? 0) >= 2;
  if (strong("bandeiras") && writingValidated) titles.add("Vexilólogo");
  if (strong("mapa")) titles.add("Cartógrafo");
  if (strong("capitais") && writingValidated) titles.add("Diplomata");
  const cosmo = ["bandeiras","mapa","capitais"].every(key => (progress.pillars[key]?.bayesianScore ?? 0) >= .9) && (progress.pillars.escrita?.correct ?? 0) > 0;
  const perfectRegionsMapa = perfectRegionsFor(sessions, "mapa");
  const perfectRegionsCapitais = perfectRegionsFor(sessions, "capitais");
  const perfectRegionsBandeiras = perfectRegionsFor(sessions, "bandeiras");
  const perfectRegionsIdiomas = perfectRegionsFor(sessions, "idiomas");
  const zonesMapa = zonesFor(perfectRegionsMapa);
  const zonesCapitais = zonesFor(perfectRegionsCapitais);
  const zonesBandeiras = zonesFor(perfectRegionsBandeiras);
  return {progress,sessions,completed,modes,regions,capitalRegions,bestStreak,perfect20,perfect40,precise,worldComplete,
    dominated: mastered.length, flags: flagsSet.size, capitals: capSet.size, micro, continents, wholeContinent,
    masteryIndex,fit,evolved,titles,cosmo,byWater,lightning,confines,
    perfectRegionsMapa,perfectRegionsCapitais,perfectRegionsBandeiras,perfectRegionsIdiomas,
    zonesMapa,zonesCapitais,zonesBandeiras,
    silhouettes: silhouettesSet, historicalEntities: historicalSet, languagesKnown: languagesSet,
    travelRoutes, writtenCorrect};
}

// Registros salvos: `{ id: "current:seq10", achievementId: "seq10" }` (perfil atual) ou `{ id: "seq10" }` (perfil clássico migrado).
const savedKey = (record: {id?:string;achievementId?:string}) => String(record.achievementId ?? record.id ?? "").replace(/^current:/, "");

export function evaluateAchievementDefinitions(context: AchievementContext, existing: Array<{id?:string;achievementId?:string;unlockedAt?:number}> = []) {
  return ACHIEVEMENT_DEFINITIONS.map(def => {
    const saved=existing.find(x=>savedKey(x)===def.id); const target=def.target(context); const current=Math.min(target,Math.max(0,def.progress(context)));
    return { ...def, target, current, unlocked:Boolean(saved || current>=target), unlockedAt:saved?.unlockedAt };
  });
}

/** Shared hook for round/session boundaries. Persist callers should write only
 * the returned `newlyUnlocked` records; evaluating again is deliberately pure. */
export function evaluateAchievementsOnLifecycle(
  progress: ProgressSnapshot,
  sessions: SurfaceSession[],
  existing: Array<{id?: string; achievementId?: string; unlockedAt?: number}> = [],
) {
  const state = evaluateAchievementDefinitions(achievementContext(progress, sessions), existing);
  const known = new Set(existing.map(item => item.id ?? item.achievementId));
  return {
    state,
    newlyUnlocked: state.filter(item => item.unlocked && !known.has(item.id)),
  };
}