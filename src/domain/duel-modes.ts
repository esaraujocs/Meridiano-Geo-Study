// Modos do duelo: duas escadas (Mapas e Bandeiras), cada uma com grupos de modos. Um duelo tem 2 tempos de 10 rodadas, cada tempo
// em um grupo diferente sorteado da escada. A semente decide tudo (grupos, sentido e baralho), então dois jogadores com a mesma
// semente jogam o mesmo duelo. Modos que a pessoa não comprou entram como "prévia": ela joga, mas as moedas seguem o modo base da escada. Lógica pura.
import type { AnyQuizVariant, Family } from "./types";
import { policyFor } from "./economy-rules.js";
import { hashSeed, mulberry32, type BotFamily } from "./bots.js";

export const LADDERS = ["mapas", "bandeiras"] as const;
export type Ladder = (typeof LADDERS)[number];
export const isLadder = (value: unknown): value is Ladder => value === "mapas" || value === "bandeiras";

export type ModeGroup =
  | "mapa" | "capitais-clique" | "silhueta-opcoes" | "silhueta-escrita" | "capitais-escrita"
  | "atuais" | "escrita-pais" | "historicas";
export type DuelKind = "clique" | "opcoes" | "escrita";
export type ModeVariant = { family: Family; variant: AnyQuizVariant };

export type ModeGroupDef = {
  group: ModeGroup;
  ladder: Ladder;
  kind: DuelKind;
  /** Família do Hub para o bot especialista. */
  botFamily: BotFamily;
  /** A especialidade do bot não conta neste grupo (nem a favor nem contra). */
  neutral?: boolean;
  /** Um grupo pode ter dois sentidos (nome → bandeira e bandeira → nome); a semente escolhe um. */
  variants: readonly ModeVariant[];
  /** Ajuste do bot neste modo: pontos de acerto (negativo = mais difícil, encolhe nas ligas altas) e fator de tempo. Chute inicial, para ajustar jogando. */
  accuracy: number;
  time: number;
  /** Peso no sorteio (padrão 1). Silhueta e Capitais têm 2 grupos cada em Mapas (2 de 5) e dominavam o sorteio; com peso menor o Clicar no mapa, o modo base, sai mais. */
  weight?: number;
};

/** Peso de cada grupo da Silhueta e de cada grupo de Capitais no sorteio de Mapas (o Clicar no mapa pesa 1). */
export const SILHOUETTE_WEIGHT = 0.25;
export const CAPITALS_WEIGHT = 0.5;

export const MODE_GROUPS: readonly ModeGroupDef[] = [
  { group: "mapa", ladder: "mapas", kind: "clique", botFamily: "mapa", variants: [{ family: "mapa", variant: "mapa" }], accuracy: -0.04, time: 1.4 },
  { group: "capitais-clique", ladder: "mapas", kind: "clique", botFamily: "capitais", variants: [{ family: "capitais", variant: "capital-pais" }], accuracy: -0.1, time: 1.5, weight: CAPITALS_WEIGHT },
  { group: "silhueta-opcoes", ladder: "mapas", kind: "opcoes", botFamily: "mapa", variants: [{ family: "silhueta", variant: "silhueta-opcoes" }], accuracy: -0.06, time: 1.2, weight: SILHOUETTE_WEIGHT },
  { group: "silhueta-escrita", ladder: "mapas", kind: "escrita", botFamily: "mapa", variants: [{ family: "silhueta", variant: "silhueta" }], accuracy: -0.24, time: 1.9, weight: SILHOUETTE_WEIGHT },
  { group: "capitais-escrita", ladder: "mapas", kind: "escrita", botFamily: "capitais", variants: [{ family: "escrita", variant: "escrita-capital" }], accuracy: -0.36, time: 1.9, weight: CAPITALS_WEIGHT },
  { group: "atuais", ladder: "bandeiras", kind: "opcoes", botFamily: "bandeiras", variants: [{ family: "bandeiras", variant: "nome-bandeira" }, { family: "bandeiras", variant: "bandeira-nome" }], accuracy: 0, time: 1 },
  { group: "escrita-pais", ladder: "bandeiras", kind: "escrita", botFamily: "bandeiras", variants: [{ family: "escrita", variant: "escrita-pais" }], accuracy: -0.12, time: 1.7 },
  { group: "historicas", ladder: "bandeiras", kind: "opcoes", botFamily: "bandeiras", neutral: true, variants: [{ family: "historicas", variant: "nome-historica" }, { family: "historicas", variant: "historica-nome" }], accuracy: -0.2, time: 1.3 },
];
export const groupDef = (group: ModeGroup): ModeGroupDef => MODE_GROUPS.find((item) => item.group === group) as ModeGroupDef;
export const groupsOfLadder = (ladder: Ladder) => MODE_GROUPS.filter((item) => item.ladder === ladder);

