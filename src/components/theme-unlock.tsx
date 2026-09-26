import { useState } from "react";
import { themeById } from "../domain/themes";
import { t } from "../domain/i18n";

/** Aviso de tema de liga conquistado (no resultado do duelo que abriu a liga): a pessoa aplica na hora ou deixa para depois. O tema já é dela de qualquer jeito. */
export function ThemeUnlockCard({ themeId, onEquip }: { themeId: string; onEquip?: (id: string) => void }) {
  const theme = themeById(themeId);
  const [state, setState] = useState<"open" | "applied" | "later">("open");
  if (!theme || state === "later") return null;
  return <div className="theme-unlock" role="status">
    <span className="tu-swatch" aria-hidden="true">{theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
    <div className="tu-text"><small>{t.duel.result.themeUnlocked}</small><b>{theme.name}</b><span>{t.duel.result.themeUnlockedSub}</span></div>
    <div className="tu-actions">
      {state === "applied"
        ? <span className="tu-done">{t.duel.result.themeApplied}</span>
        : <><button type="button" className="tu-go" onClick={() => { onEquip?.(theme.id); setState("applied"); }}>{t.duel.result.themeApply}</button><button type="button" onClick={() => setState("later")}>{t.duel.result.themeLater}</button></>}
    </div>
  </div>;
}
