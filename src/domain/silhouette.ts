// Baralho do modo Silhueta. Lógica pura.
// Até 21/10/2026 as ilhas sem fronteira e com menos de 5.000 km² ficavam de fora (no legacy-map.json eram um pontinho). Com as silhuetas do mapa
// HD (scripts/map-hd/build-silhouettes.py) elas voltaram, a pedido do Enzo: "voltemos com todos os países soberanos da ONU, agora as bordas são
// bem melhores" (Malta, Maldivas, Tuvalu, São Martinho…).
import type { Meta } from "./types";

/** A entidade entra no baralho: jogável no mapa e não absorvida por outra. */
export const inSilhouetteDeck = (meta: Meta | undefined) => Boolean(meta) && !meta?.absorvido && meta?.mapa !== false;
