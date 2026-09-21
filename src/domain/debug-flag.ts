import { debugFlagFromSearch } from "./debug-rules";

// As ferramentas de debug aparecem no `npm run dev` e, em qualquer build, depois de abrir o app com
// ?debug=1 (fica ligado neste navegador até ?debug=0 ou o botão "Desativar" do painel).
const KEY = "carta-cega:debug";

export function isDebugEnabled() {
  if (import.meta.env.DEV) return true;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setDebugFlag(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}

// Lê ?debug=1 / ?debug=0 da URL e tira o parâmetro do endereço.
export function applyDebugFlagFromUrl() {
  const flag = debugFlagFromSearch(location.search);
  if (flag === null) return;
  setDebugFlag(flag);
  const url = new URL(location.href);
  url.searchParams.delete("debug");
  history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
}
