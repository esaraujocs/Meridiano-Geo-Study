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
  solveTravelRouteToDestination,
  travelDestinationIds,
} from "../domain/legacy-geometry";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";
import { createFiniteDeck, seedFromParts, shuffleSeeded } from "../domain/finite-deck";
import { TypedAnswerInput } from "./typed-answer-input";

type Props = { family: Family; variant?: string; data: Legacy; region: Region; onBack: () => void; onEnd?: () => void };

type SessionRound = Parameters<LearningSessionHandle["recordRound"]>[0];
function useSession(family: Family, variant: "silhueta" | "silhueta-opcoes" | "travel", region: Region) {
  const ref = useRef<LearningSessionHandle | null>(null);
  const pending = useRef<Promise<LearningSessionHandle> | null>(null);
  const queued = useRef<SessionRound[]>([]);
  useEffect(() => {
    let alive = true;
    pending.current = startLearningSession({ family, variant, region });
    pending.current.then((handle) => {
      if (alive) {
        ref.current = handle;
        queued.current.splice(0).forEach((round) => handle.recordRound(round));
      }
      else void handle.end();
    }).catch((error) => console.error("[carta-cega] geometry session failed", error));
    return () => {
      alive = false;
      const handle = ref.current;
      ref.current = null;
      if (handle) void handle.end();
    };
  }, [family, variant, region]);
  return {
    current: ref,
    recordRound(round: SessionRound) {
      if (ref.current) ref.current.recordRound(round);
      else queued.current.push(round);
    },
    async finish() {
      const handle = ref.current ?? await pending.current?.catch(() => null);
      if (handle) {
        queued.current.splice(0).forEach((round) => handle.recordRound(round));
        await handle.finish();
      }
    },
    async abandon() {
      const handle = ref.current ?? await pending.current?.catch(() => null);
      ref.current = null;
      if (handle) {
        queued.current.splice(0).forEach((round) => handle.recordRound(round));
        await handle.end({ complete: false });
      }
    },
  };
}

export function GeometryGame({ family, variant, data, region, onBack, onEnd }: Props) {
  return family === "silhueta"
    ? <SilhouetteGame data={data} region={region} variant={variant} onBack={onBack} onEnd={onEnd} />
    : <TravelGame data={data} region={region} onBack={onBack} onEnd={onEnd} />;
}

