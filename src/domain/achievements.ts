import type { ProgressSnapshot, SurfaceSession } from "./progress-surfaces";
import { MAP_ERROR_GOAL_KM, MAP_ERROR_MIN_ROUNDS, meanMapErrorKm } from "./map-error.js";

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
};
const one = (f: (c: AchievementContext) => boolean) => ({ target: () => 1, progress: (c: AchievementContext) => f(c) ? 1 : 0 });
const finiteTarget = (c: AchievementContext, min: number, fallback: number) => Math.max(min, Math.min(fallback, c.completed[0]?.rounds.length || fallback));

export const ACHIEVEMENT_CATEGORIES = [
  { id: "hab", label: "Habilidade", icon: "target" },
  { id: "exp", label: "Exploração", icon: "globe" },
  { id: "conh", label: "Conhecimento", icon: "brain" },
  { id: "evo", label: "Evolução", icon: "trend" },
  { id: "dom", label: "Domínio", icon: "trophy" },
  { id: "desc", label: "Descoberta", icon: "puzzle" },
] as const;

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  { id:"primeira",category:"hab",rarity:1,name:"Primeira carta",description:"Complete uma partida.",...one(c=>c.completed.length>0) },
  { id:"seq10",category:"hab",rarity:1,name:"Dez na agulha",description:"Sequência de 10 acertos.",target:()=>10,progress:c=>c.bestStreak },
  { id:"seq25",category:"hab",rarity:3,name:"Vinte e cinco sem tropeço",description:"Sequência de 25 acertos.",target:()=>25,progress:c=>c.bestStreak },
  { id:"perfeita",category:"hab",rarity:3,name:"Partida limpa",description:"100% numa partida de 20 rodadas ou mais.",...one(c=>c.perfect20) },
  { id:"perfeitaGrande",category:"hab",rarity:4,name:"Impecável",description:"100% numa partida de 40 rodadas ou mais.",...one(c=>c.perfect40) },
  { id:"certeiro",category:"hab",rarity:2,name:"Mão firme",description:"Erro médio abaixo de 500 km numa partida completa de Clicar no mapa (acerto vale 0 km).",...one(c=>c.precise) },
  { id:"todosModos",category:"exp",rarity:1,name:"Quatro caminhos",description:"Jogue os quatro modos.",target:()=>4,progress:c=>c.modes.size},
  { id:"todosRecortes",category:"exp",rarity:2,name:"Sete mares",description:"Complete uma partida em cada recorte.",target:()=>7,progress:c=>c.regions.size},
  { id:"voltaAoMundo",category:"exp",rarity:3,name:"Volta ao mundo",description:"Complete o baralho inteiro do recorte Mundo.",...one(c=>c.worldComplete) },
  { id:"pacifico",category:"exp",rarity:2,name:"Chamado do Pacífico",description:"Complete uma partida no recorte Pacífico.",...one(c=>c.regions.has("oceania") || c.regions.has("pacifico")) },
  { id:"capitalRodada",category:"exp",rarity:2,name:"Turnê diplomática",description:"Complete partidas de capital em 3 recortes.",target:()=>3,progress:c=>c.capitalRegions.size},
  { id:"dom50",category:"conh",rarity:2,name:"Cinquenta na ponta da língua",description:"Domine 50 países.",target:()=>50,progress:c=>c.dominated},
  { id:"dom150",category:"conh",rarity:4,name:"Cento e cinquenta",description:"Domine 150 países.",target:()=>150,progress:c=>c.dominated},
  { id:"band100",category:"conh",rarity:2,name:"Cem panos",description:"Acerte 100 bandeiras diferentes.",target:()=>100,progress:c=>c.flags},
  { id:"cap50",category:"conh",rarity:2,name:"Cinquenta capitais",description:"Acerte 50 capitais diferentes.",target:()=>50,progress:c=>c.capitals},
  { id:"cadaContinente",category:"conh",rarity:1,name:"Pé em cada continente",description:"Domine ao menos um país de cada continente.",target:()=>5,progress:c=>c.continents},
  { id:"continenteInteiro",category:"conh",rarity:4,name:"Continente na palma",description:"Domine todos os países de um continente.",...one(c=>c.wholeContinent) },
  { id:"micro",category:"conh",rarity:3,name:"Os que ninguém vê",description:"Domine 10 países com menos de 1.000 km².",target:()=>10,progress:c=>c.micro},
  { id:"gExplorador",category:"evo",rarity:1,name:"Explorador",description:"Chegue a Explorador na maestria global.",...one(c=>c.masteryIndex>=2) },
  { id:"gNavegador",category:"evo",rarity:2,name:"Navegador",description:"Chegue a Navegador na maestria global.",...one(c=>c.masteryIndex>=3) },
  { id:"gGeografo",category:"evo",rarity:3,name:"Geógrafo",description:"Chegue a Geógrafo na maestria global.",...one(c=>c.masteryIndex>=4) },
  { id:"forma",category:"evo",rarity:2,name:"Em boa forma",description:"90% de forma recente em algum pilar.",...one(c=>c.fit) },
  { id:"evoluiu",category:"evo",rarity:3,name:"Outro jogador",description:"Suas 5 últimas partidas estão 15 pontos acima das 5 primeiras.",...one(c=>c.evolved) },
  { id:"vexilologo",category:"dom",rarity:4,name:"Vexilólogo",description:"Especialista em Bandeiras, validado na escrita.",...one(c=>c.titles.has("Vexilólogo")) },
  { id:"cartografo",category:"dom",rarity:4,name:"Cartógrafo",description:"Especialista no Mapa.",...one(c=>c.titles.has("Cartógrafo")) },
  { id:"diplomata",category:"dom",rarity:4,name:"Diplomata",description:"Especialista em Capitais, validado na escrita.",...one(c=>c.titles.has("Diplomata")) },
  { id:"cosmografo",category:"dom",rarity:5,name:"Cosmógrafo",description:"Os três pilares no topo, com a escrita validada.",...one(c=>c.cosmo) },
  { id:"pescador",category:"desc",rarity:3,hidden:true,name:"Pescador de ilhas",description:"Acerte 5 países tocando no mar.",target:()=>5,progress:c=>c.byWater},
  { id:"relampago",category:"desc",rarity:3,hidden:true,name:"Relâmpago",description:"10 acertos seguidos com menos de 1,5s cada.",target:()=>10,progress:c=>c.lightning},
  { id:"confins",category:"desc",rarity:4,hidden:true,name:"Confins do mapa",description:"Acerte Tuvalu, Nauru e Palau na mesma partida.",...one(c=>c.confines) },
];

