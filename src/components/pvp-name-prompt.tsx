import { useEffect, useRef, useState, type FormEvent } from "react";
import { PLAYER_NAME_MAX } from "../domain/pvp";
import { t } from "../domain/i18n";

// Diálogo que aparece na primeira vez que a pessoa clica em "Duelar" (arena do Hub), sem nome ainda salvo: pede o nome por cima do Hub, sem sair
// dele, e ao confirmar já entra na fila valendo (a mesma ação de quem já tinha nome). Reaproveita o visual do pvp-offer (ChallengeDialog).
export function PvpNamePrompt({ busy, error, onConfirm, onCancel }: {
  busy: boolean;
  error: string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed && !busy) onConfirm(trimmed);
  };
  return (
    <div className="pvp-offer-backdrop" onClick={onCancel}>
      <div className="pvp-offer is-dialog" role="dialog" aria-modal="true" aria-labelledby="pvp-name-prompt-title" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow pvp-offer-kicker">{t.pvp.namePrompt.kicker}</span>
        <strong id="pvp-name-prompt-title" className="pvp-offer-title">{t.pvp.namePrompt.title}</strong>
        <span className="pvp-offer-detail">{t.pvp.namePrompt.detail}</span>
        <form onSubmit={submit}>
          <label className="pvp-name">
            <span>{t.pvp.nameLabel}</span>
            <input ref={inputRef} type="text" value={name} maxLength={PLAYER_NAME_MAX} placeholder={t.pvp.namePlaceholder} onChange={(event) => setName(event.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" />
          </label>
          {error && <p className="pvp-error" role="alert">{error}</p>}
          <div className="pvp-offer-actions">
            <button type="submit" className="rs-btn primary" disabled={!trimmed || busy}>{t.pvp.namePrompt.confirm}</button>
            <button type="button" className="rs-btn" onClick={onCancel}>{t.pvp.namePrompt.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
