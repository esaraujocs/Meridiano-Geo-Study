import { useEffect, useState } from "react";
import type { Legacy } from "../domain/types";
import { querySurfaces, filterCollectionCards, filterHistoricalAlbum, historicalAlbum, type SurfaceSession } from "../domain/progress-surfaces";
import { ACHIEVEMENT_CATEGORIES } from "../domain/achievements";
import { loadFlags, flagSource, type FlagCatalog } from "../domain/quiz";
import { loadSpecialData, type HistoricalEntity } from "../domain/special-data";
import { REGION_ITEMS } from "../domain/regions";
import type { Region } from "../domain/types";

type Props = { data: Legacy; kind: "progress" | "collection" | "achievements" | "history" | "result"; onBack: () => void };
const label = (mode: string) => (({ mapa: "Mapa", bandeira: "Bandeiras", "capital-pais": "Capitais", escr: "Escrita", silhueta: "Silhueta", travel: "Travel", bnhist: "Históricas", idioma: "Idiomas" }[mode] ?? mode) || "Sessão");
export function Surface({ data, kind, onBack }: Props) {
  const [state, setState] = useState<Awaited<ReturnType<typeof querySurfaces>> | null>(null);
  useEffect(() => { querySurfaces(data).then(setState).catch(() => setState(null)); }, [data]);
  return <main className="content surface">
    <button className="back" onClick={onBack}>← Hub</button>
    <div className="eyebrow" style={{ marginTop: 32 }}>Perfil local / {kind}</div>
     <h1 style={{ marginTop: 16 }}>{kind === "progress" ? "Progresso que explica o estudo." : kind === "collection" ? "Coleção em camadas." : kind === "achievements" ? "Achievements de aprendizagem." : kind === "result" ? "Sessão encerrada." : "Histórico de sessões."}</h1>
    {!state ? <p className="lede">Consultando o arquivo local.</p> : kind === "progress" ? <ProgressView state={state} /> : kind === "collection" ? <CollectionView state={state} /> : kind === "achievements" ? <AchievementView state={state} /> : <HistoryView sessions={kind === "result" ? state.sessions.slice(0, 1) : state.sessions} />}
  </main>;
}
function ProgressView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  const [tab, setTab] = useState<"progress" | "history">("progress");
  return <section className="surface-grid" aria-label="Resumo de progresso">
    <div className="surface-tabs" role="tablist"><button role="tab" aria-selected={tab === "progress"} onClick={() => setTab("progress")}>Resumo</button><button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>Histórico</button></div>
    {tab === "history" ? <HistoryView sessions={state.sessions} /> : <>
    <article className="surface-card"><span className="eyebrow">Cobertura</span><strong>{state.progress.discovered}/{state.progress.total}</strong><p>entidades descobertas</p></article>
    <article className="surface-card"><span className="eyebrow">Distribuição</span><strong>{state.progress.distribution.map((n, i) => `${i}:${n}`).join(" · ")}</strong><p>níveis de domínio, 0 a 5</p></article>
    <div className="surface-card surface-wide"><h2>Pilares</h2>{Object.entries(state.progress.pillars).map(([key, item]) => <div className="metric-row" key={key}><b>{key}{item.aggregate ? " · agregado" : ""}</b><span>{item.correct}/{item.seen} · {item.bayesianScore === null ? "—" : `${Math.round(item.bayesianScore * 100)}%`} · {item.status}</span></div>)}</div>
    </>}
  </section>;
}
function CollectionView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [historicalFlags, setHistoricalFlags] = useState<FlagCatalog>({});
  const [historical, setHistorical] = useState<HistoricalEntity[]>([]);
  const [album, setAlbum] = useState<"countries" | "historical">("countries");
  const [region, setRegion] = useState("todas");
  const [rarity, setRarity] = useState("todas");
  const [collectionState, setCollectionState] = useState("todas");
  const [unOnly, setUnOnly] = useState(false);
  const [historicalType, setHistoricalType] = useState("todos");
  const [debugMastery, setDebugMastery] = useState(3);
  const [debugHistorical, setDebugHistorical] = useState(false);
  const [debugRarity, setDebugRarity] = useState("comum");
  const [debugBusy, setDebugBusy] = useState(false);
  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); loadSpecialData().then((value) => { setHistoricalFlags(value.historicalFlags); setHistorical(value.historical); }).catch(() => undefined); }, []);
  const visible = filterCollectionCards(state.cards, { region: region as Region | "todas", mastery: rarity === "todas" ? "todas" : Number(rarity), state: collectionState as "todas" | "descobertas" | "faltando", unOnly });
  const historicalCards = filterHistoricalAlbum(historicalAlbum(historical, state.historical), region as Region | "todas", historicalType);
  const debug = import.meta.env.DEV ? <div className="collection-debug" aria-label="Ferramentas de desenvolvimento">
    <strong>DEV · preencher álbum</strong>
    <select value={debugMastery} onChange={(event) => setDebugMastery(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Nível {level}</option>)}</select>
    <select value={debugRarity} onChange={(event) => setDebugRarity(event.target.value)} aria-label="Raridade histórica"><option>comum</option><option>incomum</option><option>rara</option><option>lendária</option></select>
    <label><input type="checkbox" checked={debugHistorical} onChange={(event) => setDebugHistorical(event.target.checked)} /> histórico</label>
    <button disabled={debugBusy} onClick={async () => { setDebugBusy(true); const module = await import("../domain/debug-collection"); await module.setDebugCollectionBatch(state.cards.map((card) => card.id), debugMastery, debugHistorical, debugRarity); window.location.reload(); }}>Aplicar a todas</button>
  </div> : null;
  return <section className="surface-grid" aria-label="Álbum de coleção">
    <div className="surface-card surface-wide"><div className="collection-tabs" role="tablist"><button role="tab" aria-selected={album === "countries"} onClick={() => setAlbum("countries")}>Países</button><button role="tab" aria-selected={album === "historical"} onClick={() => setAlbum("historical")}>Históricas</button></div>
      {album === "countries" ? <><h2>Países <small>({visible.filter((card) => card.mastery > 0).length}/{visible.length})</small></h2>
       <div className="collection-filters"><label>Região <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="todas">Todas</option>{REGION_ITEMS.slice(1).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Raridade <select value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="todas">Todas</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Nível {level}</option>)}</select></label><label>Estado <select value={collectionState} onChange={(event) => setCollectionState(event.target.value)}><option value="todas">Todas</option><option value="descobertas">Descobertas</option><option value="faltando">Faltando</option></select></label><label className="collection-check"><input type="checkbox" checked={unOnly} onChange={(event) => setUnOnly(event.target.checked)} /> Só membros da ONU</label></div>
       <div className="collection-grid">{visible.map((card) => { const discovered = card.mastery > 0; const source = card.flag ? flags[card.flag.toLowerCase()] : undefined; return <article className={`collection-card rarity-${card.mastery} ${discovered ? "is-discovered" : "is-locked"}`} key={card.id}>{discovered && source ? <img className="collection-flag" src={flagSource(source)} alt={`Bandeira de ${card.name}`} /> : <div className="collection-placeholder" aria-label="Carta ainda não descoberta">?</div>}<span className="eyebrow">{discovered ? `nível ${card.mastery}` : "não descoberta"}</span>{discovered && <><h3>{card.name}</h3>{card.fields.map(([key, value]) => <p key={key}><b>{key}</b> {value}</p>)}</>}</article>; })}</div>{debug}</> :
       <><h2>Históricas <small>({historicalCards.filter((card) => card.discovered).length}/{historicalCards.length})</small></h2><div className="collection-filters"><label>Região <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="todas">Todas</option>{REGION_ITEMS.slice(1).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Tipo <select value={historicalType} onChange={(event) => setHistoricalType(event.target.value)}><option value="todos">Todos</option><option value="imperio">Império</option><option value="extinto">País extinto</option><option value="movimento">Movimento</option></select></label></div><div className="historical-grid">{historicalCards.map((card) => { const source = card.flag ? historicalFlags[card.flag.toLowerCase()] : undefined; return <article className={`historical-card ${card.discovered ? "is-discovered" : "is-locked"}`} key={card.id}>{card.discovered && source ? <img className="collection-flag" src={flagSource(source)} alt={`Bandeira de ${card.name}`} /> : <div className="collection-placeholder" aria-label="Carta histórica ainda não descoberta" />}<span className="eyebrow">{card.discovered ? card.name : "não descoberta"}</span></article>; })}</div></>}
    </div>
  </section>;
}
function AchievementView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  const achievements = state.achievements.filter(item => !item.deprecated);
  const unlocked = achievements.filter(item => item.unlocked).length;
  const CategoryIcon = ({ name }: { name: string }) => <svg className="achievement-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={name === "target" ? "M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" : name === "globe" ? "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9c-2-2.4-3-5.4-3-9s1-6.6 3-9Z" : name === "brain" ? "M9 5a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 3 3h1V5H9Zm6 0a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-3 3h-1V5h1ZM8 10h2m4 0h2M8 14h2m4 0h2" : name === "trend" ? "M4 17 9 12l3 3 7-8M15 7h4v4" : name === "trophy" ? "M8 4h8v4a4 4 0 0 1-8 0V4Zm4 8v5m-4 3h8M5 6H3a3 3 0 0 0 3 3m13-3h2a3 3 0 0 1-3 3" : "M12 3 14.5 9l6.5.5-5 4.2 1.6 6.3-5.6-3.4-5.6 3.4L8 13.7 3 9.5 9.5 9 12 3Z"} /></svg>;
  return <section className="surface-grid" aria-label="Achievements"><div className="surface-card surface-wide"><h2>Achievements <small>{unlocked} de {achievements.length}</small></h2>
    {ACHIEVEMENT_CATEGORIES.map(category => {
      const items = achievements.filter(item => item.category === category.id);
      return <div className="achievement-group" key={category.id}><h3><CategoryIcon name={category.icon} />{category.label} <small>{items.filter(item => item.unlocked).length}/{items.length}</small></h3>
        <div className="achievement-grid">{items.map(item => {
          const hidden = item.hidden && !item.unlocked;
          const progress = item.unlocked ? (item.unlockedAt ? `desbloqueada em ${new Date(item.unlockedAt).toLocaleDateString("pt-BR")}` : "desbloqueada") : item.target && item.target > 1 ? `${item.current ?? 0}/${item.target}` : "em progresso";
          return <article className={`surface-card achievement rarity-${item.rarity ?? 1} ${item.unlocked ? "is-unlocked" : "is-locked"}`} key={item.id}>
            <span className="achievement-state" aria-hidden="true">{item.unlocked ? "✓" : "·"}</span><span className="eyebrow">raridade {item.rarity ?? 1}</span>
            <h4>{hidden ? "???" : item.name}</h4><p>{hidden ? "???" : item.description}</p><strong>{progress}</strong>
            {!item.unlocked && item.target && item.target > 1 && <progress value={item.current ?? 0} max={item.target} aria-label={`Progresso ${item.current ?? 0} de ${item.target}`} />}
          </article>;
        })}</div></div>;
    })}</div></section>;
}
function HistoryView({ sessions }: { sessions: SurfaceSession[] }) {
  return <section className="surface-card surface-wide"><h2>Últimas sessões</h2>{sessions.length ? <div className="history-list">{sessions.map((session) => <article className="history-row" key={session.id}><div><b>{label(session.mode)}</b><span>{(session.regions?.length ? session.regions : [session.region || "mundo"]).join(" + ")} · {session.complete ? "encerrada" : "abandonada"}</span></div><strong>{session.correct}/{session.rounds.length || "—"}</strong><small>{session.accuracy === null ? "sem respostas" : `${Math.round(session.accuracy * 100)}%`}{session.averageTime ? ` · ${Math.round(session.averageTime)} ms` : ""}</small></article>)}</div> : <p className="lede">Nenhuma sessão registrada ainda.</p>}</section>;
}