export function achievementContext(progress: ProgressSnapshot, sessions: SurfaceSession[], catalog: Record<string, any> = {}): AchievementContext {
  const completed = sessions.filter(s => s.complete);
  const modes = new Set(sessions.map(s => s.mode));
  const regions = new Set(completed.flatMap(s => s.regions?.length ? s.regions : [s.region]).filter(Boolean));
  const capitalRegions = new Set(completed.filter(s => s.variant === "capital" || s.mode.includes("capital"))
    .flatMap(s => s.regions?.length ? s.regions : [s.region]).filter(Boolean));
  let bestStreak=0, byWater=0, lightning=0, flagsSet=new Set<string>(), capSet=new Set<string>(), perfect20=false, perfect40=false, precise=false, confines=false, worldComplete=false;
  for (const s of sessions) {
    let streak=0, rapid=0; const tiny=new Set<string>();
    for (const r of s.rounds) {
      if (r.byWater && r.correct) byWater++;
      if (r.correct) { streak++; bestStreak=Math.max(bestStreak,streak); rapid++; lightning=Math.max(lightning,rapid); }
      else { streak=0; rapid=0; }
      if (r.responseTimeMs === null || r.responseTimeMs >= 1500) { rapid=0; }
      if (s.family==="bandeiras" && r.correct) flagsSet.add(r.targetId);
      if ((s.variant==="capital" || s.mode.includes("capital")) && r.correct) capSet.add(r.targetId);
    }
    if (s.complete && s.rounds.length && s.correct===s.rounds.length) { if(s.rounds.length>=20) perfect20=true; if(s.rounds.length>=40) perfect40=true; }
    if (s.mode==="mapa" && s.complete) { const error = meanMapErrorKm(s.rounds); if (error && error.rounds >= MAP_ERROR_MIN_ROUNDS && error.km < MAP_ERROR_GOAL_KM) precise=true; }
    const selectedRegions = s.regions?.length ? s.regions : [s.region];
    if((selectedRegions.includes("mundo") || ["caribe","pacifico","europa","africa","asia","america-do-sul","america-do-norte-central"].every(region => selectedRegions.includes(region))) && s.complete && s.rounds.length>=150) worldComplete=true;
    const names = new Set(s.rounds.filter(r=>r.correct).map(r=>String(catalog[r.targetId]?.pt ?? r.targetId).toLowerCase()));
    if (["tuvalu","nauru","palau"].every(name => names.has(name))) confines = true;
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
  return {progress,sessions,completed,modes,regions,capitalRegions,bestStreak,perfect20,perfect40,precise,worldComplete,
    dominated: mastered.length, flags: flagsSet.size, capitals: capSet.size, micro, continents, wholeContinent,
    masteryIndex,fit,evolved,titles,cosmo,byWater,lightning,confines};
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