/** O modo grátis de cada escada: é por ele que se pagam as moedas dos modos de prévia. */
export const LADDER_BASE: Record<Ladder, ModeVariant> = {
  mapas: { family: "mapa", variant: "mapa" },
  bandeiras: { family: "bandeiras", variant: "nome-bandeira" },
};

/** O grupo do modo base de cada escada (o que as moedas de prévia imitam). */
export const LADDER_BASE_GROUP: Record<Ladder, ModeGroup> = { mapas: "mapa", bandeiras: "atuais" };

export const LEGS = 2;
export const LEG_ROUNDS = 10;

export type DuelLeg = { group: ModeGroup; family: Family; variant: AnyQuizVariant; rounds: number; deckSeed: number };

/** Escolhe um grupo pelo peso (sempre gasta um número do sorteio, como a escolha simples gastava). */
function pickWeighted(groups: readonly ModeGroupDef[], random: () => number) {
  let roll = random() * groups.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  for (const item of groups) {
    roll -= item.weight ?? 1;
    if (roll < 0) return item;
  }
  return groups[groups.length - 1];
}

/** Sorteia os 2 tempos: dois grupos diferentes da escada, com sentido e baralho decididos pela semente.
 * Com `ownedGroups` (duelo contra bot), ao menos um tempo cai num modo que a pessoa tem, quando ela tem algum;
 * sem ele (duelo entre pessoas) o sorteio não depende de quem comprou o quê. */
export function drawLegs(ladder: Ladder, seed: string, ownedGroups?: ReadonlySet<ModeGroup>): [DuelLeg, DuelLeg] {
  const random = mulberry32(hashSeed(`legs:${ladder}:${seed}`));
  const groups = groupsOfLadder(ladder);
  const first = pickWeighted(groups, random);
  const rest = groups.filter((item) => item !== first);
  let second = pickWeighted(rest, random);
  if (ownedGroups && !ownedGroups.has(first.group) && !ownedGroups.has(second.group)) {
    const owned = rest.filter((item) => ownedGroups.has(item.group));
    if (owned.length) second = pickWeighted(owned, random);
  }
  const leg = (def: ModeGroupDef, index: number): DuelLeg => {
    const pick = def.variants[Math.floor(random() * def.variants.length)];
    return { group: def.group, family: pick.family, variant: pick.variant, rounds: LEG_ROUNDS, deckSeed: hashSeed(`deck:${seed}:${index}:${def.group}`) };
  };
  return [leg(first, 0), leg(second, 1)];
}

/** Um tempo de um grupo escolhido à mão (teste com ?debug=1): o sentido e o baralho ainda vêm da semente. */
export function legOfGroup(group: ModeGroup, seed: string, index: number): DuelLeg {
  const def = groupDef(group);
  const pick = def.variants[Math.floor(mulberry32(hashSeed(`variant:${seed}:${index}`))() * def.variants.length)];
  return { group, family: pick.family, variant: pick.variant, rounds: LEG_ROUNDS, deckSeed: hashSeed(`deck:${seed}:${index}:${group}`) };
}

/** Modo liberado: grátis ou já comprado (o desbloqueio vale para o modo, não para o recorte). */
export function isVariantOwned(mode: ModeVariant, unlocked: readonly string[]) {
  const policy = policyFor(mode.family, mode.variant, "mundo");
  return !policy || policy.cost === 0 || unlocked.includes(policy.key);
}
export const isGroupOwned = (def: ModeGroupDef, unlocked: readonly string[]) => def.variants.every((mode) => isVariantOwned(mode, unlocked));
export const ownedGroups = (unlocked: readonly string[]): Set<ModeGroup> => new Set(MODE_GROUPS.filter((def) => isGroupOwned(def, unlocked)).map((def) => def.group));

/** Qual modo paga as moedas do tempo: o próprio, se a pessoa o tem; senão o modo base da escada (regra da prévia). */
export const coinModeFor = (ladder: Ladder, leg: Pick<DuelLeg, "family" | "variant">, owned: boolean): ModeVariant =>
  owned ? { family: leg.family, variant: leg.variant } : LADDER_BASE[ladder];

/** Escada de um duelo antigo, que só guardava a família e a variante jogadas. */
export function ladderForFamily(family: string, variant: string): Ladder {
  if (family === "bandeiras" || family === "historicas") return "bandeiras";
  if (family === "escrita") return variant === "escrita-pais" ? "bandeiras" : "mapas";
  return "mapas";
}
