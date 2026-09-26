// Rótulos e datas das partidas, para as telas de Progresso e Histórico. Lógica pura.
import type { PillarSession } from "./pillars.js";
import { intlLocale, t } from "./i18n/index.js";

export type SessionGroup = "bandeiras" | "mapa" | "capitais" | "historicas" | "idiomas";
export const SESSION_GROUPS: ReadonlyArray<{ key: SessionGroup; label: string }> =
  (["bandeiras", "mapa", "capitais", "historicas", "idiomas"] as const).map((key) => ({ key, label: t.sessions.groups[key] }));

type LabelInput = PillarSession & { family?: string; variant?: string; mode?: string; subject?: string };

// Inclui os modos do perfil clássico (bn, nb, escr, bnhist, nbhist, idioma).
const VARIANT_LABELS: Record<string, string> = t.sessions.variants;

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
  const variant = VARIANT_LABELS[key] ?? VARIANT_LABELS[mode] ?? t.sessions.fallback;
  return { group, family: SESSION_GROUPS.find((item) => item.key === group)?.label ?? t.sessions.fallback, variant };
}

const LEGACY_REGIONS: Record<string, string> = {
  mundo: t.regions.mundo[0], caribe: t.regions.caribe[0], pacifico: t.regions.pacifico[0], oceania: t.regions.pacifico[0], europa: t.regions.europa[0], africa: t.regions.africa[0], asia: t.regions.asia[0],
  "america-do-sul": t.regions["america-do-sul"][0], "america-sul": t.regions["america-do-sul"][0],
  "america-do-norte-central": t.regions["america-do-norte-central"][0], "america-norte": t.regions["america-do-norte-central"][0],
};
export const regionKeyLabel = (key: string) => LEGACY_REGIONS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : t.regions.mundo[0]);
export function sessionRegionLabel(session: { region?: string; regions?: string[] }) {
  const regions = (session.regions ?? []).filter(Boolean);
  if (regions.length > 1 && !regions.includes("mundo")) return t.regions.many(regions.length);
  return regionKeyLabel(regions[0] ?? session.region ?? "mundo");
}

const MONTHS = t.dates.monthsShort;
export const MONTH_NAMES = t.dates.months;
const pad = (value: number) => String(value).padStart(2, "0");

export const startOfDay = (ts: number) => { const date = new Date(ts); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
export const addDays = (dayStart: number, days: number) => { const date = new Date(dayStart); return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime(); };
export const dayKey = (ts: number) => { const date = new Date(ts); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
export const formatShortDate = (ts: number) => { const date = new Date(ts); return t.dates.shortDate(date.getDate(), MONTHS[date.getMonth()]); };
export const formatClock = (ts: number) => { const date = new Date(ts); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
export const shortMonth = (ts: number) => MONTHS[new Date(ts).getMonth()];

// "hoje, 07:02" · "ontem, 21:40" · "19 set" (e "19 set 2025" fora do ano corrente)
export function relativeWhen(ts: number, now: number) {
  const today = startOfDay(now);
  const day = startOfDay(ts);
  if (day === today) return t.dates.today(formatClock(ts));
  if (day === addDays(today, -1)) return t.dates.yesterday(formatClock(ts));
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return sameYear ? formatShortDate(ts) : `${formatShortDate(ts)} ${new Date(ts).getFullYear()}`;
}

// Duração legível; ignora partidas com relógio impossível (esquecidas abertas).
export function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms) || ms <= 0 || ms > 6 * 3600_000) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t.time.seconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 >= 1 && minutes < 10 ? t.dates.minutesSecondsPadded(minutes, pad(seconds % 60)) : t.time.minutes(minutes);
  return t.dates.hoursMinutes(Math.floor(minutes / 60), pad(minutes % 60));
}

export const formatSeconds = (ms: number) => t.dates.decimalSeconds((ms / 1000).toLocaleString(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }));
