// Aviso de que uma expedição do Mecenato voltou, para quem está em outra tela (Loja, Coleção, Progresso…). No Hub o próprio cartão avisa, e no meio de
// uma partida nunca aparece. Cada expedição avisa uma vez só (a lista fica no localStorage `carta-mecenato-announced`).
import { useEffect, useState } from "react";
import { activeExpeditions, emptyProgress, isBack, routeById } from "../domain/mecenato";
import { museumPieceById, museumPieceText } from "../domain/museum";
import { useMecenato } from "./use-mecenato";
import { t } from "../domain/i18n";

const KEY = "carta-mecenato-announced";
const readAnnounced = (): string[] => { try { const value = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } };
const markAnnounced = (id: string) => { try { localStorage.setItem(KEY, JSON.stringify([...new Set([...readAnnounced(), id])].slice(-40))); } catch { /* sem armazenamento */ } };

export function MecenatoReturnToast({ mode, onOpen }: { mode: "show" | "quiet" | "hold"; onOpen: () => void }) {
  const view = useMecenato();
  const [now, setNow] = useState(Date.now());
  const [shown, setShown] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 20_000); return () => window.clearInterval(timer); }, []);
  const back = view ? activeExpeditions(view).find((record) => isBack(record, view.progress[record.id] ?? emptyProgress(), now)) : undefined;
  useEffect(() => {
    // "hold": numa partida, espera ela acabar; "quiet": no Hub o cartão já mostra, então só marca como avisada
    if (!back || mode === "hold" || readAnnounced().includes(back.id)) return;
    markAnnounced(back.id);
    if (mode === "quiet") return;
    const piece = museumPieceById(routeById(back.route)?.stages[back.stage]?.piece ?? "");
    setShown({ id: back.id, title: piece ? museumPieceText(piece).title : "" });
  }, [back?.id, mode]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 9000);
    return () => window.clearTimeout(timer);
  }, [shown?.id]);
  if (!shown || mode === "hold") return null;
  return (
    <div className="pvp-toast mc-toast" role="status">
      <span>{t.mecenato.toastBack(shown.title)}</span>
      <button type="button" className="social-open" onClick={() => { setShown(null); onOpen(); }}>{t.mecenato.land}</button>
      <button type="button" onClick={() => setShown(null)} aria-label={t.pvp.notice.dismiss}>×</button>
    </div>
  );
}
