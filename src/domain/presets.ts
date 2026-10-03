// Favoritas: configurações de partida guardadas, até MAX_PRESETS_PER_FAMILY por família do Hub, com uma marcada como ★
// (a principal da família). Lógica pura: o armazenamento fica em presets-store.ts.
import type { AnyQuizVariant, Family, Region, RegionSelection } from "./types";
import { isPace, isRoundTier, roundLimitFor, type RoundTier } from "./pace.js";
import type { Pace } from "./spoils.js";
import { selectedMode, variantContextFor, type TopFamily } from "./match-config.js";
import { normalizeRegionSelection, REGION_ITEMS } from "./regions.js";
import { MESSAGES, t, type Messages } from "./i18n/index.js";

export const MAX_PRESETS_PER_FAMILY = 5;
export const MAX_PRESET_NAME = 40;
export const PRESET_ID_PREFIX = "preset:";
export const PRESET_SOURCE = "preset-v1";
export const TOP_FAMILIES: readonly TopFamily[] = ["mapa", "bandeiras", "capitais", "idiomas"];

/** O que a tela "Configure a partida" decide (região já normalizada). */
export type PresetConfig = {
  topFamily: TopFamily;
  variant: AnyQuizVariant;
  pace: Pace;
  roundTier: RoundTier;
  region: Region[];
  onlyUn: boolean;
};
export type PresetDraft = Omit<PresetConfig, "region"> & { region: RegionSelection };
export type Preset = PresetConfig & { id: string; name: string; favorite: boolean; createdAt: number; updatedAt: number };

export const configOf = (draft: PresetDraft): PresetConfig => ({
  topFamily: draft.topFamily,
  variant: draft.variant,
  pace: draft.pace,
  roundTier: draft.roundTier,
  region: normalizeRegionSelection(draft.region),
  onlyUn: Boolean(draft.onlyUn),
});

export const sameConfig = (a: PresetConfig, b: PresetConfig) =>
  a.topFamily === b.topFamily && a.variant === b.variant && a.pace === b.pace && a.roundTier === b.roundTier &&
  a.onlyUn === b.onlyUn && a.region.length === b.region.length && a.region.every((item, index) => item === b.region[index]);

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME);

const familyOf = (config: PresetConfig): Family => variantContextFor(config.topFamily, config.variant)?.family ?? "mapa";

/** Nome sugerido: modo · recorte · rodadas (+ Treino / ONU quando valem), no idioma da interface (ou no pedido). */
export function defaultPresetName(config: PresetConfig, messages: Messages = t) {
  const family = familyOf(config);
  const mode = selectedMode(config.topFamily, family, config.variant);
  const regionLabels = config.region.map((key) => messages.regions[key]?.[0] ?? key);
  const regionText = regionLabels.length > 2 ? messages.regions.many(regionLabels.length) : regionLabels.join(" + ");
  const limit = roundLimitFor(config.roundTier, family);
  const parts = [messages.modes[mode.key as keyof Messages["modes"]]?.[0] ?? mode.label, regionText, limit === null ? messages.presets.all : String(limit)];
  if (config.pace === "training") parts.push(messages.presets.training);
  if (config.onlyUn) parts.push(messages.presets.un);
  return parts.join(" · ");
}

/** O nome é o sugerido (em qualquer idioma)? Então ele acompanha a configuração e o idioma da interface. */
export const isAutoName = (preset: Preset) =>
  Object.values(MESSAGES).some((messages) => preset.name === defaultPresetName(preset, messages));
/** Nome para mostrar: o sugerido sai no idioma atual; nome dado pela pessoa fica como está. */
export const presetLabel = (preset: Preset) => (isAutoName(preset) ? defaultPresetName(preset) : preset.name);

/** Valida um registro lido do banco; null se estiver estragado ou de uma versão desconhecida. */
export function parsePreset(value: unknown): Preset | null {
  const row = value as Partial<Preset> & { source?: unknown } | null;
  if (!row || typeof row !== "object" || row.source !== PRESET_SOURCE) return null;
  if (typeof row.id !== "string" || !row.id.startsWith(PRESET_ID_PREFIX)) return null;
  if (!TOP_FAMILIES.includes(row.topFamily as TopFamily)) return null;
  if (typeof row.variant !== "string" || !variantContextFor(row.topFamily as TopFamily, row.variant)) return null;
  if (!isPace(row.pace) || !isRoundTier(row.roundTier)) return null;
  if (!Array.isArray(row.region) || row.region.length === 0) return null;
  const knownRegions = new Set(REGION_ITEMS.map(([key]) => key));
  if (!row.region.every((item) => knownRegions.has(item as Region))) return null;
  const config = configOf({ topFamily: row.topFamily as TopFamily, variant: row.variant as AnyQuizVariant, pace: row.pace, roundTier: row.roundTier, region: row.region as Region[], onlyUn: Boolean(row.onlyUn) });
  const name = cleanName(typeof row.name === "string" ? row.name : "") || defaultPresetName(config);
  return { ...config, id: row.id, name, favorite: row.favorite === true, createdAt: Number(row.createdAt) || 0, updatedAt: Number(row.updatedAt) || 0 };
}

