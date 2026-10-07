// Tela "Configure a partida": quais modos existem em cada família, qual está escolhido e o resumo da partida. Lógica pura.
import type { AnyQuizVariant, Family } from "./types";
import { timerSecondsFor } from "./pace.js";
import { hitRange, type Pace } from "./spoils.js";
import { t } from "./i18n/index.js";
import { DIVISION_VARIANTS, baseVariant, isDivisionVariant, type UnitWord } from "./divisions.js";
import { flagCategoryHas, type FlagCategory } from "./flag-configuration.js";

export type TopFamily = "mapa" | "bandeiras" | "capitais" | "idiomas" | "gentilicos" | "moedas" | "divisoes";
export type ConfigIcon = "map" | "eye" | "type" | "route" | "flag" | "layers" | "language" | "people" | "coins" | "capital";
export type FlagKind = FlagCategory;

export type ModeOption = {
  key: string;
  label: string;
  icon: ConfigIcon;
  family: Family;
  /** Variante escolhida ao tocar (nas bandeiras, o sentido vem da opção "Direção"). */
  variant: AnyQuizVariant;
  /** Categoria de bandeira: as variantes dela são resolvidas pelo sentido escolhido. */
  flag?: FlagKind;
  /** Mostra a escolha Nome → bandeira / Bandeira → nome logo abaixo. */
  direction?: boolean;
  hint: string;
};

type ModeSeed = Omit<ModeOption, "label" | "hint">;
const withText = (mode: ModeSeed): ModeOption => {
  const [label, hint] = t.modes[mode.key as keyof typeof t.modes];
  return { ...mode, label, hint };
};
const MODE_SEEDS: Record<TopFamily, ModeSeed[]> = {
  mapa: [
    { key: "mapa", icon: "map", family: "mapa", variant: "mapa" },
    { key: "silhueta-opcoes", icon: "eye", family: "silhueta", variant: "silhueta-opcoes" },
    { key: "silhueta", icon: "type", family: "silhueta", variant: "silhueta" },
    { key: "travel", icon: "route", family: "travel", variant: "travel" },
  ],
  bandeiras: [
    { key: "atuais", icon: "flag", family: "bandeiras", variant: "nome-bandeira", flag: "current", direction: true },
    { key: "escrita-pais", icon: "type", family: "escrita", variant: "escrita-pais", flag: "writing" },
    { key: "historicas", icon: "layers", family: "historicas", variant: "nome-historica", flag: "historical", direction: true },
  ],
  capitais: [
    { key: "capital-pais", icon: "map", family: "capitais", variant: "capital-pais" },
    { key: "escrita-capital", icon: "type", family: "escrita", variant: "escrita-capital" },
  ],
  idiomas: [
    { key: "idioma-nome", icon: "language", family: "idiomas", variant: "idioma-nome" },
    { key: "idioma-pais", icon: "language", family: "idiomas", variant: "idioma-pais" },
  ],
  gentilicos: [
    { key: "gentilico-pais", icon: "people", family: "gentilicos", variant: "gentilico-pais" },
    { key: "pais-gentilico", icon: "people", family: "gentilicos", variant: "pais-gentilico" },
  ],
  moedas: [
    { key: "pais-moeda", icon: "coins", family: "moedas", variant: "pais-moeda" },
    { key: "moeda-pais", icon: "coins", family: "moedas", variant: "moeda-pais" },
  ],
  // Estados e províncias: as unidades e as capitais no mapa, silhueta, bandeiras (os dois sentidos e a escrita) e capitais; a Mesa só mostra os
  // que o país escolhido tem (`variantPlayable`: sem bandeiras no pacote, sem os modos de bandeira)
  divisoes: [
    { key: "dv-mapa", icon: "map", family: "divisoes", variant: "dv-mapa" },
    { key: "dv-capital-mapa", icon: "capital", family: "divisoes", variant: "dv-capital-mapa" },
    { key: "dv-silhueta-opcoes", icon: "eye", family: "divisoes", variant: "dv-silhueta-opcoes" },
    { key: "dv-silhueta", icon: "type", family: "divisoes", variant: "dv-silhueta" },
    { key: "dv-bandeiras", icon: "flag", family: "divisoes", variant: "dv-nome-bandeira", flag: "divisoes", direction: true },
    { key: "dv-escrita-nome", icon: "type", family: "divisoes", variant: "dv-escrita-nome" },
    { key: "dv-capital", icon: "layers", family: "divisoes", variant: "dv-capital" },
    { key: "dv-escrita-capital", icon: "type", family: "divisoes", variant: "dv-escrita-capital" },
  ],
};

const MODES = Object.fromEntries(Object.entries(MODE_SEEDS).map(([top, list]) => [top, list.map(withText)])) as Record<TopFamily, ModeOption[]>;

