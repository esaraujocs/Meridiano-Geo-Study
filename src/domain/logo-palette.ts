// Paletas do logo (olho com globo). A escolha é uma preferência só deste navegador, feita pelo painel de debug.

export type LogoPalette = {
  id: string;
  label: string;
  tile: string; // fundo do ícone
  outline: string; // contorno do olho
  sclera: string; // "branco" do olho
  iris: string; // globo
  grid: string; // meridianos e paralelos
  dot: string; // ponto de "onde fica"
  ring: string; // borda do ponto
};

export const LOGO_PALETTES: readonly LogoPalette[] = [
  { id: "escuro-quente", label: "Escuro quente", tile: "#1E1611", outline: "#C9714F", sclera: "#F3E9D2", iris: "#8C3F2C", grid: "#E9B79B", dot: "#F3E9D2", ring: "#8C3F2C" },
  { id: "carvao-terracota", label: "Carvão e terracota", tile: "#1C1A19", outline: "#B65F47", sclera: "#E7D8BA", iris: "#B65F47", grid: "#1C1A19", dot: "#F3E9D2", ring: "#1C1A19" },
  { id: "terracota-creme", label: "Terracota e creme", tile: "#B65F47", outline: "#2B1D17", sclera: "#F3E9D2", iris: "#2B1D17", grid: "#D98E6E", dot: "#F3E9D2", ring: "#2B1D17" },
  { id: "terracota-profundo", label: "Terracota profundo", tile: "#8C3F2C", outline: "#1F120D", sclera: "#F3E9D2", iris: "#1F120D", grid: "#C9714F", dot: "#F3E9D2", ring: "#1F120D" },
  { id: "bege", label: "Bege", tile: "#E4D2AE", outline: "#3B2A20", sclera: "#F7EFDC", iris: "#B65F47", grid: "#F3E9D2", dot: "#3B2A20", ring: "#F3E9D2" },
  { id: "areia", label: "Areia monocromático", tile: "#F3E9D2", outline: "#6B4A35", sclera: "#E7D8BA", iris: "#6B4A35", grid: "#E7D8BA", dot: "#B65F47", ring: "#F3E9D2" },
  { id: "bordo-terracota", label: "Bordô e terracota", tile: "#4A1F26", outline: "#C9714F", sclera: "#F3E9D2", iris: "#6B2733", grid: "#E9B79B", dot: "#F3E9D2", ring: "#6B2733" },
  { id: "marrom-caramelo", label: "Marrom e caramelo", tile: "#2A1B12", outline: "#D9A066", sclera: "#F3E9D2", iris: "#8A5A2B", grid: "#F3E9D2", dot: "#2A1B12", ring: "#F3E9D2" },
  { id: "olho-terracota", label: "Olho terracota (invertido)", tile: "#14100E", outline: "#F3E9D2", sclera: "#B65F47", iris: "#14100E", grid: "#C9714F", dot: "#F3E9D2", ring: "#14100E" },
  { id: "oliva-areia", label: "Oliva e areia", tile: "#2B301F", outline: "#8F9A6B", sclera: "#F3E9D2", iris: "#5B6B3E", grid: "#F3E9D2", dot: "#F3E9D2", ring: "#2B301F" },
  { id: "creme-terracota", label: "Creme e terracota", tile: "#F3E9D2", outline: "#B65F47", sclera: "#FBF6EA", iris: "#B65F47", grid: "#FBF6EA", dot: "#2B1D17", ring: "#FBF6EA" },
  { id: "bege-carvao", label: "Bege e carvão", tile: "#E4D2AE", outline: "#2B2724", sclera: "#F7EFDC", iris: "#2B2724", grid: "#E4D2AE", dot: "#B65F47", ring: "#F7EFDC" },
  { id: "argila", label: "Argila", tile: "#D9A183", outline: "#3B2A20", sclera: "#F7EFDC", iris: "#8C3F2C", grid: "#F7EFDC", dot: "#3B2A20", ring: "#F7EFDC" },
  { id: "rose-vinho", label: "Rosé e vinho", tile: "#E8C9BC", outline: "#5A2A2E", sclera: "#FBF3EA", iris: "#B65F47", grid: "#FBF3EA", dot: "#5A2A2E", ring: "#FBF3EA" },
  // variações do azul (verde-azulado) do Hub, no mesmo espírito do "Oliva e areia"
  { id: "azul-areia", label: "Azul do Hub e areia", tile: "#12302D", outline: "#7FB0A8", sclera: "#F3E9D2", iris: "#2F6F6A", grid: "#F3E9D2", dot: "#F3E9D2", ring: "#12302D" },
  { id: "azul-profundo", label: "Azul profundo e areia", tile: "#0E2422", outline: "#4E9A92", sclera: "#E7D8BA", iris: "#2F6F6A", grid: "#E7D8BA", dot: "#F3E9D2", ring: "#0E2422" },
  { id: "azul-cheio", label: "Azul do Hub (cheio)", tile: "#2F6F6A", outline: "#12302D", sclera: "#F3E9D2", iris: "#12302D", grid: "#7FB0A8", dot: "#F3E9D2", ring: "#12302D" },
  { id: "azul-agua", label: "Azul-água e creme", tile: "#1F4A46", outline: "#6FA8A0", sclera: "#F3E9D2", iris: "#2F6F6A", grid: "#F3E9D2", dot: "#F3E9D2", ring: "#1F4A46" },
  { id: "azul-claro", label: "Azul claro", tile: "#DCE8E5", outline: "#2F6F6A", sclera: "#F7F3E6", iris: "#2F6F6A", grid: "#DCE8E5", dot: "#12302D", ring: "#F7F3E6" },
  { id: "azul-oliva", label: "Azul e oliva", tile: "#12302D", outline: "#8F9A6B", sclera: "#F3E9D2", iris: "#2F6F6A", grid: "#F3E9D2", dot: "#F3E9D2", ring: "#12302D" },
];

export const DEFAULT_LOGO_PALETTE = LOGO_PALETTES[0].id;

export function resolveLogoPalette(id: string | null | undefined): LogoPalette {
  return LOGO_PALETTES.find((palette) => palette.id === id) ?? LOGO_PALETTES[0];
}

const KEY = "carta-cega:logo-palette";
const listeners = new Set<() => void>();

// Devolve sempre um id conhecido (string estável, própria para useSyncExternalStore).
export function readLogoPalette(): string {
  try { return resolveLogoPalette(localStorage.getItem(KEY)).id; } catch { return DEFAULT_LOGO_PALETTE; }
}

export function setLogoPalette(id: string) {
  try { localStorage.setItem(KEY, resolveLogoPalette(id).id); } catch { /* sem armazenamento: vale só até recarregar */ }
  listeners.forEach((listener) => listener());
}

export function subscribeLogoPalette(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
