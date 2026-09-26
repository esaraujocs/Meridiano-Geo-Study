import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { achievementToasts } from "../domain/achievement-toast";
import { t } from "../domain/i18n";
import { RARITY_LABELS, rarityLevel } from "../domain/achievement-summary";
import { ACHIEVEMENT_ICON, Glyph, Medallion } from "./achievement-art";

const SHOW_MS = 6500;
const SHOW_MS_BUSY = 4200; // com mais avisos na fila, cada um dura menos
const LEAVE_MS = 320;
const PARTICLES: Record<number, number> = { 1: 6, 2: 8, 3: 10, 4: 12, 5: 16 };

// Faíscas que saem do medalhão: ângulo, distância e atraso fixos por índice (a mesma animação sempre).
function burst(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
    const distance = 52 + (index % 3) * 16;
    return {
      "--dx": `${Math.round(Math.cos(angle) * distance)}px`,
      "--dy": `${Math.round(Math.sin(angle) * distance)}px`,
      "--delay": `${(index % 4) * 40}ms`,
      "--size": `${4 + (index % 3) * 2}px`,
    } as CSSProperties;
  });
}

// Aviso de nova conquista: aparece por cima de qualquer tela, um de cada vez, sem bloquear o jogo.
export function AchievementToaster() {
  const queue = useSyncExternalStore(achievementToasts.subscribe, achievementToasts.snapshot, achievementToasts.snapshot);
  const current = queue[0];
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => { setLeaving(false); setPaused(false); }, [current?.key]);
  useEffect(() => {
    if (!current || paused || leaving) return;
    const timer = window.setTimeout(() => setLeaving(true), queue.length > 1 ? SHOW_MS_BUSY : SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, leaving, queue.length]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => achievementToasts.shift(), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const rarity = current ? rarityLevel(current.rarity) : 1;
  return <div className="ach-toaster" role="status" aria-live="polite" aria-atomic="true">
    {current && <div key={current.key} className={`ach-toast ach-r${rarity} ${leaving ? "is-leaving" : ""}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="ach-toast-medal">
        <Medallion icon={ACHIEVEMENT_ICON[current.id] ?? "star"} rarity={rarity} state="unlocked" size={64} />
        <span className="ach-toast-burst" aria-hidden="true">{burst(PARTICLES[rarity]).map((style, index) => <i key={index} style={style} />)}</span>
      </div>
      <div className="ach-toast-text">
        <span className="ach-toast-kicker">{t.achievementsView.toastKicker(RARITY_LABELS[rarity])}</span>
        <strong>{current.name}</strong>
        <span className="ach-toast-desc">{current.description}</span>
      </div>
      {queue.length > 1 && <span className="ach-toast-more" aria-label={t.achievementsView.toastMore(queue.length - 1)}>+{queue.length - 1}</span>}
      <button type="button" className="ach-toast-close" onClick={() => setLeaving(true)} aria-label={t.achievementsView.toastClose}><Glyph name="x" size={16} stroke={2} /></button>
    </div>}
  </div>;
}
