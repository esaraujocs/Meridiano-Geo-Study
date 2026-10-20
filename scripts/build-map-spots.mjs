// Quanto tempo cada lugar do mapa pede (20/10/2026, pedido do Enzo: "balancear o mapa no elo alto: ~2 s fixo é trabalho de louco para alguns
// lugares, tem que ter um equilíbrio pelo tamanho no tempo de escolher"). Sai dos tempos do próprio Enzo nos modos de clicar no mapa (Clicar no
// mapa e Capitais · clicar, no Mundo, acertos fora do Treino): para cada alvo, a mediana dele dividida pela mediana do modo; com poucas amostras o
// valor é puxado para a curva por área (a mesma conta por faixa de tamanho); no fim a média do baralho do mapa vale 1, então o bot gasta na média o
// mesmo de antes, só que pouco na Rússia e muito em São Bartolomeu. Grava src/domain/map-spots.ts.
// Uso: node scripts/build-map-spots.mjs [arquivo de sincronização da conta] (padrão: a conta do Enzo em .pvp-data/sync/).
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2] ?? ".pvp-data/sync/p392q1r061r385z3l471e5e334r343e2d.json";
const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8"));
const meta = catalog.meta;
const sync = JSON.parse(readFileSync(source, "utf8"));
const sessions = Object.values(sync.rows.sessions).map((row) => row.data ?? row);
const MODES = [["mapa", "mapa"], ["capitais", "capital-pais"]];
/** Peso da curva por área, em amostras: com n amostras o alvo vale n/(n + SHRINK) do que ele mostrou. */
const SHRINK = 4;
const CLAMP = [0.4, 3];

const median = (values) => { const list = [...values].sort((a, b) => a - b); return list[Math.floor(list.length / 2)]; };
const log = Math.log;

// razão de cada acerto: o tempo dele / a mediana do modo
const samples = {};
for (const [family, variant] of MODES) {
  const rounds = sessions
    .filter((s) => s.family === family && s.variant === variant && s.pace !== "treino" && Array.isArray(s.rounds) && (s.region === "mundo" || s.duelId))
    .flatMap((s) => s.rounds)
    .filter((r) => r.correct && r.responseTimeMs > 300 && r.responseTimeMs < 30000 && meta[r.targetId]);
  const mid = median(rounds.map((r) => r.responseTimeMs));
  for (const r of rounds) (samples[r.targetId] ??= []).push(r.responseTimeMs / mid);
  console.log(`${family}/${variant}: ${rounds.length} acertos, mediana ${(mid / 1000).toFixed(2)} s`);
}

// curva por área: mediana das razões por faixa de log10(área), ligada por retas
const lg = (id) => Math.log10(Math.max(1, meta[id].area ?? 1));
const BANDS = [1, 2, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7.5];
const curve = [];
for (let index = 0; index + 1 < BANDS.length; index += 1) {
  const values = Object.entries(samples).filter(([id]) => lg(id) >= BANDS[index] && lg(id) < BANDS[index + 1]).flatMap(([, list]) => list);
  if (values.length >= 20) curve.push([(BANDS[index] + BANDS[index + 1]) / 2, median(values)]);
}
const byArea = (id) => {
  const x = lg(id);
  if (x <= curve[0][0]) return curve[0][1];
  if (x >= curve.at(-1)[0]) return curve.at(-1)[1];
  const at = curve.findIndex(([cx]) => cx > x);
  const [x0, y0] = curve[at - 1], [x1, y1] = curve[at];
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
};
console.log("curva por área (log10 km² → razão):", curve.map(([x, y]) => `${x.toFixed(2)}→${y.toFixed(2)}`).join("  "));

const ids = catalog.mapEntityIds.filter((id) => meta[id]);
const raw = Object.fromEntries(ids.map((id) => {
  const list = samples[id] ?? [];
  const own = list.length ? log(median(list)) : 0;
  return [id, Math.exp((list.length * own + SHRINK * log(byArea(id))) / (list.length + SHRINK))];
}));
const mean = ids.reduce((sum, id) => sum + raw[id], 0) / ids.length;
const spots = Object.fromEntries(ids.map((id) => [id, Math.round(Math.min(CLAMP[1], Math.max(CLAMP[0], raw[id] / mean)) * 100) / 100]));
const rows = ids.map((id) => [meta[id].pt, spots[id], (samples[id] ?? []).length]).sort((a, b) => b[1] - a[1]);
console.log("mais demorados:", rows.slice(0, 10).map(([name, f, n]) => `${name} ×${f} (${n})`).join(", "));
console.log("mais rápidos:", rows.slice(-6).map(([name, f, n]) => `${name} ×${f} (${n})`).join(", "));
console.log(`média no baralho: ${(ids.reduce((sum, id) => sum + spots[id], 0) / ids.length).toFixed(3)}; sem amostra: ${ids.filter((id) => !samples[id]).length}`);

writeFileSync("src/domain/map-spots.ts", `// Gerado por scripts/build-map-spots.mjs em ${new Date().toISOString().slice(0, 10)}. Não editar à mão.
// Quanto tempo cada lugar do mapa pede para ser achado e clicado no Mundo, ×1 na média do baralho do mapa (os tempos do Enzo por alvo, puxados para a
// curva por área quando há poucas amostras). O bot multiplica o tempo dele por isto nos modos de clicar no mapa (bots.ts, \`spots\`).
export const MAP_SPOTS: Readonly<Record<string, number>> = ${JSON.stringify(spots)};
/** O fator de um alvo (1 para o que não está na tabela). */
export const mapSpot = (id: string) => MAP_SPOTS[id] ?? 1;
`);
console.log("gravado src/domain/map-spots.ts");
