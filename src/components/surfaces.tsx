import { useEffect, useState } from "react";
import type { Legacy } from "../domain/types";
import { querySurfaces, type SurfaceSession } from "../domain/progress-surfaces";

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
  return <section className="surface-grid" aria-label="Cartas descobertas"><div className="surface-card surface-wide"><h2>Cartas atuais <small>({state.progress.discovered}/{state.progress.total})</small></h2><div className="collection-grid">{state.cards.map((card) => <article className={`collection-card rarity-${card.mastery}`} key={card.id}><span className="eyebrow">nível {card.mastery}</span><h3>{card.name}</h3>{card.fields.map(([key, value]) => <p key={key}><b>{key}</b> {value}</p>)}</article>)}</div></div><div className="surface-card surface-wide"><h2>Acervo histórico</h2>{state.historical.length ? state.historical.slice(0, 8).map((record: any, index: number) => <p key={record.id ?? index}><b>{record.label ?? record.name ?? record.entityId ?? "registro preservado"}</b> · {record.source ?? "legado"}{record.value?.name ? ` · ${record.value.name}` : ""}</p>) : <p>Nenhum registro histórico preservado.</p>}</div></section>;
}
function AchievementView({ state }: { state: Awaited<ReturnType<typeof querySurfaces>> }) {
  return <section className="surface-grid" aria-label="Conquistas">{state.achievements.map((item) => <article className={`surface-card achievement ${item.unlocked ? "is-unlocked" : ""}`} key={item.id}><span aria-hidden="true">{item.unlocked ? "●" : "○"}</span><h2>{item.name}</h2><p>{item.description}</p><strong>{item.unlocked ? "desbloqueada" : "em progresso"}</strong></article>)}</section>;
}
function HistoryView({ sessions }: { sessions: SurfaceSession[] }) {
  return <section className="surface-card surface-wide"><h2>Últimas sessões</h2>{sessions.length ? <div className="history-list">{sessions.map((session) => <article className="history-row" key={session.id}><div><b>{label(session.mode)}</b><span>{session.region || "mundo"} · {session.complete ? "encerrada" : "abandonada"}</span></div><strong>{session.correct}/{session.rounds.length || "—"}</strong><small>{session.accuracy === null ? "sem respostas" : `${Math.round(session.accuracy * 100)}%`}{session.averageTime ? ` · ${Math.round(session.averageTime)} ms` : ""}</small></article>)}</div> : <p className="lede">Nenhuma sessão registrada ainda.</p>}</section>;
}