// Ícones e medalhão das conquistas, compartilhados pela tela de Achievements e pelo aviso de nova conquista.
// Ícones de traço (viewBox 24), mesma linguagem do resto do app.
export const PATHS: Record<string, string> = {
  flag: "M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9 M5 21v-7",
  flame: "M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z",
  target: "M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
  bolt: "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11",
  world: "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M3.6 9h16.8 M3.6 15h16.8 M11.5 3a17 17 0 0 0 0 18 M12.5 3a17 17 0 0 1 0 18",
  pin: "M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0 M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0",
  map: "M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v7.5 M9 4v13 M15 7v5.5",
  compass: "M8 16l2 -6l6 -2l-2 6l-6 2 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
  trend: "M3 17l6 -6l4 4l8 -8 M14 7l7 0l0 7",
  star: "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z",
  trophy: "M8 21l8 0 M12 17l0 4 M7 4l10 0 M17 4v8a5 5 0 0 1 -10 0v-8 M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  check: "M5 12l5 5l10 -10",
  x: "M18 6l-12 12 M6 6l12 12",
  lock: "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6 M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0 M8 11v-4a4 4 0 1 1 8 0v4",
  question: "M8 8a3.5 3 0 0 1 3.5 -3h1a3.5 3 0 0 1 3.5 3a3 3 0 0 1 -2 3a3 4 0 0 0 -2 4 M12 19l0 .01",
  anchor: "M12 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M12 6v-3 M12 21v-12 M5 12h-2a9 9 0 0 0 18 0h-2",
  spark: "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2 M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2 M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6",
  puzzle: "M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1",
  bulb: "M3 12h1 M12 3v1 M20 12h1 M5.6 5.6l.7 .7 M18.4 5.6l-.7 .7 M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3 M9.7 17l4.6 0",
  zoom: "M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-6 -6",
  chevron: "M9 6l6 6l-6 6",
  arrow: "M5 12h13m-5 -5l5 5l-5 5",
  info: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 8v.01 M12 12v4",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 7v5l3 3",
  coll: "M5 5h11a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V5Z M8 2h11a2 2 0 0 1 2 2v14 M8 9h7 M8 13h7",
  bars: "M5 20V10h4v10 M10 20V4h4v16 M15 20v-7h4v7",
  people: "M5.8 8a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0 M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6 M14.5 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M16 14.2c3 .1 5 2.3 5 5.8",
  coins: "M5 7a7 3 0 1 0 14 0a7 3 0 1 0 -14 0 M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7 M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5",
  building: "M3 21l18 0 M9 8l1 0 M9 12l1 0 M9 16l1 0 M14 8l1 0 M14 12l1 0 M14 16l1 0 M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16",
  // contorno do Brasil (simplificado das silhuetas de public/data/divisions/br/shapes.json)
  // Estados e províncias (o grupo no histórico): um território com as divisas por dentro
  // Mapas históricos (o grupo no histórico): o relógio com a seta voltando
  history: "M3.6 12.6A8.4 8.4 0 1 0 6 6.1 M2.8 3.6v3.6h3.6 M12 7.6V12l3.1 2",
  divisions: "M3.5 7.5 8.5 4l4.5 1.6L18 3.8l2.6 3.6-1.2 4.6 1.6 4.4-3.8 3.4-4.6-1.4-4.4 2.4L3.6 17l1-4.8z M8.5 4l1.8 6.2-5.7 2M10.3 10.2l4.6 1.2 4.5-3.8M14.9 11.4l-2.2 7.6",
  brazil: "M2.3 8.6 2.8 7.3 4.3 6.6 4.3 3.8 5.5 3.6 6.6 4.2 7.2 3.6 6.8 2.5 9.1 2.0 9.7 4.0 12.7 3.5 13.4 2.4 14.3 4.4 15.3 5.0 15.4 6.1 16.3 5.3 17.1 5.9 19.1 6.1 21.4 7.3 21.7 8.4 19.7 11.6 19.6 13.8 18.6 16.0 15.3 17.5 14.8 19.3 12.5 22.0 12.3 21.1 10.4 20.2 12.3 18.1 11.3 16.2 10.2 16.0 10.4 13.9 9.1 13.0 8.9 11.8 6.7 10.9 6.3 9.8 3.9 10.4Z",
};
export const CATEGORY_ICON: Record<string, string> = { target: "target", globe: "world", brain: "bulb", trend: "trend", trophy: "trophy", puzzle: "puzzle" };
// Ícone de cada conquista; as que não constam usam uma estrela.
export const ACHIEVEMENT_ICON: Record<string, string> = {
  primeira: "flag", seq10: "flame", seq25: "flame", perfeita: "spark", perfeitaGrande: "spark", certeiro: "target",
  todosModos: "compass", todosRecortes: "world", voltaAoMundo: "world", pacifico: "anchor", capitalRodada: "building",
  dom50: "bulb", dom150: "bulb", band100: "flag", cap50: "pin", cadaContinente: "map", continenteInteiro: "map", micro: "zoom",
  gExplorador: "compass", gNavegador: "compass", gGeografo: "compass", forma: "bolt", evoluiu: "trend",
  vexilologo: "flag", cartografo: "map", diplomata: "building", cosmografo: "star",
  pescador: "anchor", relampago: "bolt", confins: "compass",
  gentilicos100: "people", moedas80: "coins",
  brOiapoque: "brazil", brDeCor: "brazil",
};

export function Glyph({ name, size = 20, stroke = 1.6 }: { name: string; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name] ?? PATHS.star} /></svg>;
}

export type MedallionState = "unlocked" | "locked" | "hidden";
export function Medallion({ icon, rarity, state, size }: { icon: string; rarity: number; state: MedallionState; size: number }) {
  const badge = Math.round(size * .36);
  return <span className={`ach-med ach-r${rarity} is-${state}`} style={{ width: size, height: size }} aria-hidden="true">
    <Glyph name={state === "hidden" ? "question" : icon} size={Math.round(size * .44)} />
    {state !== "hidden" && <span className="ach-badge" style={{ width: badge, height: badge }}><Glyph name={state === "unlocked" ? "check" : "lock"} size={Math.round(badge * .58)} stroke={2.4} /></span>}
  </span>;
}
