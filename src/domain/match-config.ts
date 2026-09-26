// Tela "Configure a partida": quais modos existem em cada família, qual está escolhido e o resumo da partida. Lógica pura.
import type { AnyQuizVariant, Family } from "./types";
import { timerSecondsFor } from "./pace.js";
import { hitRange, type Pace } from "./spoils.js";

export type TopFamily = "mapa" | "bandeiras" | "capitais" | "idiomas";
export type ConfigIcon = "map" | "eye" | "type" | "route" | "flag" | "layers" | "language";
export type FlagKind = "current" | "writing" | "historical";

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

const MODES: Record<TopFamily, ModeOption[]> = {
  mapa: [
    { key: "mapa", label: "Clicar no mapa", icon: "map", family: "mapa", variant: "mapa", hint: "Toque no país ou território pedido." },
    { key: "silhueta-opcoes", label: "Silhueta · alternativas", icon: "eye", family: "silhueta", variant: "silhueta-opcoes", hint: "Reconheça o contorno entre 4 nomes." },
    { key: "silhueta", label: "Silhueta · escrita", icon: "type", family: "silhueta", variant: "silhueta", hint: "Reconheça o contorno e digite o nome." },
    { key: "travel", label: "Travel", icon: "route", family: "travel", variant: "travel", hint: "Digite os países do caminho terrestre entre dois países." },
  ],
  bandeiras: [
    { key: "atuais", label: "Atuais", icon: "flag", family: "bandeiras", variant: "nome-bandeira", flag: "current", direction: true, hint: "Bandeiras de hoje. Escolha o sentido logo abaixo." },
    { key: "escrita-pais", label: "Escrita", icon: "type", family: "escrita", variant: "escrita-pais", flag: "writing", hint: "Veja a bandeira e digite o nome do país." },
    { key: "historicas", label: "Históricas", icon: "layers", family: "historicas", variant: "nome-historica", flag: "historical", direction: true, hint: "Impérios e países que não existem mais. Escolha o sentido logo abaixo." },
  ],
  capitais: [
    { key: "capital-pais", label: "Clicar no mapa", icon: "map", family: "capitais", variant: "capital-pais", hint: "Veja a capital e toque no país dela." },
    { key: "escrita-capital", label: "Escrita", icon: "type", family: "escrita", variant: "escrita-capital", hint: "Veja o país e digite a capital." },
  ],
  idiomas: [
    { key: "idioma-nome", label: "Nome do idioma", icon: "language", family: "idiomas", variant: "idioma-nome", hint: "Leia uma frase na escrita original e escolha o nome do idioma." },
    { key: "idioma-pais", label: "Países do idioma", icon: "language", family: "idiomas", variant: "idioma-pais", hint: "Leia uma frase na escrita original e descubra em quais países ele é falado." },
  ],
};

/** Família do motor e variante correspondentes a um modo guardado (null se não existir). */
export function variantContextFor(topFamily: TopFamily, saved: string): { family: Family; variant: AnyQuizVariant } | null {
  const table: Record<TopFamily, Array<[string, Family]>> = {
    mapa: [["mapa", "mapa"], ["silhueta", "silhueta"], ["silhueta-opcoes", "silhueta"], ["travel", "travel"]],
    bandeiras: [["bandeira-nome", "bandeiras"], ["nome-bandeira", "bandeiras"], ["escrita-pais", "escrita"], ["nome-historica", "historicas"], ["historica-nome", "historicas"]],
    capitais: [["capital-pais", "capitais"], ["pais-capital", "capitais"], ["escrita-capital", "escrita"]],
    idiomas: [["idioma-nome", "idiomas"], ["idioma-pais", "idiomas"]],
  };
  const match = table[topFamily].find(([variant]) => variant === saved);
  return match ? { family: match[1], variant: match[0] as AnyQuizVariant } : null;
}

export const modesFor = (top: TopFamily) => MODES[top];

/** Modo que corresponde ao estado atual (família + variante do motor). */
export function selectedMode(top: TopFamily, family: Family, variant: AnyQuizVariant): ModeOption {
  const modes = MODES[top];
  const match = modes.find((mode) => mode.family === family && (mode.flag ? true : mode.variant === variant));
  return match ?? modes[0];
}

export const directionLabel = (direction: "name-to-flag" | "flag-to-name") =>
  direction === "name-to-flag" ? "Nome → bandeira" : "Bandeira → nome";

export function formatSeconds(seconds: number, variant: AnyQuizVariant) {
  const text = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
  return variant === "travel" ? `${text} por rota` : text;
}

export function paceHint(pace: Pace, variant: AnyQuizVariant) {
  if (pace === "training") {
    // Só nos modos que clicam no mapa (mapa/capital-pais) o Treino também marca o país perguntado.
    const marking = variant === "mapa" || variant === "capital-pais"
      ? " Cada país perguntado fica marcado no mapa com o nome, acertando ou errando."
      : "";
    return `Sem cronômetro. Rende só 50% das moedas.${marking}`;
  }
  const time = formatSeconds(timerSecondsFor(variant), variant);
  return variant === "travel"
    ? `${time}. Acabou o tempo, a rota conta como erro.`
    : `${time} por pergunta. Acabou o tempo, conta como erro.`;
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
  const time = pace === "timed" ? `Partida ${formatSeconds(timerSecondsFor(variant), variant).replace(" por rota", "")}` : "Treino";
  const unit = variant === "travel" ? "por país da rota" : "por acerto";
  return {
    title: mode.direction && input.direction ? `${mode.label} · ${directionLabel(input.direction)}` : mode.label,
    sub: `${time} · ${input.rounds} rodadas · ${input.regionText} (${input.count})`,
    earn: low === high ? String(low) : `${low} a ${high}`,
    earnUnit: pace === "training" ? `moedas ${unit} · 50%` : `moedas ${unit}`,
  };
}