function SilhouetteGame({ data, region, variant, onBack, onEnd }: Omit<Props, "family">) {
  const session = useSession("silhueta", variant === "silhueta-opcoes" ? "silhueta-opcoes" : "silhueta", region);
  const leave = async (home = false) => {
    await session.abandon();
    if (home) location.href = "/";
    else onBack();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answerResult, setAnswerResult] = useState<"correct" | "wrong" | "">("");
  const [selectedSilhouette, setSelectedSilhouette] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const deck = useRef<ReturnType<typeof createFiniteDeck<string>> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    geometryIndex().then(({ features }) => setFeatures(features)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const ids = useMemo(() => features ? [...features.keys()].filter((id) => {
    const meta = data.meta[id];
    return meta && !meta.absorvido && meta.mapa !== false && inRegion(id, region, data);
  }) : [], [features, data, region]);
  useEffect(() => {
    if (ids.length) {
       deck.current = createFiniteDeck(ids, seedFromParts("silhueta", variant ?? "silhueta", region, ids.join("|")) ^ Math.floor(Math.random() * 0x100000000));
       const first = deck.current.draw();
       if (!first) return;
       setTarget(first);
       setTyped(""); setFeedback(""); setAnswerResult(""); setLocked(false);
       if (variant === "silhueta-opcoes") setChoices(shuffleSeeded([first, ...shuffleSeeded(ids.filter((id) => id !== first), seedFromParts(first)).slice(0, 3)], seedFromParts(first)));
    }
  }, [ids, variant, region]);
  const submit = (value = typed) => {
    if (!target || locked) return;
    const correct = aliases(data.meta[target]).includes(normalizeName(value));
    setScore((current) => current + (correct ? 1 : 0));
    setStreak((current) => correct ? current + 1 : 0);
    setLocked(true); setAnswerResult(correct ? "correct" : "wrong");
    setFeedback(correct ? "Acerto. A silhueta foi reconhecida." : `Ainda não. A resposta correta é ${data.meta[target]?.pt ?? target}.`);
    session.recordRound({ targetId: target, correct, responseTimeMs: null, answeredAt: Date.now(), selectedId: value });
    timer.current = window.setTimeout(async () => {
      const next = deck.current?.draw();
      if (!next) {
        await session.finish();
        (onEnd ?? onBack)();
        return;
      }
      setTarget(next);
      setTyped(""); setFeedback(""); setLocked(false);
      if (variant === "silhueta-opcoes") setChoices(shuffleSeeded([next, ...shuffleSeeded(ids.filter((id) => id !== next), seedFromParts(next)).slice(0, 3)], seedFromParts(next)));
      requestAnimationFrame(() => inputRef.current?.focus());
    }, correct ? 650 : 1400);
  };
  const path = featurePath(features?.get(target));
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || !target) return <LoadingGeometry />;
  return <div className="app-shell"><div className="quiz-stage">
     <aside className="quiz-panel"><button className="back" onClick={() => void leave()}>← Encerrar sessão</button>
      <div className="eyebrow">Silhueta</div>
       <div className="score-box"><div><span>progresso</span><b>{ids.length - (deck.current?.remaining ?? ids.length)}/{ids.length}</b></div><div><span>acertos</span><b>{score}</b></div><div><span>sequência</span><b>{streak}</b></div></div>
        <details className="hud-overflow"><summary aria-label="Mais ações">⋯</summary><div><button type="button" onClick={() => void leave()}>Voltar ao recorte</button><button type="button" onClick={() => void leave(true)}>Início</button></div></details>
    </aside>
    <main className="quiz-main geometry-main">
      <div className="silhouette-frame"><svg viewBox={`0 0 ${path.width} ${path.height}`} role="img" aria-label="Silhueta geográfica"><path d={path.d} /></svg></div>
       <div className={`feedback ${answerResult === "correct" ? "feedback-success" : answerResult === "wrong" ? "feedback-error" : ""}`} aria-live="polite">{feedback || "Que país tem esta forma?"}</div>
       {variant === "silhueta-opcoes" ? <div className="quiz-options">{choices.map((id) => <button className={`quiz-option ${answerResult === "correct" && id === target ? "correct" : ""} ${answerResult === "wrong" && id === target ? "correct" : ""} ${answerResult === "wrong" && id === selectedSilhouette ? "wrong" : ""}`} disabled={locked} key={id} onClick={() => {
           if (locked) return;
         const correct = id === target;
          setScore((current) => current + (correct ? 1 : 0));
          setStreak((current) => correct ? current + 1 : 0);
         setSelectedSilhouette(id);
          setLocked(true); setAnswerResult(correct ? "correct" : "wrong"); setFeedback(correct ? "Acerto. A silhueta foi reconhecida." : `Ainda não. A resposta correta é ${data.meta[target]?.pt ?? target}.`);
         session.recordRound({ targetId: target, correct, responseTimeMs: null, answeredAt: Date.now(), selectedId: id });
         timer.current = window.setTimeout(async () => {
           const next = deck.current?.draw();
           if (!next) { await session.finish(); (onEnd ?? onBack)(); return; }
           setTarget(next); setChoices(shuffleSeeded([next, ...shuffleSeeded(ids.filter((item) => item !== next), seedFromParts(next)).slice(0, 3)], seedFromParts(next))); setLocked(false); setFeedback(""); setAnswerResult("");
         }, correct ? 350 : 1400);
       }}>{data.meta[id]?.pt ?? id}{feedback && id === target ? " ✓" : ""}</button>)}</div> : <form className="quiz-options geometry-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
         <TypedAnswerInput key={target} inputRef={inputRef} aria-label="Resposta" autoFocus value={typed} disabled={locked} onChange={setTyped} onCommit={submit} answers={aliases(data.meta[target])} />
         <button className="button" disabled={locked || !typed.trim()}>Responder</button>
       </form>}
    </main>
  </div></div>;
}

