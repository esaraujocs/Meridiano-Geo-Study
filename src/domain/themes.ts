// Temas do Hub (cores e pinceladas). O padrão é grátis; os outros se compram na Loja com moedas. Lógica pura.
import { t } from "./i18n/index.js";

/** Como o Hub é pintado. O CSS de cada tratamento está em themes.css (`:root[data-treat="…"]`). */
export type ThemeTreatment = "tint" | "aquarela" | "atlas" | "fusion" | "brush-v" | "brush-h" | "brush-o" | "brush-wash";

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
};

export const DEFAULT_THEME = "pigmentos";

const THEME_SEEDS: readonly Theme[] = [
  { id: "pigmentos", name: "Pigmentos", tagline: "Uma cor para cada modo: teal, terracota, latão e violeta.", treat: "tint", cost: 0, wash: false, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "aquarela", name: "Aquarela", tagline: "Cartões de vidro sobre manchas de cor que se misturam.", treat: "aquarela", cost: 6000, wash: true, swatches: ["#1F7C74", "#B84E38", "#A87719", "#5D4C99"] },
  { id: "atlas", name: "Atlas", tagline: "Pranchas de mapa impresso, com curvas de nível e rampa de altitude.", treat: "atlas", cost: 8000, wash: false, swatches: ["#3D7C93", "#AE5238", "#C29A44", "#6C8A58"] },
  { id: "terra", name: "Terra", tagline: "A paleta original do jogo (verde, terracota, latão) mais oliva, sobre aquarela.", treat: "fusion", cost: 8000, wash: true, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "circulo", name: "Círculo", tagline: "Anéis pintados à mão em volta dos ícones, na paleta Terra.", treat: "brush-o", cost: 9000, wash: false, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "fusao", name: "Fusão", tagline: "Os pigmentos do padrão sobre aquarela, com as cores se misturando entre os cartões.", treat: "fusion", cost: 10000, wash: true, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "pinceladas", name: "Pinceladas", tagline: "Uma pincelada vertical por modo, em teal, rosa, âmbar e índigo.", treat: "brush-v", cost: 12000, wash: false, swatches: ["#1F8A87", "#B94A76", "#D2782B", "#5561B5"] },
  { id: "pinceladas-terra", name: "Pinceladas · Terra", tagline: "As pinceladas verticais na paleta original do jogo.", treat: "brush-v", cost: 12000, wash: false, swatches: ["#2F6F6A", "#B65F47", "#C49345", "#7A8145"] },
  { id: "listras", name: "Listras", tagline: "Faixas largas, como listras de bandeira pintadas à mão.", treat: "brush-h", cost: 12000, wash: false, swatches: ["#2B8378", "#C25A42", "#BE8A2C", "#6F5DA6"] },
  { id: "atelie", name: "Ateliê", tagline: "Pinceladas por cima de aquarela: o mais pintado de todos.", treat: "brush-wash", cost: 18000, wash: true, swatches: ["#1F8A87", "#B94A76", "#D2782B", "#5561B5"] },
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

export const isThemeOwned = (id: string, unlocked: readonly string[]) => {
  const theme = themeById(id);
  return Boolean(theme) && (theme!.cost === 0 || unlocked.includes(themeUnlockKey(id)));
};

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
