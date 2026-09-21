import { useCallback, useEffect, useState } from "react";
import type { Legacy } from "../domain/types";
import { ACHIEVEMENT_DEFINITIONS } from "../domain/achievements";
import { canonicalCurrentIds } from "../domain/progress-surfaces";
import { loadSpecialData } from "../domain/special-data";
import { achievementToasts } from "../domain/achievement-toast";
import { RARITY_LABELS } from "../domain/achievement-summary";
import { setDebugFlag } from "../domain/debug-flag";
import { MAX_DEBUG_LEVEL, levelForXp } from "../domain/debug-rules";
import * as tools from "../domain/debug-tools";
import { DEFAULT_LOGO_PALETTE, LOGO_PALETTES, readLogoPalette, setLogoPalette } from "../domain/logo-palette";
import { BrandLogo } from "./brand-logo";

type Props = { data: Legacy; onChange: (options: { announce: boolean }) => Promise<void> | void };

// Ferramentas de debug (Opções). Tudo o que altera dados guarda o original: "Restaurar dados reais" desfaz.
export default function DebugPanel({ data, onChange }: Props) {
  const [economy, setEconomy] = useState<tools.EconomySnapshot | null>(null);
  const [changes, setChanges] = useState<number | null>(null);
  const [fresh, setFresh] = useState<tools.FreshStart | null>(null);
  const [levelInput, setLevelInput] = useState("10");
  const [albumLevel, setAlbumLevel] = useState("3");
  const [withHistorical, setWithHistorical] = useState(true);
  const [achievementId, setAchievementId] = useState(ACHIEVEMENT_DEFINITIONS[0].id);
  const [coins, setCoins] = useState("10");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoPalette, setLogoPaletteState] = useState(readLogoPalette);
  const chooseLogo = (id: string) => { setLogoPalette(id); setLogoPaletteState(id); };

  const refresh = useCallback(async () => {
    setEconomy(await tools.queryEconomy());
    setChanges(await tools.countDebugChanges());
    setFresh(await tools.freshStartInfo());
  }, []);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const run = async (work: () => Promise<string>, announce = false) => {
    setBusy(true);
    try {
      const message = await work();
      await onChange({ announce });
      await refresh();
      setStatus(message);
    } catch (error) {
      setStatus(`Falhou: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const definition = ACHIEVEMENT_DEFINITIONS.find((item) => item.id === achievementId) ?? ACHIEVEMENT_DEFINITIONS[0];
  const realLevel = economy ? levelForXp(economy.xpReal ?? economy.xp) : 1;
  const debugLevel = Boolean(economy && (economy.xpAdjust ?? 0) !== 0);

  return <article className="surface-card dbg" aria-label="Ferramentas de debug">
    <h2>Debug <span className="dbg-badge">{changes === null ? "carregando" : fresh ? "jogador novo ativo" : changes > 0 ? `${changes} alterações ativas` : "dados reais"}</span></h2>
    <p className="dbg-lede">Ferramentas para testar o app. O que elas alteram fica guardado e pode ser desfeito em “Restaurar dados reais” (o que você jogar nas cartas alteradas nesse meio-tempo também é descartado).</p>

    <section className="dbg-sec" aria-labelledby="dbg-fresh">
      <h3 id="dbg-fresh">Jogador novo</h3>
      <p>Guarda todo o seu progresso (partidas, moedas, modos liberados, cartas e conquistas) e abre o app como no primeiro acesso, para testar o começo do jogo. Tudo o que você jogar nesse meio-tempo é descartado quando você restaurar.</p>
      <p className="dbg-summary">{fresh ? `Ativo desde ${new Date(fresh.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Guardados: ${fresh.counts.sessions ?? 0} partidas, ${fresh.counts.ledger ?? 0} lançamentos de moedas, ${fresh.counts.unlocks ?? 0} liberações, ${fresh.counts.progress ?? 0} cartas e ${fresh.counts.achievements ?? 0} conquistas.` : "Desativado: você está vendo os seus dados reais."}</p>
      <div className="dbg-row">
        <button type="button" className="button ghost is-danger" disabled={busy || Boolean(fresh)} onClick={() => { if (window.confirm("Guardar todo o seu histórico e as suas moedas e abrir o app como novo? Você pode desfazer em “Restaurar dados reais”.")) void run(async () => { const counts = await tools.startAsNewPlayer(); return `Jogador novo ativo: ${counts.sessions ?? 0} partidas e ${counts.ledger ?? 0} lançamentos de moedas guardados.`; }); }}>Zerar histórico e moedas</button>
        <button type="button" className="button ghost" disabled={busy || !fresh} onClick={() => { if (window.confirm("Descartar o que você jogou como jogador novo e voltar aos dados reais?")) void run(async () => `${await tools.restoreRealData()} alterações desfeitas.`); }}>Voltar aos meus dados</button>
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-level">
      <h3 id="dbg-level">Nível do jogador</h3>
      <p className="dbg-summary">{economy ? `Nível ${economy.level} · ${economy.xp} XP` : "Carregando…"}{debugLevel && economy ? ` · nível real ${realLevel} (${economy.xpReal} XP)` : ""}</p>
      <div className="dbg-row">
        <label>Nível <input type="number" min={1} max={MAX_DEBUG_LEVEL} step={1} value={levelInput} onChange={(event) => setLevelInput(event.target.value)} /></label>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { const level = await tools.setPlayerLevel(Number(levelInput)); return `Nível definido para ${level}.`; })}>Definir nível</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { await tools.setPlayerLevel(1); return "Nível zerado (nível 1, 0 XP)."; })}>Zerar nível</button>
        <button type="button" className="button ghost" disabled={busy || !debugLevel} onClick={() => run(async () => { await tools.clearPlayerLevel(); return "Voltou ao nível real."; })}>Voltar ao nível real</button>
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-album">
      <h3 id="dbg-album">Álbum</h3>
      <p>Põe todas as cartas no nível escolhido (0 zera). O nível 5 já abre a nota histórica de cada país.</p>
      <div className="dbg-row">
        <label>Nível das cartas <select value={albumLevel} onChange={(event) => setAlbumLevel(event.target.value)}>{[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level === 0 ? "0 · zerar" : `${level} · ${RARITY_LABELS[level]}`}</option>)}</select></label>
        <label><input type="checkbox" checked={withHistorical} onChange={(event) => setWithHistorical(event.target.checked)} /> incluir históricas</label>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => {
          const ids = canonicalCurrentIds(data.meta);
          const historicalIds = withHistorical ? (await loadSpecialData()).historical.map((item) => item.id) : [];
          const total = await tools.setAlbumLevel(ids, Number(albumLevel), historicalIds);
          return `Álbum: ${total} cartas no nível ${albumLevel}.`;
        })}>Aplicar a todas</button>
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-ach">
      <h3 id="dbg-ach">Conquistas</h3>
      <p>“Desbloquear esta” mostra o aviso de nova conquista, como no jogo. “Testar animação” só mostra o aviso, sem mexer nos dados.</p>
      <div className="dbg-row">
        <label>Conquista <select value={achievementId} onChange={(event) => setAchievementId(event.target.value)}>{ACHIEVEMENT_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{item.name} · {RARITY_LABELS[item.rarity]}</option>)}</select></label>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { await tools.unlockAchievements([definition.id]); return `Desbloqueada: ${definition.name}.`; }, true)}>Desbloquear esta</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => achievementToasts.push([{ id: definition.id, name: definition.name, description: definition.description, rarity: definition.rarity }])}>Testar animação</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { const total = await tools.unlockAchievements(tools.achievementIds()); return `${total} conquistas desbloqueadas (sem aviso).`; })}>Desbloquear todas</button>
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-eco">
      <h3 id="dbg-eco">Moedas e modos</h3>
      <div className="dbg-row">
        <label>Moedas <input type="number" min={1} step={1} value={coins} onChange={(event) => setCoins(event.target.value)} /></label>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { const amount = Number(coins); await tools.grantCoins(amount); return `${amount} moedas adicionadas.`; })}>Adicionar moedas</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => run(async () => { await tools.unlockAllModes(); return "Modos e recortes liberados."; })}>Liberar modos e recortes</button>
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-logo">
      <h3 id="dbg-logo">Logo · paleta</h3>
      <p>Escolhe as cores do logo do Hub e do topo das telas. Vale só neste navegador e não entra em “Restaurar dados reais”.</p>
      <div className="dbg-logos" role="group" aria-label="Paleta do logo">
        {LOGO_PALETTES.map((palette) => <button key={palette.id} type="button" className="dbg-logo" aria-pressed={logoPalette === palette.id} onClick={() => chooseLogo(palette.id)}>
          <BrandLogo paletteId={palette.id} />
          <span>{palette.label}{palette.id === DEFAULT_LOGO_PALETTE ? " · padrão" : ""}</span>
        </button>)}
      </div>
    </section>

    <section className="dbg-sec" aria-labelledby="dbg-restore">
      <h3 id="dbg-restore">Restaurar</h3>
      <p>Desfaz jogador novo, nível, álbum, conquistas, moedas e modos alterados por aqui e volta aos dados reais do perfil.</p>
      <div className="dbg-row">
        <button type="button" className="button ghost is-danger" disabled={busy || !changes} onClick={() => { if (window.confirm("Desfazer tudo o que o debug alterou e voltar aos dados reais?")) void run(async () => `${await tools.restoreRealData()} alterações desfeitas.`); }}>Restaurar dados reais</button>
        {!import.meta.env.DEV && <button type="button" className="button ghost" disabled={busy} onClick={() => { setDebugFlag(false); location.reload(); }}>Desativar debug neste navegador</button>}
      </div>
    </section>

    {status && <span className="dbg-status" role="status">{status}</span>}
  </article>;
}
