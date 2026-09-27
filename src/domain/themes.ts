// Temas do Hub (cores e pinceladas). O padrão é grátis; os da Loja se compram com moedas; os de liga (um por liga) vêm de graça, uma vez, ao entrar
// na liga e são do jogador para sempre. Lógica pura.
import { t } from "./i18n/index.js";
import { LEAGUES, type LeagueKey } from "./league.js";
import { DEFAULT_MAP_PALETTE, type MapPalette } from "./map-palette.js";

/** Como o Hub é pintado. O CSS de cada tratamento está em themes.css (`:root[data-treat="…"]`). */
export type ThemeTreatment = "tint" | "aquarela" | "atlas" | "fusion" | "brush-v" | "brush-h" | "brush-o" | "brush-wash" | "prata";

export type Theme = {
  id: string;
  name: string;
  tagline: string;
  treat: ThemeTreatment;
  /** Preço em moedas (0 = padrão, já é do jogador). */
  cost: number;
  /** Desenha manchas de aquarela atrás do Hub. */
  wash: boolean;
  /** As 4 cores dos modos (Mapa, Bandeiras, Capitais, Idiomas), só para a amostra da Loja. */
  swatches: readonly [string, string, string, string];
  /** Faixa de preço (só nos temas da Loja). */
  tier?: ThemeTier;
  /** Tema de liga: não está à venda (`cost` 0) e é dado uma vez ao entrar nessa liga, em qualquer das duas escadas. */
  league?: LeagueKey;
  /** Cores do mapa em jogo; o que faltar vem do padrão. */
  map?: Partial<MapPalette>;
};

export const DEFAULT_THEME = "pigmentos";

/** Faixas de preço da Loja. Simples (paletas e tratamentos), pintados (pincelada e aquarela), elaborados (também mudam o mapa e o resultado, com ornamentos)
 *  e prestígio (movimento e materiais próprios em todas as telas). Os de liga não têm faixa: não se compram. */
export type ThemeTier = "simple" | "painted" | "elaborate" | "prestige";
export const THEME_TIERS: readonly ThemeTier[] = ["simple", "painted", "elaborate", "prestige"];
/** Preço mínimo e máximo de cada faixa (em moedas). O padrão grátis entra na faixa simples. */
export const TIER_PRICES: Record<ThemeTier, readonly [number, number]> = { simple: [0, 16000], painted: [24000, 40000], elaborate: [80000, 160000], prestige: [250000, 400000] };

const THEME_SEEDS: readonly Theme[] = [
  { id: "pigmentos", name: "Pigmentos", tagline: "Uma cor para cada modo: teal, terracota, latão e violeta.", treat: "tint", cost: 0, tier: "simple", wash: false, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "aquarela", name: "Aquarela", tagline: "Cartões de vidro sobre manchas de cor que se misturam.", treat: "aquarela", cost: 10000, tier: "simple", wash: true, swatches: ["#1F7C74", "#B84E38", "#A87719", "#5D4C99"] },
  { id: "atlas", name: "Atlas", tagline: "Pranchas de mapa impresso, com curvas de nível e rampa de altitude.", treat: "atlas", cost: 12000, tier: "simple", wash: false, swatches: ["#3D7C93", "#AE5238", "#C29A44", "#6C8A58"] },
  { id: "terra", name: "Terra", tagline: "A paleta original do jogo (verde, terracota, latão) mais oliva, sobre aquarela.", treat: "fusion", cost: 12000, tier: "simple", wash: true, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "circulo", name: "Círculo", tagline: "Anéis pintados à mão em volta dos ícones, na paleta Terra.", treat: "brush-o", cost: 14000, tier: "simple", wash: false, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "fusao", name: "Fusão", tagline: "Os pigmentos do padrão sobre aquarela, com as cores se misturando entre os cartões.", treat: "fusion", cost: 16000, tier: "simple", wash: true, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "pinceladas", name: "Pinceladas", tagline: "Uma pincelada vertical por modo, em teal, rosa, âmbar e índigo.", treat: "brush-v", cost: 24000, tier: "painted", wash: false, swatches: ["#1F8A87", "#B94A76", "#D2782B", "#5561B5"] },
  { id: "pinceladas-terra", name: "Pinceladas · Terra", tagline: "As pinceladas verticais na paleta original do jogo.", treat: "brush-v", cost: 24000, tier: "painted", wash: false, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "listras", name: "Listras", tagline: "Faixas largas, como listras de bandeira pintadas à mão.", treat: "brush-h", cost: 24000, tier: "painted", wash: false, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "atelie", name: "Ateliê", tagline: "Pinceladas por cima de aquarela: o mais pintado de todos.", treat: "brush-wash", cost: 40000, tier: "painted", wash: true, swatches: ["#1F8A87", "#B94A76", "#D2782B", "#5561B5"] },
  // Temas de liga: quanto mais alta a liga, mais prestigioso o tema (mais camadas: Hub, mapa, resultado, ornamentos e movimento).
  {
    id: "prata", name: "Prata · Gravura", tagline: "Chapa de prata gravada: papel pérola, hachura fina e o mapa em ardósia.", treat: "prata", cost: 0, wash: false, league: "prata",
    swatches: ["#3A6A8A", "#8A4A4A", "#A99E76", "#5A6092"],
    map: { ocean: "#0E161D", land: "#243440", outline: "#C2CDD4", marker: "#D3DCE1", markerStroke: "#3C4B56", graticule: "#B4C2CC" },
  },
];
/** Nome e frase de cada tema no idioma da interface (domain/i18n). */
export const THEMES: readonly Theme[] = THEME_SEEDS.map((theme) => {
  const [name, tagline] = t.themes[theme.id] ?? [theme.name, theme.tagline];
  return { ...theme, name, tagline };
});