function TravelGame({ data, region, onBack, onEnd }: Omit<Props, "family">) {
  const session = useSession("travel", "travel", region);
  const leave = async (home = false) => {
    await session.abandon();
    if (home) location.href = "/";
    else onBack();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [route, setRoute] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const destinationDeck = useRef<ReturnType<typeof createFiniteDeck<string>> | null>(null);
  const destinationStarted = useRef(0);
  useEffect(() => {
    geometryIndex().then(({ features }) => setFeatures(features)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const ids = useMemo(() => features ? [...features.keys()].filter((id) => data.meta[id] && inRegion(id, region, data)) : [], [features, data, region]);
  const destinations = useMemo(() => travelDestinationIds(data.meta, ids), [data, ids]);
  useEffect(() => {
    if (!destinations.length || destinationDeck.current) return;
    destinationDeck.current = createFiniteDeck(destinations);
    const destination = destinationDeck.current.draw();
    if (!destination) return;
    setRoute(solveTravelRouteToDestination(data.meta, ids, destination, seedFromParts(destination)));
    destinationStarted.current = Date.now();
  }, [destinations, ids, data, region]);
  const intermediates = route?.slice(1, -1) ?? [];
  const next = intermediates[guesses.length];
  const submit = (value = typed) => {
    if (!route || !value.trim() || feedback.startsWith("Rota concluída") || feedback.startsWith("Tentativas esgotadas")) return;
    const result = evaluateTravelGuess(data.meta, intermediates, guesses, value);
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
    setTyped("");
    if (complete || failed) {
      setScore((current) => current + (complete ? 1 : 0));
      setStreak((current) => complete ? current + 1 : 0);
      session.recordRound({ targetId: route[route.length - 1], correct: complete, responseTimeMs: Date.now() - destinationStarted.current, answeredAt: Date.now(), selectedId: value, attempts: nextAttempts, guesses: newGuesses });
      window.setTimeout(async () => {
        const destination = destinationDeck.current?.draw();
        if (!destination) {
          await session.finish();
          (onEnd ?? onBack)();
          return;
        }
        const nextRoute = solveTravelRouteToDestination(data.meta, ids, destination, seedFromParts(destination));
        if (!nextRoute) { setError("Não há rota jogável para o próximo destino."); return; }
        setRoute(nextRoute); setGuesses([]); setAttempts(0); setHints(0); setFeedback(""); setRound((current) => current + 1); destinationStarted.current = Date.now();
        requestAnimationFrame(() => inputRef.current?.focus());
      }, complete ? 350 : 1400);
    } else requestAnimationFrame(() => inputRef.current?.focus());
  };
  const hint = () => {
    if (hints >= 3 || !next) return;
    setHints((value) => value + 1);
    setFeedback(`Pista: o próximo país é ${data.meta[next]?.pt ?? next}.`);
  };
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || (!route && !error)) return <LoadingGeometry />;
  const activeRoute = route;
  if (!activeRoute) return <LoadingGeometry />;
  const routeFeatures = activeRoute.map((id) => features.get(id)).filter(Boolean) as Feature<Geometry>[];
  const routePath = pathForFeatures(routeFeatures, 420, 190);
  return <div className="app-shell"><div className="quiz-stage">
      <aside className="quiz-panel"><button className="back" onClick={() => void leave()}>← Encerrar sessão</button>
      <div className="eyebrow">Travel</div>
      <div className="score-box"><div><span>progresso</span><b>{round}/{destinations.length}</b></div><div><span>acertos</span><b>{score}</b></div><div><span>sequência</span><b>{streak}</b></div></div>
       <details className="hud-overflow"><summary aria-label="Mais ações">⋯</summary><div><button type="button" onClick={() => void leave()}>Voltar ao recorte</button><button type="button" onClick={() => void leave(true)}>Início</button></div></details>
    </aside>
    <main className="quiz-main geometry-main">
      <div className="travel-destination">Destino: <strong>{data.meta[activeRoute.at(-1)!]?.pt}</strong> · tentativas {attempts}/10 · pistas {hints}/3</div>
      <div className="silhouette-frame travel-frame"><svg viewBox={`0 0 ${routePath.width} ${routePath.height}`} role="img" aria-label="Geometrias da rota"><path d={routePath.d} /></svg></div>
      <div className={`feedback ${feedback.startsWith("Rota concluída") ? "feedback-success" : feedback.startsWith("Esse país") || feedback.startsWith("Tentativas") ? "feedback-error" : ""}`} aria-live="polite">{feedback || `Digite o país ${guesses.length + 1} da rota.`}</div>
      <form className="quiz-options geometry-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
         <TypedAnswerInput key={route.at(-1)} className={feedback.startsWith("Rota concluída") ? "answer-success" : feedback.startsWith("Esse país") || feedback.startsWith("Tentativas") ? "answer-error" : ""} inputRef={inputRef} aria-label="Próximo país" value={typed} onChange={setTyped} onCommit={submit} answers={ids.flatMap((id) => aliases(data.meta[id]))} ambiguitySafe />
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