// ---- Última partida de cada família (o "Continuar" do Hub) ----
// Gravada ao começar uma partida solo: o mesmo desenho da favorita (modo, ritmo, rodadas, recorte e filtro), sem nome. Fica no localStorage do aparelho.
export const LAST_CONFIG_PREFIX = "carta-last-config:";

/** Lê o que foi gravado como última partida; qualquer coisa fora do que o jogo conhece vira `null` (o Hub então mostra "Jogar"). */
export function parseLastConfig(raw: unknown, topFamily: TopFamily): PresetConfig | null {
  let value: unknown = raw;
  if (typeof raw === "string") { try { value = JSON.parse(raw); } catch { return null; } }
  const row = value as Partial<PresetConfig> | null;
  if (!row || typeof row !== "object" || row.topFamily !== topFamily) return null;
  if (typeof row.variant !== "string" || !variantContextFor(topFamily, row.variant)) return null;
  if (!isPace(row.pace) || !isRoundTier(row.roundTier)) return null;
  if (!Array.isArray(row.region) || row.region.length === 0) return null;
  const knownRegions = new Set(REGION_ITEMS.map(([key]) => key));
  if (!row.region.every((item) => knownRegions.has(item as Region))) return null;
  return configOf({ topFamily, variant: row.variant as AnyQuizVariant, pace: row.pace, roundTier: row.roundTier, region: row.region as Region[], onlyUn: Boolean(row.onlyUn) });
}

export const presetsFor = (list: readonly Preset[], top: TopFamily) =>
  list.filter((item) => item.topFamily === top).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.createdAt - b.createdAt);

export const favoriteFor = (list: readonly Preset[], top: TopFamily) => list.find((item) => item.topFamily === top && item.favorite) ?? null;

export type PresetResult =
  | { ok: true; list: Preset[]; preset: Preset }
  | { ok: false; error: "limit" | "duplicate"; existing?: Preset };

/** Guarda a configuração como nova favorita. A primeira de cada família já vira ★; repetir a mesma configuração não duplica. */
export function createPreset(list: readonly Preset[], draft: PresetDraft, options: { id: string; now: number; name?: string }): PresetResult {
  const config = configOf(draft);
  const existing = list.find((item) => sameConfig(item, config));
  if (existing) return { ok: false, error: "duplicate", existing };
  if (list.filter((item) => item.topFamily === config.topFamily).length >= MAX_PRESETS_PER_FAMILY) return { ok: false, error: "limit" };
  const preset: Preset = {
    ...config,
    id: options.id.startsWith(PRESET_ID_PREFIX) ? options.id : `${PRESET_ID_PREFIX}${options.id}`,
    name: cleanName(options.name ?? "") || defaultPresetName(config),
    favorite: !list.some((item) => item.topFamily === config.topFamily && item.favorite),
    createdAt: options.now,
    updatedAt: options.now,
  };
  return { ok: true, list: [...list, preset], preset };
}

/** Regrava a configuração de uma favorita com o que está na tela (a família não muda). */
export function updatePreset(list: readonly Preset[], id: string, draft: PresetDraft, now: number): PresetResult {
  const current = list.find((item) => item.id === id);
  if (!current) return { ok: false, error: "duplicate" };
  const config = configOf({ ...draft, topFamily: current.topFamily });
  const clash = list.find((item) => item.id !== id && sameConfig(item, config));
  if (clash) return { ok: false, error: "duplicate", existing: clash };
  const autoNamed = isAutoName(current);
  const preset: Preset = { ...current, ...config, name: autoNamed ? defaultPresetName(config) : current.name, updatedAt: now };
  return { ok: true, list: list.map((item) => (item.id === id ? preset : item)), preset };
}

export function renamePreset(list: readonly Preset[], id: string, name: string, now: number): Preset[] {
  return list.map((item) => (item.id === id ? { ...item, name: cleanName(name) || defaultPresetName(item), updatedAt: now } : item));
}

/** Marca ★ (só uma por família). */
export function setFavorite(list: readonly Preset[], id: string, now: number): Preset[] {
  const target = list.find((item) => item.id === id);
  if (!target) return [...list];
  return list.map((item) => {
    if (item.topFamily !== target.topFamily) return item;
    const favorite = item.id === id;
    return item.favorite === favorite ? item : { ...item, favorite, updatedAt: now };
  });
}

/** Apaga; se era a ★ e sobram outras da família, a mais antiga assume (o atalho do Hub não some). */
export function removePreset(list: readonly Preset[], id: string, now: number): Preset[] {
  const target = list.find((item) => item.id === id);
  const rest = list.filter((item) => item.id !== id);
  if (!target?.favorite) return rest;
  const heir = presetsFor(rest, target.topFamily)[0];
  return heir ? rest.map((item) => (item.id === heir.id ? { ...item, favorite: true, updatedAt: now } : item)) : rest;
}

export function diffPresets(before: readonly Preset[], after: readonly Preset[]) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const changed = after.filter((item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item));
  const kept = new Set(after.map((item) => item.id));
  return { changed, removedIds: before.filter((item) => !kept.has(item.id)).map((item) => item.id) };
}
