import { createRoot } from "react-dom/client";
import { App } from "./app";
import { AchievementToaster } from "./components/achievement-toaster";
import { applyDebugFlagFromUrl } from "./domain/debug-flag";
import { ThemeFilters } from "./components/theme-decor";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, themeAttributes } from "./domain/themes";
import { intlLocale, t } from "./domain/i18n";
import "./index.css";
import "./themes.css";
import "./themes-league.css";

applyDebugFlagFromUrl();
// Idioma da página (leitores de tela, hifenização) e título da aba no idioma escolhido.
document.documentElement.lang = intlLocale;
document.title = t.app.title;
// A preferência de movimento reduzido vale desde a abertura (antes só era aplicada depois de visitar Opções).
try { document.documentElement.dataset.reducedMotion = localStorage.getItem("carta-reduced-motion") === "1" ? "true" : "false"; } catch { /* sem armazenamento */ }
try { document.documentElement.dataset.timerReveal = localStorage.getItem("carta-timer-late") === "1" ? "late" : "always"; } catch { /* sem armazenamento */ }
// O tema guardado vale desde o primeiro quadro (o app confirma depois se ele é do jogador).
try {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const { theme, treat, wash } = themeAttributes(isThemeId(saved) ? saved : DEFAULT_THEME);
  Object.assign(document.documentElement.dataset, { theme, treat, wash });
} catch { /* sem armazenamento */ }
createRoot(document.getElementById("root")!).render(<><App /><AchievementToaster /><ThemeFilters /></>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
