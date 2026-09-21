// Rótulos e datas das partidas, para as telas de Progresso e Histórico. Lógica pura.
import type { PillarSession } from "./pillars.js";

export type SessionGroup = "bandeiras" | "mapa" | "capitais" | "historicas" | "idiomas";
export const SESSION_GROUPS: ReadonlyArray<{ key: SessionGroup; label: string }> = [
  { key: "bandeiras", label: "Bandeiras" },
  { key: "mapa", label: "Mapa" },
  { key: "capitais", label: "Capitais" },
  { key: "historicas", label: "Históricas" },
  { key: "idiomas", label: "Idiomas" },
];

type LabelInput = PillarSession & { family?: string; variant?: string; mode?: string; subject?: string };

const VARIANT_LABELS: Record<string, string> = {
  mapa: "Clicar no mapa",
  silhueta: "Silhueta + escrita",
  "silhueta-opcoes": "Silhueta · opções",
  travel: "Travel",
  "bandeira-nome": "Bandeira → nome",
  "nome-bandeira": "Nome → bandeira",
  "capital-pais": "Clicar no mapa",
  "pais-capital": "País → capital",
  "escrita-pais": "Escrita",
  "escrita-capital": "Escrita",
  "historica-nome": "Bandeira → nome",
  "nome-historica": "Nome → bandeira",
  "idioma-nome": "Nome do idioma",
  "idioma-pais": "Países do idioma",
  // modos do perfil clássico
  bn: "Bandeira → nome",
  nb: "Nome → bandeira",
  escr: "Escrita",
  bnhist: "Bandeira → nome",
  nbhist: "Nome → bandeira",
  idioma: "Adivinhar",
};

// Grupo da partida (família do jogador) e nome do modo, ex.: "Bandeiras" + "Nome → bandeira".
export function sessionLabel(session: LabelInput): { group: SessionGroup; family: string; variant: string } {
  const family = session.family ?? "";
  const mode = session.mode || session.variant || "";
  const capital = session.subject === "capital" || session.variant === "capital" || session.variant === "escrita-capital" || family === "capitais" || mode.includes("capital");
  let group: SessionGroup;
  if (family === "historicas" || mode === "bnhist" || mode === "nbhist") group = "historicas";
  else if (family === "idiomas" || mode === "idioma") group = "idiomas";
  else if (family === "capitais" || capital) group = "capitais";
  else if (family === "mapa" || family === "silhueta" || family === "travel" || mode === "mapa" || mode === "silhueta" || mode === "travel") group = "mapa";
  else group = "bandeiras";
  const key = session.variant && VARIANT_LABELS[session.variant] ? session.variant : mode;
  const variant = VARIANT_LABELS[key] ?? VARIANT_LABELS[mode] ?? "Partida";
  return { group, family: SESSION_GROUPS.find((item) => item.key === group)?.label ?? "Partida", variant };
}

const LEGACY_REGIONS: Record<string, string> = {
  mundo: "Mundo", caribe: "Caribe", pacifico: "Pacífico", oceania: "Pacífico", europa: "Europa", africa: "África", asia: "Ásia",
  "america-do-sul": "América do Sul", "america-sul": "América do Sul",
  "america-do-norte-central": "América do Norte e Central", "america-norte": "América do Norte e Central",
};
export const regionKeyLabel = (key: string) => LEGACY_REGIONS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Mundo");
export function sessionRegionLabel(session: { region?: string; regions?: string[] }) {
  const regions = (session.regions ?? []).filter(Boolean);
  if (regions.length > 1 && !regions.includes("mundo")) return `${regions.length} recortes`;
  return regionKeyLabel(regions[0] ?? session.region ?? "mundo");
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (value: number) => String(value).padStart(2, "0");

export const startOfDay = (ts: number) => { const date = new Date(ts); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
export const addDays = (dayStart: number, days: number) => { const date = new Date(dayStart); return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime(); };
export const dayKey = (ts: number) => { const date = new Date(ts); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
export const formatShortDate = (ts: number) => { const date = new Date(ts); return `${date.getDate()} ${MONTHS[date.getMonth()]}`; };
export const formatClock = (ts: number) => { const date = new Date(ts); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
export const shortMonth = (ts: number) => MONTHS[new Date(ts).getMonth()];

// "hoje, 07:02" · "ontem, 21:40" · "19 set" (e "19 set 2025" fora do ano corrente)
export function relativeWhen(ts: number, now: number) {
  const today = startOfDay(now);
  const day = startOfDay(ts);
  if (day === today) return `hoje, ${formatClock(ts)}`;
  if (day === addDays(today, -1)) return `ontem, ${formatClock(ts)}`;
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return sameYear ? formatShortDate(ts) : `${formatShortDate(ts)} ${new Date(ts).getFullYear()}`;
}

// Duração legível; ignora partidas com relógio impossível (esquecidas abertas).
export function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms) || ms <= 0 || ms > 6 * 3600_000) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 >= 1 && minutes < 10 ? `${minutes} min ${pad(seconds % 60)} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)}`;
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