export type ThemeId = (typeof THEMES)[number]["id"];
export type ThemeUnlockKey = `theme:${string}`;

export const themeUnlockKey = (id: string): ThemeUnlockKey => `theme:${id}`;
export const themeById = (id: string): Theme | undefined => THEMES.find((theme) => theme.id === id);
export const isThemeId = (value: unknown): value is ThemeId => typeof value === "string" && THEMES.some((theme) => theme.id === value);

export const isLeagueTheme = (theme: Theme) => Boolean(theme.league);
export const themesOfTier = (tier: ThemeTier): Theme[] => THEMES.filter((theme) => theme.tier === tier);
/** Os temas da Loja (o padrão e os que se compram) e os de liga (que só vêm ao entrar na liga). */
export const SHOP_THEMES: readonly Theme[] = THEMES.filter((theme) => !theme.league);
export const LEAGUE_THEMES: readonly Theme[] = THEMES.filter((theme) => Boolean(theme.league));

export const isThemeOwned = (id: string, unlocked: readonly string[]) => {
  const theme = themeById(id);
  if (!theme) return false;
  // tema de liga tem preço 0 mas não é de graça: só vale com o desbloqueio dado ao entrar na liga
  return theme.league ? unlocked.includes(themeUnlockKey(id)) : theme.cost === 0 || unlocked.includes(themeUnlockKey(id));
};

/** Os temas de liga a que a pessoa já tem direito, dado o índice da melhor liga que alcançou (nas duas escadas). */
export const leagueThemesFor = (bestLeagueIndex: number): Theme[] =>
  LEAGUE_THEMES.filter((theme) => LEAGUES.indexOf(theme.league as LeagueKey) <= bestLeagueIndex);

/** As cores do mapa em jogo no tema (o que o tema não muda vem do padrão). */
export const mapPaletteFor = (id: string | undefined): MapPalette => ({ ...DEFAULT_MAP_PALETTE, ...(themeById(id ?? "")?.map ?? {}) });

/** O tema guardado só vale se for do jogador: sem ele (dados limpos, valor inválido) volta ao padrão. */
export const resolveTheme = (saved: unknown, unlocked: readonly string[]): string =>
  isThemeId(saved) && isThemeOwned(saved, unlocked) ? saved : DEFAULT_THEME;

/** Quanto falta de moedas para comprar (0 = já dá). */
export const missingCoins = (cost: number, balance: number) => Math.max(0, cost - balance);

/** Atributos que o CSS lê no elemento raiz (`data-theme` = paleta, `data-treat` = tratamento, `data-wash` = manchas). */
export function themeAttributes(id: string): { theme: string; treat: ThemeTreatment; wash: "0" | "1" } {
  const theme = themeById(id) ?? themeById(DEFAULT_THEME)!;
  return { theme: theme.id, treat: theme.treat, wash: theme.wash ? "1" : "0" };
}

export const THEME_STORAGE_KEY = "carta-theme";
