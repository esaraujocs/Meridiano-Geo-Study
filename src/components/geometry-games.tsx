import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";
import type { Family, Legacy, RegionSelection } from "../domain/types";
import { inRegion, regionLabel } from "../domain/regions";
import { variantLabel } from "../domain/result-view";
import { ContinueBar, GameTopBar, useGameKeys, useRoundLog } from "./game-shell";
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
import { startLearningSession, type LearningSessionHandle, type SessionResult } from "../domain/learning-store";
import { createFiniteDeck, deckSeedFor, seedFromParts } from "../domain/finite-deck";
import { shuffleAnswerOptions } from "../domain/answer-options";
import { sessionSettings, type SessionOptions } from "../domain/pace";
import { entityTier } from "../domain/spoils";
import { RoundTimer } from "./round-timer";
import { AnswerReveal, cueCorrect, OptionMarks, optionClass } from "./answer-feedback";
import { useAdvance } from "./use-advance";
import { useLeaveGuard } from "./leave-guard";
import { feedbackHoldMs, feedbackSkipAfterMs } from "../domain/feedback-timing";
import { TypedAnswerInput } from "./typed-answer-input";
import { t } from "../domain/i18n";

type Props = { family: Family; variant?: string; data: Legacy; region: RegionSelection; options?: SessionOptions; onBack: () => void; onEnd?: (result: SessionResult | null) => void };
type Destination = "recorte" | "home" | "result";

