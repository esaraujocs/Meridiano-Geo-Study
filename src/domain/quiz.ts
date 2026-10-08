import type { Family, Legacy, RegionSelection } from "./types";
import { inRegion } from "./regions";
import { t } from "./i18n/index.js";

export type FlagCatalog = Record<string, string>;

let flagsPromise: Promise<FlagCatalog> | null = null;

export function flagSource(value: string) {
  if (value.startsWith("data:")) return value;
  if (value.startsWith("svg:")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.slice(4))}`;
  }
  if (value.trimStart().startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  }
  return value;
}

export function loadFlags(): Promise<FlagCatalog> {
  flagsPromise ??= fetch("/data/legacy/flags.json").then(async (response) => {
    if (!response.ok) throw new Error(t.errors.flagsFailed);
    const payload = (await response.json()) as { flags?: FlagCatalog };
    if (!payload.flags) throw new Error(t.errors.flagsInvalid);
    const flags = { ...payload.flags };
    const overrideResponse = await fetch("/data/flag-overrides/manifest.json").catch(() => null); // opcional: sem rede, segue sem as trocas
    const overrides = overrideResponse?.ok
      ? await overrideResponse.json() as Record<string, { src: string }>
      : {};
    for (const [id, override] of Object.entries(overrides)) {
      if (flags[id] && override.src) flags[id] = override.src;
    }
    return flags;
  });
  return flagsPromise;
}

function usableFlag(meta: Legacy["meta"][string], flags: FlagCatalog) {
  return Boolean(meta.fl && flags[meta.fl.toLowerCase()] && flagSource(flags[meta.fl.toLowerCase()]));
}

function usableCapital(meta: Legacy["meta"][string]) {
  return typeof meta.cap === "string" && meta.cap.trim().length > 0;
}

export function quizPool(
  data: Legacy,
  family: Family,
  region: RegionSelection,
  flags?: FlagCatalog,
) {
  return Object.entries(data.meta)
    .filter(([id, meta]) => {
      if (meta.absorvido || !inRegion(id, region, data)) return false;
      if (family === "bandeiras") return Boolean(flags && usableFlag(meta, flags));
      return Boolean(usableCapital(meta) && !meta.soBandeira);
    })
    .map(([id]) => id);
}
