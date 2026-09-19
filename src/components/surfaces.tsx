import { useEffect, useState } from "react";
import type { Legacy } from "../domain/types";
import { querySurfaces, type SurfaceSession } from "../domain/progress-surfaces";
import { loadFlags, flagSource, type FlagCatalog } from "../domain/quiz";
import { loadSpecialData } from "../domain/special-data";

type Props = { data: Legacy; kind: "progress" | "collection" | "achievements" | "history" | "result"; onBack: () => void };
const label = (mode: string) => (({ mapa: "Mapa", bandeira: "Bandeiras", "capital-pais": "Capitais", escr: "Escrita", silhueta: "Silhueta", travel: "Travel", bnhist: "Históricas", idioma: "Idiomas" }[mode] ?? mode) || "Sessão");
export function Surface({ data, kind, onBack }: Props) {
  const [state, setState] = useState<Awaited<ReturnType<typeof querySurfaces>> | null>(null);
  useEffect(() => { querySurfaces(data).then(setState).catch(() => setState(null)); }, [data]);
  return <main className="content surface">
    <button className="back" onClick={onBack}>← Hub</button>
    <div className="eyebrow" style={{ marginTop: 32 }}>Perfil local / {kind}</div>
    <h1 style={{ marginTop: 16 }}>{kind === "progress" ? "Progresso que explica o estudo." : kind === "collection" ? "Coleção em camadas." : kind === "achievements" ? "Conquistas de aprendizagem." : kind === "result" ? "Sessão encerrada." : "Histórico de sessões."}</h1>
    {!state ? <p className="lede">Consultando o arquivo local.</p> : kind === "progress" ? <ProgressView state={state} /> : kind === "collection" ? <CollectionView state={state} /> : kind === "achievements" ? <AchievementView state={state} /> : <HistoryView sessions={kind === "result" ? state.sessions.slice(0, 1) : state.sessions} />}
  </main>;
}
function ProgressView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  return <section className="surface-grid" aria-label="Resumo de progresso">
    <article className="surface-card"><span className="eyebrow">Cobertura</span><strong>{state.progress.discovered}/{state.progress.total}</strong><p>entidades descobertas</p></article>
    <article className="surface-card"><span className="eyebrow">Distribuição</span><strong>{state.progress.distribution.map((n, i) => `${i}:${n}`).join(" · ")}</strong><p>níveis de domínio, 0 a 5</p></article>
    <div className="surface-card surface-wide"><h2>Pilares</h2>{Object.entries(state.progress.pillars).map(([key, item]) => <div className="metric-row" key={key}><b>{key}{item.aggregate ? " · agregado" : ""}</b><span>{item.correct}/{item.seen} · {item.bayesianScore === null ? "—" : `${Math.round(item.bayesianScore * 100)}%`} · {item.status}</span></div>)}</div>
  </section>;
}
function CollectionView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [historicalFlags, setHistoricalFlags] = useState<FlagCatalog>({});
  const [region, setRegion] = useState("todas");
  const [rarity, setRarity] = useState("todas");
  const [debugMastery, setDebugMastery] = useState(3);
  const [debugHistorical, setDebugHistorical] = useState(false);
  const [debugRarity, setDebugRarity] = useState("comum");
  const [debugBusy, setDebugBusy] = useState(false);
  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); loadSpecialData().then((value) => setHistoricalFlags(value.historicalFlags)).catch(() => undefined); }, []);
  const visible = state.cards.filter((card) => (region === "todas" || card.region === region) && (rarity === "todas" || String(card.mastery) === rarity));
  const debug = import.meta.env.DEV ? <div className="collection-debug" aria-label="Ferramentas de desenvolvimento">
    <strong>DEV · preencher álbum</strong>
    <select value={debugMastery} onChange={(event) => setDebugMastery(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Nível {level}</option>)}</select>
    <select value={debugRarity} onChange={(event) => setDebugRarity(event.target.value)} aria-label="Raridade histórica"><option>comum</option><option>incomum</option><option>rara</option><option>lendária</option></select>
    <label><input type="checkbox" checked={debugHistorical} onChange={(event) => setDebugHistorical(event.target.checked)} /> histórico</label>
    <button disabled={debugBusy} onClick={async () => { setDebugBusy(true); const module = await import("../domain/debug-collection"); await module.setDebugCollectionBatch(state.cards.map((card) => card.id), debugMastery, debugHistorical, debugRarity); window.location.reload(); }}>Aplicar a todas</button>
  </div> : null;
  return <section className="surface-grid" aria-label="Álbum de coleção">
    <div className="surface-card surface-wide"><h2>Cartas atuais <small>({state.progress.discovered}/{state.progress.total})</small></h2>
      <div className="collection-filters"><label>Região <select value={region} onChange={(event) => setRegion(event.target.value)}><option value="todas">Todas</option>{Array.from(new Set(state.cards.map((card) => card.region).filter(Boolean))).sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Raridade <select value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="todas">Todas</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Nível {level}</option>)}</select></label></div>
      <div className="collection-grid">{visible.map((card) => { const discovered = card.mastery > 0; const source = card.flag ? flags[card.flag.toLowerCase()] : undefined; return <article className={`collection-card rarity-${card.mastery} ${discovered ? "is-discovered" : "is-locked"}`} key={card.id}>{discovered && source ? <img className="collection-flag" src={flagSource(source)} alt={`Bandeira de ${card.name}`} /> : <div className="collection-placeholder" aria-label="Carta ainda não descoberta">?</div>}<span className="eyebrow">{discovered ? `nível ${card.mastery}` : "não descoberta"}</span>{discovered && <><h3>{card.name}</h3>{card.fields.map(([key, value]) => <p key={key}><b>{key}</b> {value}</p>)}</>}</article>; })}</div>{debug}</div>
    <div className="surface-card surface-wide"><h2>Acervo histórico</h2>{state.historical.length ? state.historical.map((record: any, index: number) => { const id = String(record.value?.fl ?? record.value?.cca2 ?? record.entityId ?? record.id ?? ""); const source = historicalFlags[id.toLowerCase()]; const name = record.value?.pt ?? record.value?.name ?? record.label ?? record.name ?? record.entityId ?? "registro preservado"; return <article className="historical-card" key={record.id ?? index}>{source && <img className="collection-flag" src={flagSource(source)} alt="" />}<p><b>{name}</b> · {record.source ?? "legado"}</p></article>; }) : <p>Nenhum registro histórico preservado.</p>}</div>
  </section>;
}
function AchievementView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  return <section className="surface-grid" aria-label="Conquistas">{state.achievements.map((item) => <article className={`surface-card achievement ${item.unlocked ? "is-unlocked" : ""}`} key={item.id}><span aria-hidden="true">{item.unlocked ? "●" : "○"}</span><h2>{item.name}</h2><p>{item.description}</p><strong>{item.unlocked ? "desbloqueada" : "em progresso"}</strong></article>)}</section>;
}
function HistoryView({ sessions }: { sessions: SurfaceSession[] }) {
  return <section className="surface-card surface-wide"><h2>Últimas sessões</h2>{sessions.length ? <div className="history-list">{sessions.map((session) => <article className="history-row" key={session.id}><div><b>{label(session.mode)}</b><span>{session.region || "mundo"} · {session.complete ? "encerrada" : "abandonada"}</span></div><strong>{session.correct}/{session.rounds.length || "—"}</strong><small>{session.accuracy === null ? "sem respostas" : `${Math.round(session.accuracy * 100)}%`}{session.averageTime ? ` · ${Math.round(session.averageTime)} ms` : ""}</small></article>)}</div> : <p className="lede">Nenhuma sessão registrada ainda.</p>}</section>;
}