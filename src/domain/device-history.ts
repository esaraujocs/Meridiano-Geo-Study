// PC × celular nas partidas de antes da marca (21/10/2026, pedido do Enzo: "considerar todas anteriores à sincronização desktop, as pós mobile").
// As partidas novas gravam o aparelho (`device`, learning-store.ts); as antigas não têm. Para a conta dele, a regra: antes de o celular sincronizar
// com a conta pela primeira vez (21/10/2026 01:21:38, hora de Brasília), PC; depois, celular. A conta é reconhecida pelo hash do usuário, como os
// ajustes da escada (o nome não vai no código). Outras contas ficam sem marca nas partidas antigas.
import { hashSeed } from "./bots.js";

export type DeviceKind = "desktop" | "mobile";
export const DEVICE_SPLITS: readonly { account: number; at: number }[] = [
  { account: 3176936172, at: Date.UTC(2026, 9, 21, 4, 21, 38) },
];
/** A regra da conta (o instante da divisão) ou nada. */
export const deviceSplitFor = (username: string) => (username ? DEVICE_SPLITS.find((entry) => entry.account === hashSeed(`conta:${username.trim().toLowerCase()}`)) ?? null : null);
/** As partidas sem aparelho ganham o da regra (pelo começo da partida); as que já têm ficam como estão. */
export function withInferredDevice<T extends { device?: DeviceKind; startedAt: number | null }>(sessions: readonly T[], split: { at: number } | null): T[] {
  if (!split) return [...sessions];
  return sessions.map((session) => (session.device || typeof session.startedAt !== "number" ? session : { ...session, device: session.startedAt < split.at ? "desktop" : "mobile" }));
}