/** Família do motor e variante correspondentes a um modo guardado (null se não existir). */
export function variantContextFor(topFamily: TopFamily, saved: string): { family: Family; variant: AnyQuizVariant } | null {
  const table: Record<TopFamily, Array<[string, Family]>> = {
    mapa: [["mapa", "mapa"], ["silhueta", "silhueta"], ["silhueta-opcoes", "silhueta"], ["travel", "travel"]],
    bandeiras: [["bandeira-nome", "bandeiras"], ["nome-bandeira", "bandeiras"], ["escrita-pais", "escrita"], ["nome-historica", "historicas"], ["historica-nome", "historicas"]],
    capitais: [["capital-pais", "capitais"], ["pais-capital", "capitais"], ["escrita-capital", "escrita"]],
    idiomas: [["idioma-nome", "idiomas"], ["idioma-pais", "idiomas"]],
    gentilicos: [["gentilico-pais", "gentilicos"], ["pais-gentilico", "gentilicos"]],
    moedas: [["pais-moeda", "moedas"], ["moeda-pais", "moedas"]],
    divisoes: DIVISION_VARIANTS.map((variant): [string, Family] => [variant, "divisoes"]),
  };
  const match = table[topFamily].find(([variant]) => variant === saved);
  return match ? { family: match[1], variant: match[0] as AnyQuizVariant } : null;
}

export const modesFor = (top: TopFamily) => MODES[top];

/** "Idiomas, povos e moedas" (07/10/2026): Idiomas, Gentílicos e Moedas num cartão só do Hub, com a escolha entre os três na Mesa ("Tema").
 *  Por dentro seguem três famílias (compras, favoritas, última partida e estatísticas de cada uma não mudam). */
export const PEOPLES_GROUP = ["idiomas", "gentilicos", "moedas"] as const;
export type PeoplesTopic = (typeof PEOPLES_GROUP)[number];
/** O último tema jogado (localStorage), que o cartão do Hub abre. */
export const PEOPLES_LAST_KEY = "carta-last-topic:povos";
export const isPeoplesTopic = (top: string): top is PeoplesTopic => (PEOPLES_GROUP as readonly string[]).includes(top);
/** O tema que o cartão do Hub abre: o último jogado; sem ele, o primeiro com algum modo liberado; sem nenhum, Idiomas. */
export function peoplesEntry(last: string | null, open: (topic: PeoplesTopic) => boolean): PeoplesTopic {
  if (last && isPeoplesTopic(last)) return last;
  return PEOPLES_GROUP.find(open) ?? "idiomas";
}

/** Modo que corresponde ao estado atual (família + variante do motor). */
export function selectedMode(top: TopFamily, family: Family, variant: AnyQuizVariant): ModeOption {
  const modes = MODES[top];
  // um modo de bandeira vale para os dois sentidos dele (em Estados e províncias todos os modos dividem a família do motor)
  const match = modes.find((mode) => mode.family === family && (mode.flag ? flagCategoryHas(mode.flag, variant) : mode.variant === variant));
  return match ?? modes[0];
}

export const directionLabel = (direction: "name-to-flag" | "flag-to-name") =>
  direction === "name-to-flag" ? t.config.nameToFlag : t.config.flagToName;

export function formatSeconds(seconds: number, variant: AnyQuizVariant) {
  const text = seconds >= 60 && seconds % 60 === 0 ? t.time.minutes(seconds / 60) : t.time.seconds(seconds);
  return variant === "travel" ? `${text} ${t.time.perRoute}` : text;
}

export function paceHint(pace: Pace, variant: AnyQuizVariant, unit?: UnitWord) {
  if (pace === "training") {
    // Só nos modos que clicam no mapa (mapa/capital-pais) o Treino também marca o país (ou o estado, a província…) perguntado.
    const base = baseVariant(variant);
    const marking = base === "mapa" || base === "capital-pais" ? (isDivisionVariant(variant) && unit ? t.divisions.trainingMarks(unit) : t.config.trainingMarks) : "";
    return `${t.config.trainingHint}${marking}`;
  }
  const time = formatSeconds(timerSecondsFor(variant), variant);
  return variant === "travel" ? t.config.timedTravelHint(time) : t.config.timedHint(time);
}

export type ConfigSummary = { title: string; sub: string; earn: string; earnUnit: string };

/** Resumo mostrado na barra de baixo: o que vai ser jogado e quanto cada acerto vale. */
export function configSummary(input: {
  mode: ModeOption;
  direction?: "name-to-flag" | "flag-to-name";
  variant: AnyQuizVariant;
  pace: Pace;
  rounds: number;
  regionText: string;
  count: number;
}): ConfigSummary {
  const { mode, variant, pace } = input;
  const [low, high] = hitRange(variant, pace);
  const time = pace === "timed" ? t.config.summaryTimed(formatSeconds(timerSecondsFor(variant), "mapa")) : t.config.training;
  const unit = variant === "travel" ? t.config.perRouteCountry : t.config.perHit;
  return {
    title: mode.direction && input.direction ? `${mode.label} · ${directionLabel(input.direction)}` : mode.label,
    sub: t.config.summarySub(time, input.rounds, input.regionText, input.count),
    earn: low === high ? String(low) : t.config.earnRange(low, high),
    earnUnit: pace === "training" ? t.config.coinsUnitTraining(unit) : t.config.coinsUnit(unit),
  };
}
