import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";
import type { Family, Legacy, Region } from "../domain/types";
import { inRegion } from "../domain/regions";
import {
  aliases,
  evaluateTravelGuess,
  featurePath,
  geometryIndex,
  normalizeName,
  pathForFeatures,
  solveTravelRoute,
} from "../domain/legacy-geometry";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";

type Props = { family: Family; data: Legacy; region: Region; onBack: () => void; onEnd?: () => void };

function useSession(family: Family, variant: "silhueta" | "travel", region: Region) {
  const ref = useRef<LearningSessionHandle | null>(null);
  useEffect(() => {
    let alive = true;
    startLearningSession({ family, variant, region }).then((handle) => {
      if (alive) ref.current = handle;
      else void handle.end();
    }).catch((error) => console.error("[carta-cega] geometry session failed", error));
    return () => {
      alive = false;
      const handle = ref.current;
      ref.current = null;
      if (handle) void handle.end();
    };
  }, [family, variant, region]);
  return ref;
}

export function GeometryGame({ family, data, region, onBack, onEnd }: Props) {
  return family === "silhueta"
    ? <SilhouetteGame data={data} region={region} onBack={onBack} onEnd={onEnd} />
    : <TravelGame data={data} region={region} onBack={onBack} onEnd={onEnd} />;
}