type SessionRound = Parameters<LearningSessionHandle["recordRound"]>[0];
function useSession(family: Family, variant: "silhueta" | "silhueta-opcoes" | "travel", region: RegionSelection, settings: ReturnType<typeof sessionSettings>) {
  const ref = useRef<LearningSessionHandle | null>(null);
  const pending = useRef<Promise<LearningSessionHandle> | null>(null);
  const queued = useRef<SessionRound[]>([]);
  useEffect(() => {
    let alive = true;
    pending.current = startLearningSession({ family, variant, region, pace: settings.pace, roundLimit: settings.roundLimit, timerSeconds: settings.timerSeconds, coinVariant: settings.coinVariant, duel: settings.duel });
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
    async finish(): Promise<SessionResult | null> {
      const handle = ref.current ?? await pending.current?.catch(() => null);
      if (!handle) return null;
      queued.current.splice(0).forEach((round) => handle.recordRound(round));
      return handle.finish();
    },
    async abandon(): Promise<SessionResult | null> {
      const handle = ref.current ?? await pending.current?.catch(() => null);
      ref.current = null;
      if (!handle) return null;
      queued.current.splice(0).forEach((round) => handle.recordRound(round));
      return handle.end({ complete: false });
    },
  };
}

export function GeometryGame({ family, variant, data, region, options, onBack, onEnd }: Props) {
  const [runKey, setRunKey] = useState(0);
  const restart = () => setRunKey((value) => value + 1);
  return family === "silhueta"
    ? <SilhouetteGame key={runKey} data={data} region={region} variant={variant} options={options} onBack={onBack} onEnd={onEnd} onRestart={restart} />
    : <TravelGame key={runKey} data={data} region={region} options={options} onBack={onBack} onEnd={onEnd} onRestart={restart} />;
}

function SilhouetteGame({ data, region, variant, options, onBack, onEnd, onRestart }: Omit<Props, "family"> & { onRestart: () => void }) {
  const engineVariant = variant === "silhueta-opcoes" ? "silhueta-opcoes" : "silhueta";
  const settings = sessionSettings(options, engineVariant);
  const session = useSession("silhueta", engineVariant, region, settings);
  const leaveGuard = useLeaveGuard();
  const log = useRoundLog(settings.coinVariant ?? engineVariant, settings.pace);
  const leave = async (destination: Destination = "recorte") => {
    const result = await session.abandon();
    if (destination === "home") location.href = "/";
    else if (destination === "result" && result?.spoils && onEnd) onEnd(result);
    else onBack();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const [timedOutRound, setTimedOutRound] = useState(false);
  const [answerResult, setAnswerResult] = useState<"correct" | "wrong" | "">("");
  const [selectedSilhouette, setSelectedSilhouette] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [serial, setSerial] = useState(0);
  const settled = useRef(false);
  const startedAt = useRef(0);
  const flow = useAdvance();
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
  const optionsFor = (id: string) => shuffleAnswerOptions([id, ...shuffleAnswerOptions(ids.filter((item) => item !== id)).slice(0, 3)]);
  useEffect(() => {
    if (ids.length) {
       deck.current = createFiniteDeck(ids, deckSeedFor(seedFromParts("silhueta", variant ?? "silhueta", JSON.stringify(region), ids.join("|")), settings.deckSeed), settings.roundLimit);
       const first = deck.current.draw();
       if (!first) return;
       setTarget(first);
       settled.current = false;
       startedAt.current = Date.now();
       setTyped(""); setFeedback(""); setAnswerResult(""); setLocked(false); setSerial((value) => value + 1);
       if (variant === "silhueta-opcoes") setChoices(optionsFor(first));
    }
  }, [ids, variant, region]);
  // Depois do retorno da resposta: próxima silhueta ou, se o baralho acabou, o resultado da partida.
  const advance = (delay: number, skipAfter: number) => {
    flow.schedule(async () => {
      const next = deck.current?.draw();
      if (!next) {
        const result = await session.finish();
        if (onEnd) onEnd(result);
        else onBack();
        return;
      }
      setTarget(next);
      settled.current = false;
      startedAt.current = Date.now();
      setTyped(""); setFeedback(""); setAnswerResult(""); setSelectedSilhouette(""); setLocked(false); setSerial((value) => value + 1);
      if (variant === "silhueta-opcoes") setChoices(optionsFor(next));
      requestAnimationFrame(() => inputRef.current?.focus());
    }, delay, skipAfter);
  };
  // Uma resposta (digitada ou escolhida) ou o fim do tempo (timedOut) fecha a rodada.
  const resolve = (value: string, correct: boolean, timedOut = false) => {
    if (!target || locked || settled.current) return;
    settled.current = true;
    setScore((current) => current + (correct ? 1 : 0));
    setStreak((current) => correct ? current + 1 : 0);
    setLocked(true); setAnswerResult(correct ? "correct" : "wrong");
    setFeedback(correct ? t.common.correct : timedOut ? t.common.timeUp : t.common.wrong);
    setTimedOutRound(timedOut);
    leaveGuard.noteAnswer();
    log.push({ correct, tier: entityTier(data.meta, target) });
    session.recordRound({
      targetId: target, correct, responseTimeMs: Math.max(0, Date.now() - startedAt.current), answeredAt: Date.now(),
      tier: entityTier(data.meta, target),
      ...(timedOut ? { timedOut: true, ...(value ? { selectedId: value } : {}) } : { selectedId: value }),
    });
    advance(feedbackHoldMs(correct, variant !== "silhueta-opcoes"), feedbackSkipAfterMs(correct));
    if (correct) cueCorrect();
  };
  const submit = (value = typed) => {
    if (!target || locked) return;
    resolve(value, aliases(data.meta[target]).includes(normalizeName(value)));
  };
  const total = deck.current?.size ?? ids.length;
  const exit = () => leaveGuard.ask({ onLeave: () => void leave(), onRestart: () => void (async () => { flow.cancel(); await session.abandon(); onRestart(); })(), coins: log.pending, xp: total });
  useGameKeys({
    exit,
    choose: (index) => { if (variant !== "silhueta-opcoes" || locked) return; const id = choices[index]; if (id) { setSelectedSilhouette(id); resolve(id, id === target); } },
    enabled: Boolean(features && target),
  });
  const path = featurePath(features?.get(target));
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || !target) return <LoadingGeometry />;
  const typedMode = variant !== "silhueta-opcoes";
  const targetName = data.meta[target]?.pt ?? target;
  return <div className="app-shell gs-app">{leaveGuard.dialog}
    <div className="gs">
      <GameTopBar results={log.results} total={total} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel(engineVariant)} · ${regionLabel(region)}`}>
        <RoundTimer seconds={settings.timerSeconds} running={!locked && !leaveGuard.asking} resetKey={serial} onExpire={() => resolve(typedMode ? typed : "", false, true)} />
      </GameTopBar>
      <div className="gs-body">
        <main className="gs-stage">
          <div className="gs-kicker">{t.silhouette.kicker}</div>
          <div className={`silhouette-frame${answerResult === "correct" ? " is-hit" : answerResult === "wrong" ? " is-miss" : ""}`}><svg viewBox={`0 0 ${path.width} ${path.height}`} role="img" aria-label={t.silhouette.aria}><path d={path.d} /></svg>{answerResult === "correct" && <span className="sil-check" aria-hidden="true">✓</span>}</div>
          <div className={`gs-ribbon${answerResult ? ` on ${answerResult === "correct" ? "ok" : "no"}` : ""}`} role="status" aria-live="polite">
            {answerResult === "correct" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {answerResult ? feedback : ""}
            {answerResult === "wrong" && <span className="sr-only">{t.common.rightAnswerIs(targetName)}</span>}
          </div>
        </main>
        <section className="gs-tray" aria-label={t.common.answersRegion}>
          {typedMode ? <>
            <form className="gs-field" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <TypedAnswerInput key={target} className={answerResult === "correct" ? "answer-success" : answerResult === "wrong" ? "answer-error" : ""} inputRef={inputRef} aria-label={t.common.answerField} autoFocus value={typed} disabled={locked} onChange={setTyped} onCommit={submit} answers={aliases(data.meta[target])} />
              <button className="go" disabled={locked || !typed.trim()}>Responder</button>
            </form>
            {answerResult
              ? <AnswerReveal verdict={answerResult} expected={targetName} typed={typed} timedOut={timedOutRound} />
              : <div className="gs-hintline">{t.common.typingHint}</div>}
            {answerResult === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, true)} onSkip={flow.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>Enter</kbd> {t.common.keyAnswerContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </> : <>
            <div className="quiz-options gs-opts">{choices.map((id, index) => <button className={`${optionClass(id === target, id === selectedSilhouette, answerResult)} gs-opt`} disabled={locked} key={id} onClick={() => {
              if (locked) return;
              setSelectedSilhouette(id);
              resolve(id, id === target);
            }}>
              <span className="gs-key" aria-hidden="true">{index + 1}</span>
              <span className="gs-opt-label">{data.meta[id]?.pt ?? id}</span>
              <OptionMarks isTarget={id === target} isPicked={id === selectedSilhouette} verdict={answerResult} />
            </button>)}</div>
            {answerResult === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, false)} onSkip={flow.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>1</kbd>–<kbd>4</kbd> {t.common.keyChoose}</span><span><kbd>Enter</kbd> {t.common.keyContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </>}
        </section>
      </div>
    </div>
  </div>;
}

function TravelGame({ data, region, options, onBack, onEnd, onRestart }: Omit<Props, "family"> & { onRestart: () => void }) {
  const settings = sessionSettings(options, "travel");
  const session = useSession("travel", "travel", region, settings);
  const leaveGuard = useLeaveGuard();
  const log = useRoundLog("travel", settings.pace);
  const flow = useAdvance();
  const leave = async (destination: Destination = "recorte") => {
    const result = await session.abandon();
    if (destination === "home") location.href = "/";
    else if (destination === "result" && result?.spoils && onEnd) onEnd(result);
    else onBack();
  };
  const [features, setFeatures] = useState<Map<string, Feature<Geometry>> | null>(null);
  const [route, setRoute] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [feedback, setFeedbackState] = useState<{ kind: "" | "ok" | "no" | "info" | "done"; text: string }>({ kind: "", text: "" });
  const setFeedback = (kind: "" | "ok" | "no" | "info" | "done", text = "") => setFeedbackState({ kind, text });
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const overRef = useRef(false);
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
    destinationDeck.current = createFiniteDeck(destinations, undefined, settings.roundLimit);
    const destination = destinationDeck.current.draw();
    if (!destination) return;
    setRoute(solveTravelRouteToDestination(data.meta, ids, destination, seedFromParts(destination)));
    destinationStarted.current = Date.now();
  }, [destinations, ids, data, region]);
  const intermediates = route?.slice(1, -1) ?? [];
  const next = intermediates[guesses.length];
  // Depois do retorno da rota: próximo destino ou, se o baralho acabou, o resultado da partida.
  const advance = (delay: number, skipAfter: number) => {
    flow.schedule(async () => {
      const destination = destinationDeck.current?.draw();
      if (!destination) {
        const result = await session.finish();
        if (onEnd) onEnd(result);
        else onBack();
        return;
      }
      const nextRoute = solveTravelRouteToDestination(data.meta, ids, destination, seedFromParts(destination));
      if (!nextRoute) { setError(t.travel.noRoute); return; }
      setRoute(nextRoute); setGuesses([]); setAttempts(0); setHints(0); setFeedback(""); setOver(false); overRef.current = false; setRound((current) => current + 1); destinationStarted.current = Date.now();
      requestAnimationFrame(() => inputRef.current?.focus());
    }, delay, skipAfter);
  };
  // A rota acabou (fechou, estourou as tentativas ou o tempo): grava a rodada com quantos países foram acertados.
  const closeRoute = (activeRoute: string[], complete: boolean, newGuesses: string[], nextAttempts: number, value: string, timedOut = false) => {
    overRef.current = true;
    setOver(true);
    setScore((current) => current + (complete ? 1 : 0));
    setStreak((current) => complete ? current + 1 : 0);
    const destination = activeRoute[activeRoute.length - 1];
    leaveGuard.noteAnswer();
    log.push({ correct: complete, tier: entityTier(data.meta, destination), weight: newGuesses.length });
    session.recordRound({
      targetId: destination, correct: complete, responseTimeMs: Date.now() - destinationStarted.current, answeredAt: Date.now(),
      selectedId: value, attempts: nextAttempts, guesses: newGuesses,
      tier: entityTier(data.meta, destination), weight: newGuesses.length,
      ...(timedOut ? { timedOut: true } : {}),
    });
    advance(feedbackHoldMs(complete, true), feedbackSkipAfterMs(complete));
    if (complete) cueCorrect();
  };
  const submit = (value = typed) => {
    if (!route || !value.trim() || over || overRef.current) return;
    const result = evaluateTravelGuess(data.meta, intermediates, guesses, value);
    if (result.kind === "duplicate") {
      setFeedback("no", t.travel.duplicate);
      setTyped("");
      return;
    }
    const correct = result.kind === "correct";
    const newGuesses = correct ? [...guesses, result.guessedId] : guesses;
    const nextAttempts = attempts + 1;
    if (correct) setGuesses(newGuesses);
    const complete = correct && newGuesses.length === intermediates.length;
    const failed = !correct && nextAttempts >= 10;
    const routeText = route.map((id) => data.meta[id]?.pt ?? id).join(" → ");
    if (complete) setFeedback("done", t.travel.complete);
    else if (failed) setFeedback("no", t.travel.failed(routeText));
    else if (correct) setFeedback("ok", t.travel.correct);
    else setFeedback("no", t.travel.wrong);
    setAttempts(nextAttempts);
    setTyped("");
    if (complete || failed) closeRoute(route, complete, newGuesses, nextAttempts, value);
    else requestAnimationFrame(() => inputRef.current?.focus());
  };
  const timeUp = () => {
    if (!route || over || overRef.current) return;
    setFeedback("no", t.travel.timeUp(route.map((id) => data.meta[id]?.pt ?? id).join(" → ")));
    setTyped("");
    closeRoute(route, false, guesses, attempts, typed, true);
  };
  const hint = () => {
    if (hints >= 3 || !next || over) return;
    setHints((value) => value + 1);
    setFeedback("info", t.travel.hint(data.meta[next]?.pt ?? next));
  };
  const exit = () => leaveGuard.ask({ onLeave: () => void leave(), onRestart: () => void (async () => { flow.cancel(); await session.abandon(); onRestart(); })(), coins: log.pending, xp: destinationDeck.current?.size ?? destinations.length });
  useGameKeys({ exit, enabled: Boolean(route) });
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || (!route && !error)) return <LoadingGeometry />;
  const activeRoute = route;
  if (!activeRoute) return <LoadingGeometry />;
  const routeFeatures = activeRoute.map((id) => features.get(id)).filter(Boolean) as Feature<Geometry>[];
  const routePath = pathForFeatures(routeFeatures, 420, 190);
  const bad = feedback.kind === "no";
  const done = feedback.kind === "done";
  const total = destinationDeck.current?.size ?? destinations.length;
  const failedRoute = over && guesses.length < intermediates.length;
  const feedbackKind = done ? "ok" : feedback.kind;
  const nameOf = (id: string) => data.meta[id]?.pt ?? id;
  return <div className="app-shell gs-app">{leaveGuard.dialog}
    <div className="gs">
      <GameTopBar results={log.results} total={total} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel("travel")} · ${regionLabel(region)}`}>
        <RoundTimer seconds={settings.timerSeconds} running={!over && !leaveGuard.asking} resetKey={round} onExpire={timeUp} />
      </GameTopBar>
      <div className="gs-body">
        <main className="gs-stage">
          <div className="gs-kicker">{t.travel.destination} <b>{nameOf(activeRoute.at(-1)!)}</b></div>
          <div className="silhouette-frame travel-frame"><svg viewBox={`0 0 ${routePath.width} ${routePath.height}`} role="img" aria-label={t.travel.routeAria}><path d={routePath.d} /></svg></div>
          <ol className="gs-route" aria-label={t.travel.route}>
            <li className="rc start">{nameOf(activeRoute[0])}</li>
            {guesses.map((id) => <li key={id} className="rc done">{nameOf(id)}</li>)}
            {intermediates.slice(guesses.length).map((id) => failedRoute
              ? <li key={id} className="rc missed">{nameOf(id)}</li>
              : <li key={id} className="rc" aria-label={t.travel.unknown}>?</li>)}
            <li className="rc end">{nameOf(activeRoute.at(-1)!)}</li>
          </ol>
          <div className="gs-stats"><span>{t.travel.attempts} <b>{attempts}/10</b></span><span>{t.travel.hints} <b>{hints}/3</b></span></div>
          <div className={`gs-ribbon wrap${feedbackKind ? ` on ${feedbackKind}` : ""}`} role="status" aria-live="polite">{feedback.text}</div>
        </main>
        <section className="gs-tray" aria-label={t.common.answersRegion}>
          <form className="gs-field" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <TypedAnswerInput key={activeRoute.at(-1)} className={done ? "answer-success" : bad ? "answer-error" : ""} inputRef={inputRef} aria-label={t.travel.nextCountry} value={typed} disabled={over} onChange={setTyped} onCommit={submit} answers={ids.flatMap((id) => aliases(data.meta[id]))} ambiguitySafe />
            <button className="go" disabled={over || !typed.trim()}>{t.common.answer}</button>
          </form>
          <div className="gs-hintline gs-hintrow"><span>{t.travel.typeNth(guesses.length + 1)}</span><button type="button" className="gs-link" onClick={hint} disabled={hints >= 3 || over}>{t.travel.hintButton(3 - hints)}</button></div>
          {over && !done && <ContinueBar holdMs={feedbackHoldMs(false, true)} onSkip={flow.skip} />}
          <div className="gs-keys" aria-hidden="true"><span><kbd>Enter</kbd> {t.common.keyAnswer}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
        </section>
      </div>
    </div>
  </div>;
}

function LoadingGeometry() {
  return <div className="app-shell"><main className="content"><div className="eyebrow">{t.silhouette.preparing}</div><h1>{t.silhouette.loading}</h1></main></div>;
}
function GeometryError({ error, onBack }: { error: string; onBack: () => void }) {
  return <div className="app-shell"><main className="content"><button className="back" onClick={onBack}>{t.silhouette.backToRegion}</button><div className="diagnostic"><b>{t.silhouette.unavailable}</b><p>{error}</p></div></main></div>;
}
