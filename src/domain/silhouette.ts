// Baralho do modo Silhueta. Ilha pequena vira um pontinho no mapa e não dá para reconhecer, então fica de fora. Lógica pura.
import type { Meta } from "./types";

/** Abaixo desta área (km²) uma ilha, sem fronteira terrestre, sai do baralho da Silhueta (Chipre, Jamaica e Trinidad e Tobago ficam; Cabo Verde, Malta e Tuvalu saem). */
export const SMALL_ISLAND_KM2 = 5000;

export const isSmallIsland = (meta: Pick<Meta, "area" | "borders"> | undefined) =>
  Boolean(meta) && (meta?.borders?.length ?? 0) === 0 && typeof meta?.area === "number" && meta.area < SMALL_ISLAND_KM2;

/** A entidade entra no baralho: jogável no mapa, não absorvida por outra e não é uma ilha pequena. */
export const inSilhouetteDeck = (meta: Meta | undefined) => Boolean(meta) && !meta?.absorvido && meta?.mapa !== false && !isSmallIsland(meta);
