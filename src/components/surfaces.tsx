import { useEffect, useState } from "react";
import type { Legacy } from "../domain/types";
import { querySurfaces, type SurfaceSession } from "../domain/progress-surfaces";
import { AchievementView } from "./achievement-view";
import { CollectionView } from "./collection-view";
import { ProgressView, type TrainFamily } from "./progress-view";
import type { EconomySnapshot } from "../domain/economy-store";
import type { Region } from "../domain/types";
import { t } from "../domain/i18n";

type Props = {
  data: Legacy;
  kind: "progress" | "collection" | "achievements" | "history" | "result";
  onBack: () => void;
  economy: EconomySnapshot;
  onTrain: (family: TrainFamily) => void;
  onOpenCollection: (region: Region) => void;
  collectionRegion?: Region;
};
const label = (mode: string) => (t.sessions.legacyModes[mode] ?? mode) || t.sessions.session;
export function Surface({ data, kind, onBack, economy, onTrain, onOpenCollection, collectionRegion }: Props) {
  const [state, setState] = useState<Awaited<ReturnType<typeof querySurfaces>> | null>(null);
  useEffect(() => { querySurfaces(data).then(setState).catch(() => setState(null)); }, [data]);
  return <main className="content surface" data-surface={kind}>
    <button className="back" onClick={onBack}>{t.common.backHub}</button>
    {kind !== "achievements" && kind !== "collection" && kind !== "progress" && <>
      <div className="eyebrow" style={{ marginTop: 32 }}>{t.sessions.localProfile(kind)}</div>
       <h1 style={{ marginTop: 16 }}>{kind === "result" ? t.sessions.sessionClosed : t.sessions.sessionHistory}</h1>
    </>}
    {!state ? <p className="lede">{t.sessions.consulting}</p> : kind === "progress" ? <ProgressView state={state} data={data} economy={economy} onTrain={onTrain} onOpenCollection={onOpenCollection} onGoHub={onBack} /> : kind === "collection" ? <CollectionView state={state} meta={data.meta} names={data.names3} initialRegion={collectionRegion} /> : kind === "achievements" ? <AchievementView achievements={state.achievements} /> : <HistoryView sessions={kind === "result" ? state.sessions.slice(0, 1) : state.sessions} />}
  </main>;
}
function HistoryView({ sessions }: { sessions: SurfaceSession[] }) {
  return <section className="surface-card surface-wide"><h2>{t.sessions.lastSessions}</h2>{sessions.length ? <div className="history-list">{sessions.map((session) => <article className="history-row" key={session.id}><div><b>{label(session.mode)}</b><span>{(session.regions?.length ? session.regions : [session.region || "mundo"]).join(" + ")} · {session.complete ? t.sessions.closed : t.sessions.abandoned}</span></div><strong>{session.correct}/{session.rounds.length || "—"}</strong><small>{session.accuracy === null ? t.sessions.noAnswers : `${Math.round(session.accuracy * 100)}%`}{session.averageTime ? ` · ${Math.round(session.averageTime)} ms` : ""}</small></article>)}</div> : <p className="lede">{t.sessions.noSessions}</p>}</section>;
}