function SilhouetteGame({ data, region, onBack, onEnd }: Omit<Props, "family">) {
  const session = useSession("silhueta", "silhueta", region);
  const finish = async () => {
    await session.current?.finish();
    (onEnd ?? onBack)();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    geometryIndex().then(({ features }) => setFeatures(features)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const ids = useMemo(() => features ? [...features.keys()].filter((id) => {
    const meta = data.meta[id];
    return meta && !meta.absorvido && meta.mapa !== false && inRegion(id, region, data);
  }) : [], [features, data, region]);
  useEffect(() => {
    if (ids.length && !ids.includes(target)) {
      setTarget(ids[Math.floor(Math.random() * ids.length)]);
      setTyped(""); setFeedback(""); setLocked(false);
    }
  }, [ids, target]);
  const submit = () => {
    if (!target || locked) return;
    const correct = aliases(data.meta[target]).includes(normalizeName(typed));
    setLocked(true);
    setFeedback(correct ? "Acerto. A silhueta foi reconhecida." : `Ainda não. A resposta correta é ${data.meta[target]?.pt ?? target}.`);
    session.current?.recordRound({ targetId: target, correct, responseTimeMs: null, answeredAt: Date.now(), selectedId: typed });
    window.setTimeout(() => {
      const next = ids.filter((id) => id !== target);
      setTarget(next[Math.floor(Math.random() * Math.max(next.length, 1))] ?? target);
      setTyped(""); setFeedback(""); setLocked(false);
    }, correct ? 650 : 1400);
  };
  const path = featurePath(features?.get(target));
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || !target) return <LoadingGeometry />;
  return <div className="app-shell"><div className="quiz-stage">
     <aside className="quiz-panel"><button className="back" onClick={() => void finish()}>← Encerrar sessão</button>
      <div className="eyebrow" style={{ marginTop: 28 }}>Sessão · Silhueta</div><h1>Reconheça o contorno.</h1>
      <p className="lede">Digite o país sem pistas de texto.</p>
    </aside>
    <main className="quiz-main geometry-main">
      <div className="silhouette-frame"><svg viewBox={`0 0 ${path.width} ${path.height}`} role="img" aria-label="Silhueta geográfica"><path d={path.d} /></svg></div>
      <div className="feedback" aria-live="polite">{feedback || "Que país tem esta forma?"}</div>
      <form className="quiz-options geometry-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input aria-label="Resposta" autoFocus value={typed} disabled={locked} onChange={(e) => setTyped(e.target.value)} />
        <button className="button" disabled={locked || !typed.trim()}>Responder</button>
      </form>
    </main>
  </div></div>;
}

function TravelGame({ data, region, onBack, onEnd }: Omit<Props, "family">) {
  const session = useSession("travel", "travel", region);
  const finish = async () => {
    await session.current?.finish();
    (onEnd ?? onBack)();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [route, setRoute] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    geometryIndex().then(({ features }) => setFeatures(features)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const ids = useMemo(() => features ? [...features.keys()].filter((id) => data.meta[id] && inRegion(id, region, data)) : [], [features, data, region]);
  useEffect(() => {
    if (ids.length && !route) setRoute(solveTravelRoute(data.meta, ids, Math.floor(Math.random() * ids.length)));
  }, [ids, route, data]);
  const intermediates = route?.slice(1, -1) ?? [];
  const next = intermediates[guesses.length];
  const submit = () => {
    if (!route || !typed.trim() || feedback.startsWith("Rota concluída") || feedback.startsWith("Tentativas esgotadas")) return;
    const result = evaluateTravelGuess(data.meta, intermediates, guesses, typed);
    if (result.kind === "duplicate") {
      setFeedback("Esse país já foi usado; tente o próximo da rota.");
      setTyped("");
      return;
    }
    const correct = result.kind === "correct";
    const newGuesses = correct ? [...guesses, result.guessedId] : guesses;
    const nextAttempts = attempts + 1;
    if (correct) setGuesses(newGuesses);
    const complete = correct && newGuesses.length === intermediates.length;
    const failed = !correct && nextAttempts >= 10;
    setFeedback(complete ? "Rota concluída. Excelente navegação." : failed ? `Tentativas esgotadas. Rota: ${route.map((id) => data.meta[id]?.pt ?? id).join(" → ")}` : correct ? "Trecho correto. Continue a rota." : "Esse país não é o próximo trecho.");
    setAttempts(nextAttempts);
    session.current?.recordRound({ targetId: route[route.length - 1], correct: complete, responseTimeMs: null, answeredAt: Date.now(), selectedId: typed, attempts: nextAttempts, guesses: newGuesses });
    setTyped("");
  };
  const hint = () => {
    if (hints >= 3 || !next) return;
    setHints((value) => value + 1);
    setFeedback(`Pista: o próximo país é ${data.meta[next]?.pt ?? next}.`);
  };
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || !route) return <LoadingGeometry />;
  const routeFeatures = route.map((id) => features.get(id)).filter(Boolean) as Feature<Geometry>[];
  const routePath = pathForFeatures(routeFeatures, 420, 190);
  return <div className="app-shell"><div className="quiz-stage">
      <aside className="quiz-panel"><button className="back" onClick={() => void finish()}>← Encerrar sessão</button>
      <div className="eyebrow" style={{ marginTop: 28 }}>Sessão · Travel</div><h1>Trace a rota.</h1>
      <p className="lede">Saia de <b>{data.meta[route[0]]?.pt}</b> e chegue ao destino.</p>
      <div className="score-box"><div><span>tentativas</span><b>{attempts}/10</b></div><div><span>pistas</span><b>{hints}/3</b></div></div>
    </aside>
    <main className="quiz-main geometry-main">
      <div className="travel-destination">Destino: <strong>{data.meta[route.at(-1)!]?.pt}</strong></div>
      <div className="silhouette-frame travel-frame"><svg viewBox={`0 0 ${routePath.width} ${routePath.height}`} role="img" aria-label="Geometrias da rota"><path d={routePath.d} /></svg></div>
      <div className="feedback" aria-live="polite">{feedback || `Digite o país ${guesses.length + 1} da rota.`}</div>
      <form className="quiz-options geometry-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input aria-label="Próximo país" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="geometry-actions"><button className="button" disabled={!typed.trim()}>Responder</button><button type="button" className="button ghost" onClick={hint} disabled={hints >= 3}>Pista</button></div>
      </form>
    </main>
  </div></div>;
}

function LoadingGeometry() {
  return <div className="app-shell"><main className="content"><div className="eyebrow">Preparando geometria</div><h1>Carregando o contorno.</h1></main></div>;
}
function GeometryError({ error, onBack }: { error: string; onBack: () => void }) {
  return <div className="app-shell"><main className="content"><button className="back" onClick={onBack}>← Escolher recorte</button><div className="diagnostic"><b>Geometria indisponível</b><p>{error}</p></div></main></div>;
}