import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Feature, Geometry } from "geojson";
import type { AnyQuizVariant, Family, Legacy, RegionSelection } from "../domain/types";
import { inRegion, regionLabel } from "../domain/regions";
import { inSilhouetteDeck } from "../domain/silhouette";
import { variantLabel } from "../domain/result-view";
import { ContinueBar, GameTopBar, NeighborChip, SupplyTray, useGameKeys, useRoundLog } from "./game-shell";
import { useSupplies } from "./use-supplies";
import { emptySupplyCounts, letterHint, lupaToHide, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { aliases, featurePath, normalizeName, silhouetteIndex } from "../domain/legacy-geometry";
import { guessAllowed, readTravelLevel, travelBand, wrongSide, travelBoxes, bestRoute, gradeGuess, linkedToStart, remainingRoute, routeClosed, travelDestinations, travelFeatureIds, travelGraph, travelPool, travelPuzzle, travelWeight, type TravelGrade, type TravelPuzzle } from "../domain/travel";
import { TravelMap, travelPoints, type TravelPaint } from "./travel-map";
import { startLearningSession, type LearningSessionHandle, type SessionResult } from "../domain/learning-store";
import { createFiniteDeck, deckSeedFor, seedFromParts } from "../domain/finite-deck";
import { shuffleAnswerOptions } from "../domain/answer-options";
import { focusPool, sessionSettings, type SessionOptions } from "../domain/pace";
import { entityTier } from "../domain/spoils";
import { RoundTimer } from "./round-timer";
import { AnswerReveal, cueCorrect, OptionMarks, optionClass } from "./answer-feedback";
import { useAdvance } from "./use-advance";
import { useLeaveGuard } from "./leave-guard";
import { feedbackHoldMs, feedbackSkipAfterMs } from "../domain/feedback-timing";
import { TypedAnswerInput } from "./typed-answer-input";
import { answerKey } from "../domain/typed-answer";
import { t } from "../domain/i18n";
import { isCountry } from "../domain/sovereignty";
import { baseVariant, divisionCountry, divisionCountryOf, unitWord } from "../domain/divisions";
import { loadDivisionShapes } from "../domain/divisions-data";

type Props = { family: Family; variant?: string; data: Legacy; region: RegionSelection; options?: SessionOptions; onBack: () => void; onEnd?: (result: SessionResult | null) => void; supplies?: SupplyCounts };
type Destination = "recorte" | "home" | "result";

type SessionRound = Parameters<LearningSessionHandle["recordRound"]>[0];
function useSession(family: Family, variant: AnyQuizVariant, region: RegionSelection, settings: ReturnType<typeof sessionSettings>) {
  const ref = useRef<LearningSessionHandle | null>(null);
  const pending = useRef<Promise<LearningSessionHandle> | null>(null);
  const queued = useRef<SessionRound[]>([]);
  useEffect(() => {
    let alive = true;
    // as unidades de Estados e províncias não são cartas da coleção
    pending.current = startLearningSession({ family, variant, region, pace: settings.pace, roundLimit: settings.roundLimit, timerSeconds: settings.timerSeconds, coinVariant: settings.coinVariant, duel: settings.duel, onRound: settings.onRound, coinFactor: settings.coinFactor, ...(family === "divisoes" || family === "epocas" ? { persistProgress: false } : {}) });
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

export function GeometryGame({ family, variant, data, region, options, onBack, onEnd, supplies }: Props) {
  const [runKey, setRunKey] = useState(0);
  const restart = () => setRunKey((value) => value + 1);
  return family === "silhueta" || family === "divisoes" || family === "epocas"
    ? <SilhouetteGame key={runKey} data={data} region={region} variant={variant} options={options} onBack={onBack} onEnd={onEnd} onRestart={restart} supplies={supplies} country={family === "divisoes" || family === "epocas" ? divisionCountryOf(region) : null} engineFamily={family} />
    : <TravelGame key={runKey} data={data} region={region} options={options} onBack={onBack} onEnd={onEnd} onRestart={restart} supplies={supplies} />;
}

function SilhouetteGame({ data, region, variant, options, onBack, onEnd, onRestart, supplies = emptySupplyCounts(), country = null, engineFamily }: Omit<Props, "family"> & { onRestart: () => void; country?: string | null; engineFamily?: Props["family"] }) {
  // a regra (alternativas ou escrita); em Estados e províncias a sessão grava a variante do modo, com os contornos das unidades do país
  const engineVariant = baseVariant((variant ?? "silhueta") as AnyQuizVariant) === "silhueta-opcoes" ? "silhueta-opcoes" : "silhueta";
  const sessionVariant = (country ? variant : engineVariant) as AnyQuizVariant;
  const settings = sessionSettings(options, engineVariant);
  const session = useSession(country ? (engineFamily === "epocas" ? "epocas" : "divisoes") : "silhueta", sessionVariant, region, settings);
  const leaveGuard = useLeaveGuard(settings.pvp ? "pvp" : Boolean(settings.duel));
  const log = useRoundLog(settings.coinVariant ?? sessionVariant, settings.pace);
  // Suprimentos de expedição só em Partida solo (nunca Treino/duelo/PvP, ver domain/supplies.ts). Lupa só na Silhueta · alternativas.
  const suppliesEnabled = !settings.duel && !settings.pvp;
  const supply = useSupplies(supplies, suppliesEnabled);
  const [lupaHidden, setLupaHidden] = useState<Set<string>>(new Set());
  // Segunda chance: alternativas já tentadas (e erradas) / aviso de "tente de novo" na digitação; Escudo: o erro desta rodada foi coberto.
  const [triedWrong, setTriedWrong] = useState<ReadonlySet<string>>(new Set());
  const [retryNotice, setRetryNotice] = useState(false);
  const [shieldSaved, setShieldSaved] = useState(false);
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
    (country ? loadDivisionShapes(country) : silhouetteIndex()).then(setFeatures).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  // as unidades de um país entram todas
  const ids = useMemo(() => features ? [...features.keys()].filter((id) => {
    return (country ? Boolean(data.meta[id]) : inSilhouetteDeck(data.meta[id])) && inRegion(id, region, data);
  }) : [], [features, data, region]);
  const optionsFor = (id: string) => shuffleAnswerOptions([id, ...shuffleAnswerOptions(ids.filter((item) => item !== id)).slice(0, 3)]);
  useEffect(() => {
    if (ids.length) {
       deck.current = createFiniteDeck(focusPool(ids, (id) => id, settings.focusIds), deckSeedFor(seedFromParts("silhueta", variant ?? "silhueta", JSON.stringify(region), ids.join("|")), settings.deckSeed), settings.roundLimit);
       const first = deck.current.draw();
       if (!first) return;
       setTarget(first);
       settled.current = false;
       startedAt.current = Date.now();
       setTyped(""); setFeedback(""); setAnswerResult(""); setLocked(false); setSerial((value) => value + 1);
       if (engineVariant === "silhueta-opcoes") setChoices(optionsFor(first));
       setLupaHidden(new Set());
       setTriedWrong(new Set()); setRetryNotice(false); setShieldSaved(false);
       supply.resetRound();
    }
  }, [ids, variant, region]);
  // Depois do retorno da resposta: próxima silhueta ou, se o baralho acabou, o resultado da partida.
  const showTarget = (next: string) => {
    setTarget(next);
    settled.current = false;
    startedAt.current = Date.now();
    setTyped(""); setFeedback(""); setAnswerResult(""); setSelectedSilhouette(""); setLocked(false); setSerial((value) => value + 1);
    if (engineVariant === "silhueta-opcoes") setChoices(optionsFor(next));
    setLupaHidden(new Set());
    setTriedWrong(new Set()); setRetryNotice(false); setShieldSaved(false);
    supply.resetRound();
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const advance = (delay: number, skipAfter: number) => {
    flow.schedule(async () => {
      const next = deck.current?.draw();
      if (!next) {
        const result = await session.finish();
        if (onEnd) onEnd(result);
        else onBack();
        return;
      }
      showTarget(next);
    }, delay, skipAfter);
  };
  // Uma resposta (digitada ou escolhida) ou o fim do tempo (timedOut) fecha a rodada.
  const resolve = (value: string, correct: boolean, timedOut = false, gaveUp = false) => {
    if (!target || locked || settled.current) return;
    // Segunda chance: errou respondendo (o tempo acabar e o "não sei" não valem): a rodada segue aberta. Nas alternativas a errada fica marcada; na digitação o campo limpa.
    if (!correct && !timedOut && !gaveUp && supply.consumeArmed("retorno")) {
      if (engineVariant === "silhueta-opcoes") { setTriedWrong((current) => new Set(current).add(value)); setSelectedSilhouette(""); }
      else { setTyped(""); requestAnimationFrame(() => inputRef.current?.focus()); }
      setRetryNotice(true);
      return;
    }
    // Escudo: o erro não quebra a sequência nem pesa na partida (a rodada fica de fora da conta, ver spoils.ts).
    const shielded = !correct && supply.consumeArmed("escudo");
    setShieldSaved(shielded); setRetryNotice(false);
    settled.current = true;
    setScore((current) => current + (correct ? 1 : 0));
    setStreak((current) => correct ? current + 1 : shielded ? current : 0);
    setLocked(true); setAnswerResult(correct ? "correct" : "wrong");
    setFeedback(correct ? t.common.correct : timedOut ? t.common.timeUp : t.common.wrong);
    setTimedOutRound(timedOut);
    leaveGuard.noteAnswer();
    log.push({ correct, tier: entityTier(data.meta, target), shielded });
    session.recordRound({
      targetId: target, correct, responseTimeMs: Math.max(0, Date.now() - startedAt.current), answeredAt: Date.now(),
      tier: entityTier(data.meta, target),
      ...(timedOut ? { timedOut: true, ...(value ? { selectedId: value } : {}) } : { selectedId: value }),
      ...(supply.assisted || shielded ? { assisted: true } : {}),
      ...(shielded ? { shielded: true } : {}),
    });
    advance(feedbackHoldMs(correct, engineVariant !== "silhueta-opcoes"), feedbackSkipAfterMs(correct));
    if (correct) cueCorrect();
  };
  const submit = (value = typed) => {
    if (!target || locked) return;
    resolve(value, aliases(data.meta[target]).includes(normalizeName(value)));
  };
  // Lupa: esconde 2 alternativas erradas ao acaso (só na Silhueta · alternativas).
  const useLupa = () => {
    if (!target || locked || !supply.use("lupa")) return;
    setLupaHidden(new Set(lupaToHide(choices, target, lupaHidden, triedWrong, shuffleAnswerOptions)));
  };
  const visibleChoices = useMemo(() => choices.filter((id) => !lupaHidden.has(id)), [choices, lupaHidden]);
  // Pular: o alvo vai para o fim do baralho (sem contar acerto nem erro) e a próxima silhueta entra. Na última carta não há para onde mandar.
  const skipRound = () => {
    const cards = deck.current;
    if (!target || locked || !cards || cards.remaining === 0 || !supply.use("pular")) return;
    cards.defer(target);
    const next = cards.draw();
    if (next) showTarget(next);
  };
  const useItem = (id: SupplyId) => { if (id === "pular") skipRound(); else if (id === "lupa") useLupa(); else supply.use(id); };
  const total = deck.current?.size ?? ids.length;
  const exit = () => leaveGuard.ask({ onLeave: () => void leave(), onRestart: () => void (async () => { flow.cancel(); await session.abandon(); onRestart(); })(), coins: log.pending, xp: total });
  useGameKeys({
    exit,
    choose: (index) => { if (engineVariant !== "silhueta-opcoes" || locked) return; const id = visibleChoices[index]; if (id && !triedWrong.has(id)) { setSelectedSilhouette(id); resolve(id, id === target); } },
    enabled: Boolean(features && target),
  });
  const path = featurePath(features?.get(target));
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!features || !target) return <LoadingGeometry />;
  const typedMode = engineVariant !== "silhueta-opcoes";
  const targetName = data.meta[target]?.pt ?? target;
  return <div className="app-shell gs-app">{leaveGuard.dialog}
    <div className="gs">
      <GameTopBar results={log.results} total={total} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel(sessionVariant)} · ${regionLabel(region)}`}>
        <RoundTimer pausable={!settings.duel} seconds={settings.timerSeconds} bonusSeconds={supply.bonusSeconds} running={!locked && !leaveGuard.asking} resetKey={serial} onExpire={() => resolve(typedMode ? typed : "", false, true)} />
        {suppliesEnabled && (
          <SupplyTray timed={settings.pace === "timed"}
            variant={engineVariant}
            counts={supply.counts}
            usedThisRound={supply.usedThisRound}
            armed={supply.armed} tonicLeft={supply.tonicLeft}
            onArm={supply.toggleArm}
            blocked={deck.current?.remaining === 0 ? new Set<SupplyId>(["pular"]) : undefined}
            disabled={locked}
            onUse={useItem}
          />
        )}
      </GameTopBar>
      <div className="gs-body">
        <main className="gs-stage" data-target-id={import.meta.env.DEV ? target : undefined}>
          <div className="gs-kicker">{country ? t.divisions.silhouette(unitWord(divisionCountry(country))) : t.silhouette.kicker(!isCountry(target, data.meta[target]))}</div>
          <div className={`silhouette-frame${answerResult === "correct" ? " is-hit" : answerResult === "wrong" ? " is-miss" : ""}`}><svg viewBox={`0 0 ${path.width} ${path.height}`} role="img" aria-label={t.silhouette.aria}><path d={path.d} /></svg>{answerResult === "correct" && <span className="sil-check" aria-hidden="true">✓</span>}</div>
          {typedMode && !answerResult && supply.usedThisRound.has("letra") && <div className="gs-letterhint" role="note" aria-label={t.supplies.letterAria}>{letterHint(targetName)}</div>}
          {!answerResult && supply.usedThisRound.has("vizinho") && <NeighborChip meta={data.meta} targetId={target} />}
          <div className={`gs-ribbon${retryNotice && !answerResult ? " on info" : answerResult ? ` on ${answerResult === "correct" ? "ok" : "no"}${shieldSaved ? " wrap" : ""}` : ""}`} role="status" aria-live="polite">
            {answerResult === "correct" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {answerResult ? (shieldSaved ? `${feedback} ${t.supplies.shieldSaved}` : feedback) : retryNotice ? t.supplies.retryNote : ""}
            {answerResult === "wrong" && <span className="sr-only">{t.common.rightAnswerIs(targetName)}</span>}
          </div>
        </main>
        <section className="gs-tray" aria-label={t.common.answersRegion}>
          {typedMode ? <>
            <form className="gs-field" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <TypedAnswerInput key={target} className={answerResult === "correct" ? "answer-success" : answerResult === "wrong" ? "answer-error" : ""} inputRef={inputRef} aria-label={t.common.answerField} autoFocus value={typed} disabled={locked} onChange={setTyped} onCommit={submit} onGiveUp={() => resolve("", false, false, true)} answers={aliases(data.meta[target])} />
              <button className="go" disabled={locked || !typed.trim()}>Responder</button>
            </form>
            {answerResult
              ? <AnswerReveal verdict={answerResult} expected={targetName} typed={typed} timedOut={timedOutRound} />
              : <div className="gs-hintline">{t.common.typingHint}</div>}
            {answerResult === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, true)} onSkip={flow.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>Enter</kbd> {t.common.keyAnswerContinue}</span><span>{t.common.keyGiveUp}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </> : <>
            <div className="quiz-options gs-opts">{visibleChoices.map((id, index) => <button className={`${triedWrong.has(id) && !answerResult ? "quiz-option wrong is-tried" : optionClass(id === target, id === selectedSilhouette, answerResult)} gs-opt`} disabled={locked || triedWrong.has(id)} key={id} data-option-id={id} onClick={() => {
              if (locked) return;
              setSelectedSilhouette(id);
              resolve(id, id === target);
            }}>
              <span className="gs-key" aria-hidden="true">{index + 1}</span>
              <span className="gs-opt-label">{data.meta[id]?.pt ?? id}</span>
              <OptionMarks isTarget={id === target} isPicked={id === selectedSilhouette} verdict={answerResult} />
              {triedWrong.has(id) && !answerResult && <><span className="opt-mark opt-mark-miss" aria-hidden="true">✕</span><span className="sr-only">{t.feedback.wrongPickSr}</span></>}
            </button>)}</div>
            {answerResult === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, false)} onSkip={flow.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>1</kbd>–<kbd>4</kbd> · <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> {t.common.keyChoose}</span><span><kbd>Enter</kbd> {t.common.keyContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </>}
        </section>
      </div>
    </div>
  </div>;
}

// Travel no estilo do Travle (21/10/2026; regras em domain/travel.ts): a origem e o destino no mapa, chutes em qualquer ordem, cada um pintado
// com o contorno de verdade e a cor de quanto ajudou; vence quem liga os dois por terra antes de acabarem os chutes. Sem cronômetro.
/** `off`: o nível não aceitou o chute (não encosta na trilha, não é o próximo da rota): gastou um chute e não entra no mapa. */
type TravelGuess = { id: string; grade: TravelGrade; off?: boolean };
/** Quanto a rota fechada fica na tela antes da próxima (22/10/2026, pedido do Enzo: "continuar vai sozinho depois de alguns segundos"; Enter adianta). */
const TRAVEL_HOLD_MS = 7000;
type TravelNotice = { kind: "" | "ok" | "no" | "info"; text: string };

function TravelGame({ data, region, options, onBack, onEnd, onRestart, supplies = emptySupplyCounts() }: Omit<Props, "family"> & { onRestart: () => void }) {
  const settings = sessionSettings(options, "travel");
  const session = useSession("travel", "travel", region, settings);
  const leaveGuard = useLeaveGuard(settings.pvp ? "pvp" : Boolean(settings.duel));
  const log = useRoundLog("travel", settings.pace);
  const flow = useAdvance();
  // Suprimentos só fora do duelo; sem cronômetro, sobram Pular, Escudo e o Tônico.
  const suppliesEnabled = !settings.duel && !settings.pvp;
  const supply = useSupplies(supplies, suppliesEnabled);
  const leave = async (destination: Destination = "recorte") => {
    const result = await session.abandon();
    if (destination === "home") location.href = "/";
    else if (destination === "result" && result?.spoils && onEnd) onEnd(result);
    else onBack();
  };
  const meta = data.meta;
  const ids = useMemo(() => travelPool(meta).filter((id) => inRegion(id, region, data)), [data, meta, region]);
  const graph = useMemo(() => travelGraph(meta, ids), [meta, ids]);
  const destinations = useMemo(() => travelDestinations(graph), [graph]);
  // o nome digitado → o país do jogo, só entre os países do Travel (as nações do Reino Unido valem pelo Reino Unido); a chave é a da escrita
  // (sem acento, espaço nem apóstrofo). Fora do jogo, um índice à parte só para dizer "não está neste recorte".
  const { nameIndex, otherIndex } = useMemo(() => {
    const index = new Map<string, string>();
    const other = new Map<string, string>();
    const pool = new Set(travelPool(meta));
    const byCca3 = new Map(Object.entries(meta).filter(([, item]) => item.cca3).map(([id, item]) => [item.cca3!.toUpperCase(), id]));
    for (const id of Object.keys(meta)) {
      const parent = (meta[id] as { substitui?: string }).substitui;
      const target = parent ? byCca3.get(parent.toUpperCase()) ?? id : id;
      const names = [meta[id]?.pt, meta[id]?.en, ...((meta[id] as { al?: string[] }).al ?? [])].filter((name): name is string => Boolean(name));
      for (const name of names) {
        const key = answerKey(name);
        if (!key) continue;
        if (pool.has(target)) { if (!index.has(key) || target === id) index.set(key, target); }
        else if (!other.has(key)) other.set(key, target);
      }
    }
    return { nameIndex: index, otherIndex: other };
  }, [meta]);
  // os nomes que começam com o que foi digitado, de países diferentes (o "vietna" de Vietnã não espera o "vietnam" do mesmo país)
  const matchesFor = (value: string) => {
    const key = answerKey(value);
    if (key.length < 2) return [];
    const ids = new Map<string, number>();
    for (const [name, id] of nameIndex) {
      if (!name.startsWith(key) || id === puzzle?.start || id === puzzle?.end) continue;
      // o nome exato primeiro ("guine": Guiné antes de Guiné Equatorial), depois o mais curto
      const rank = name === key ? 0 : name.length;
      ids.set(id, Math.min(ids.get(id) ?? Infinity, rank));
    }
    return [...ids].sort((a, b) => a[1] - b[1] || nameOf(a[0]).localeCompare(nameOf(b[0]))).map(([id]) => id);
  };
  const runSeed = useRef(settings.deckSeed ?? Math.floor(Math.random() * 0x7fffffff));
  const deck = useRef<ReturnType<typeof createFiniteDeck<string>> | null>(null);
  const [puzzle, setPuzzle] = useState<TravelPuzzle | null>(null);
  const [guesses, setGuesses] = useState<TravelGuess[]>([]);
  const level = useMemo(readTravelLevel, []);
  const [borders, setBorders] = useState(false);
  const [showInitials, setShowInitials] = useState(false);
  const [nextHint, setNextHint] = useState<string | null>(null);
  // aviso "comece pela origem": o número muda a cada vez (reinicia a animação) e some sozinho
  const [sideHint, setSideHint] = useState(0);
  const [sideShown, setSideShown] = useState(false);
  useEffect(() => {
    if (!sideHint) return;
    setSideShown(true);
    const timer = window.setTimeout(() => setSideShown(false), 3800);
    return () => window.clearTimeout(timer);
  }, [sideHint]);
  const [closed, setClosed] = useState<"won" | "lost" | null>(null);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<TravelNotice>({ kind: "", text: "" });
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState("");
  const closedRef = useRef(false);
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const routeIndex = useRef(0);
  const openPuzzle = (destination: string) => {
    const next = travelPuzzle(graph, destination, runSeed.current, level, travelBand(routeIndex.current, runSeed.current));
    routeIndex.current += 1;
    if (!next) { setError(t.travel.noRoute); return; }
    setPuzzle(next); setGuesses([]); setBorders(false); setShowInitials(false); setNextHint(null); setClosed(null); closedRef.current = false;
    setTyped(""); setNotice({ kind: "", text: "" });
    startedAt.current = Date.now();
    supply.resetRound();
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  useEffect(() => {
    if (deck.current) return;
    if (!destinations.length) { setError(t.travel.noRoute); return; }
    deck.current = createFiniteDeck(destinations, deckSeedFor(seedFromParts("travel", JSON.stringify(region), destinations.join("|")), settings.deckSeed), settings.roundLimit);
    const first = deck.current.draw();
    if (first) openPuzzle(first);
  }, [destinations]);
  const have = useMemo(() => new Set(guesses.filter((guess) => !guess.off).map((guess) => guess.id)), [guesses]);
  // em "Em ordem", a ponta da cadeia: o último país aceito
  const tip = [...guesses].reverse().find((guess) => !guess.off)?.id ?? puzzle?.start;
  const nameOf = (id: string) => meta[id]?.pt ?? id;
  const advance = () => {
    flow.schedule(async () => {
      const destination = deck.current?.draw();
      if (!destination) {
        const result = await session.finish();
        if (onEnd) onEnd(result);
        else onBack();
        return;
      }
      openPuzzle(destination);
    }, TRAVEL_HOLD_MS, 600);
  };
  // A rota acabou (ligou a origem ao destino ou acabaram os chutes): grava a rodada com quanto ela rendeu.
  const closeRoute = (active: TravelPuzzle, won: boolean, all: TravelGuess[], value: string) => {
    closedRef.current = true;
    setClosed(won ? "won" : "lost");
    // Escudo: a rota perdida não quebra a sequência nem pesa na partida (a rodada fica de fora da conta, ver spoils.ts).
    const shielded = !won && supply.consumeArmed("escudo");
    const path = bestRoute(graph, active.start, active.end, new Set(all.filter((guess) => !guess.off).map((guess) => guess.id))) ?? [];
    setNotice({ kind: won ? "ok" : "no", text: `${won ? t.travel.won(all.length, active.shortest) : t.travel.lost(path.map(nameOf).join(" → "), active.shortest)}${shielded ? ` · ${t.supplies.shieldSaved}` : ""}` });
    setStreak((current) => won ? current + 1 : shielded ? current : 0);
    const weight = travelWeight(active, all.length, won, level);
    leaveGuard.noteAnswer();
    log.push({ correct: won, tier: entityTier(meta, active.end), weight, shielded });
    session.recordRound({
      targetId: active.end, correct: won, responseTimeMs: Date.now() - startedAt.current, answeredAt: Date.now(),
      selectedId: value, attempts: all.length, guesses: all.map((guess) => guess.id), route: path, shortest: bestRoute(graph, active.start, active.end) ?? [],
      tier: entityTier(meta, active.end), weight,
      ...(supply.assisted || shielded ? { assisted: true } : {}),
      ...(shielded ? { shielded: true } : {}),
    });
    advance();
    if (won) cueCorrect();
  };
  const submit = (value = typed) => {
    if (!puzzle || !value.trim() || closedRef.current) return;
    setTyped("");
    requestAnimationFrame(() => inputRef.current?.focus());
    const id = nameIndex.get(answerKey(value)) ?? otherIndex.get(answerKey(value));
    if (!id) { setNotice({ kind: "no", text: t.travel.unknown }); return; }
    if (id === puzzle.start || id === puzzle.end) { setNotice({ kind: "info", text: t.travel.endpoint }); return; }
    if (have.has(id)) { setNotice({ kind: "info", text: t.travel.duplicate }); return; }
    if (!graph.has(id)) { setNotice({ kind: "no", text: t.travel.outside(nameOf(id)) }); return; }
    if (wrongSide(graph, puzzle, have, id, level, tip)) {
      // pelo lado do destino: não gasta chute; o aviso diz por onde começar (e a origem pisca)
      setNotice({ kind: "info", text: t.travel.wrongSide(nameOf(puzzle.start)) });
      setSideHint((current) => current + 1);
      return;
    }
    const allowed = guessAllowed(graph, puzzle, have, id, level, tip);
    const grade = allowed ? gradeGuess(graph, puzzle, have, id) : "far";
    const all: TravelGuess[] = [...guesses, allowed ? { id, grade } : { id, grade, off: true }];
    setGuesses(all);
    const linked = new Set(all.filter((guess) => !guess.off).map((guess) => guess.id));
    if (allowed && routeClosed(graph, puzzle.start, puzzle.end, linked)) closeRoute(puzzle, true, all, value);
    else if (all.length >= puzzle.budget) closeRoute(puzzle, false, all, value);
    else if (!allowed) setNotice({ kind: "no", text: level === "exata" ? t.travel.offRoute(nameOf(id)) : t.travel.offTrail(nameOf(id)) });
    else setNotice({ kind: grade === "far" ? "no" : grade === "near" ? "info" : "ok", text: t.travel.graded(nameOf(id), t.travel.grades[grade]) });
  };
  // digitou um nome inteiro que só um país do jogo tem: chuta sozinho (21/10/2026, o Enzo precisava do Enter); senão, as sugestões tocáveis
  const suggestions = useMemo(() => matchesFor(typed).filter((id) => !have.has(id)).slice(0, 4), [typed, nameIndex, puzzle, have]);
  // Enter (ou Chutar) chuta a sugestão destacada, a primeira por padrão; as setas trocam o destaque (21/10/2026, ideia do Enzo)
  const [picked, setPicked] = useState(0);
  useEffect(() => setPicked(0), [typed]);
  const onSuggestKey = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (suggestions.length < 2) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setPicked((current) => (current + step + suggestions.length) % suggestions.length);
  };
  const onType = (value: string) => {
    setTyped(value);
    // só quando nenhum nome mais longo começa com o que foi digitado (com "Jordan" confirmava no meio de "Jordânia" e o "ia" virava outro chute)
    const key = answerKey(value);
    const id = nameIndex.get(key);
    if (id && ![...nameIndex.keys()].some((name) => name !== key && name.startsWith(key))) submit(value);
  };
  // As pistas são suprimentos (21/10/2026, pedido do Enzo: "não usar de graça"): gastam do estoque e a rota fica assistida (metade das moedas).
  const useTravelSupply = (id: SupplyId) => {
    if (!puzzle || closed) return;
    if (id === "pular") { skipRound(); return; }
    if (id === "vizinho") {
      const next = remainingRoute(graph, puzzle, have)[0];
      if (!next || !supply.use("vizinho")) return;
      setNextHint(next); setNotice({ kind: "info", text: t.travel.nextShown });
    } else if (id === "lanterna") { if (supply.use("lanterna")) setBorders(true); }
    else if (id === "letra") { if (supply.use("letra")) setShowInitials(true); }
    else supply.use(id);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  // Pular: o destino vai para o fim do baralho (sem contar acerto nem erro) e o próximo entra. No último destino não há para onde mandar.
  const skipRound = () => {
    const cards = deck.current;
    if (!puzzle || closedRef.current || !cards || cards.remaining === 0 || !supply.use("pular")) return;
    cards.defer(puzzle.end);
    const destination = cards.draw();
    if (destination) openPuzzle(destination);
  };
  const total = deck.current?.size ?? Math.min(destinations.length, settings.roundLimit ?? destinations.length);
  const exit = () => leaveGuard.ask({ onLeave: () => void leave(), onRestart: () => void (async () => { flow.cancel(); await session.abandon(); onRestart(); })(), coins: log.pending, xp: total });
  useGameKeys({ exit, enabled: Boolean(puzzle) });
  // o que o mapa pinta: as pontas, os chutes e, no fim, o caminho que faltava
  // no fim da rota (fechada ou perdida): o caminho mais curto destacado, com as fronteiras de todos acesas
  const shortestPath = useMemo(() => (puzzle && closed ? bestRoute(graph, puzzle.start, puzzle.end) ?? [] : []), [closed, graph, puzzle]);
  const reveal = useMemo(() => shortestPath.slice(1, -1).filter((id) => !have.has(id)), [have, shortestPath]);
  // o ✓ vale para todo chute verde que já se liga à origem (a cor do chute fica a da hora em que foi dado)
  const linked = useMemo(() => (puzzle ? linkedToStart(graph, puzzle.start, have) : new Set<string>()), [graph, have, puzzle]);
  const shownGrade = (guess: TravelGuess): TravelGrade => (guess.grade === "linked" || guess.grade === "closer" ? (linked.has(guess.id) ? "linked" : "closer") : guess.grade);
  const paints = useMemo(() => {
    const out = new Map<string, TravelPaint>();
    if (!puzzle) return out;
    for (const id of reveal) for (const piece of travelFeatureIds(meta, id)) out.set(piece, "reveal");
    for (const guess of guesses) if (!guess.off) for (const piece of travelFeatureIds(meta, guess.id)) out.set(piece, shownGrade(guess));
    for (const id of [puzzle.start, puzzle.end]) for (const piece of travelFeatureIds(meta, id)) out.set(piece, "end");
    return out;
  }, [guesses, linked, meta, puzzle, reveal]);
  // os pequenos demais para o contorno aparecer ganham um ponto
  const points = useMemo(() => (puzzle ? travelPoints(meta, [...reveal.map((id) => [id, "reveal"] as [string, TravelPaint]), ...guesses.filter((guess) => !guess.off).map((guess) => [guess.id, shownGrade(guess)] as [string, TravelPaint]), [puzzle.start, "end"], [puzzle.end, "end"]]) : []), [guesses, linked, meta, puzzle, reveal]);
  const boxes = useMemo(() => (puzzle ? travelBoxes(meta, [puzzle.start, puzzle.end, ...guesses.filter((guess) => guess.grade !== "far").map((guess) => guess.id), ...reveal]) : []), [guesses, meta, puzzle, reveal]);
  const dashed = useMemo(() => (closed ? shortestPath.slice(1, -1).flatMap((id) => travelFeatureIds(meta, id)) : nextHint && !have.has(nextHint) ? travelFeatureIds(meta, nextHint) : []), [closed, have, meta, nextHint, shortestPath]);
  const initials = puzzle && showInitials ? remainingRoute(graph, puzzle, have).map((id) => nameOf(id).charAt(0).toUpperCase()).join(" · ") : "";
  if (error) return <GeometryError error={error} onBack={onBack} />;
  if (!puzzle) return <LoadingGeometry />;
  return <div className="app-shell gs-app">{leaveGuard.dialog}
    <div className="gs gs-travel">
      <GameTopBar results={log.results} total={total} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel("travel")} · ${t.travel.levels[level].name} · ${regionLabel(region)}`}>
        {suppliesEnabled && (
          <SupplyTray timed={false}
            variant="travel"
            counts={supply.counts}
            usedThisRound={supply.usedThisRound}
            armed={supply.armed} tonicLeft={supply.tonicLeft}
            onArm={supply.toggleArm}
            blocked={deck.current?.remaining === 0 ? new Set<SupplyId>(["pular"]) : undefined}
            disabled={Boolean(closed)}
            onUse={useTravelSupply}
            labels={t.travel.supplies}
          />
        )}
      </GameTopBar>
      <div className="gs-body">
        <main className="gs-stage tv-stage" data-target-id={import.meta.env.DEV ? `${puzzle.start}>${puzzle.end}` : undefined}>
          <div className="gs-kicker tv-kicker">{t.travel.from} <b className={`tv-end${sideShown ? " is-flash" : ""}`} key={`start-${sideHint}`}>{nameOf(puzzle.start)}</b> {t.travel.to} <b className="tv-end">{nameOf(puzzle.end)}</b></div>
          <div className="tv-mapwrap">
            <TravelMap paints={paints} points={points} boxes={boxes} borders={borders || Boolean(closed)} dashed={dashed} />
            {sideShown && !closed && <div className="tv-side" key={sideHint} aria-hidden="true"><i>⚠️</i><b>{t.travel.wrongSideTitle(nameOf(puzzle.start))}</b><small>{t.travel.wrongSideSub}</small></div>}
            {closed && <div className={`tv-done is-${closed}`} aria-hidden="true">
              <i>{closed === "won" ? "✓" : "✕"}</i>
              <b>{closed === "won" ? (guesses.length === puzzle.shortest ? t.travel.donePerfect : t.travel.doneWon) : t.travel.doneLost}</b>
              <small>{t.travel.doneLine(guesses.length, puzzle.shortest)}</small>
            </div>}
          </div>
          <div className="tv-count"><span>{t.travel.counter(guesses.length, puzzle.budget, closed ? puzzle.shortest : undefined)}</span>{initials && <b>{t.travel.initials(initials)}</b>}</div>
          <ol className="tv-guesses" aria-label={t.travel.guessesAria}>
            {guesses.map((guess, index) => {
              const grade = shownGrade(guess);
              return <li key={`${guess.id}:${index}`} className={`tv-guess is-${guess.off ? "off" : grade}`}>
                <i aria-hidden="true">{guess.off ? "✕" : grade === "linked" ? "✓" : ""}</i>{nameOf(guess.id)}<span className="sr-only">: {guess.off ? t.travel.grades.off : t.travel.grades[grade]}</span>
              </li>;
            })}
            {reveal.map((id) => <li key={id} className="tv-guess is-reveal"><i aria-hidden="true" />{nameOf(id)}<span className="sr-only">: {t.travel.grades.reveal}</span></li>)}
          </ol>
          <div className={`gs-ribbon wrap on ${notice.kind || "info"}`} role="status" aria-live="polite">{notice.text || t.travel.levels[level].hint}</div>
        </main>
        <section className="gs-tray" aria-label={t.common.answersRegion}>
          <form className="gs-field" onKeyDownCapture={onSuggestKey} onSubmit={(event) => { event.preventDefault(); const id = suggestions[Math.min(picked, suggestions.length - 1)]; submit(id ? nameOf(id) : typed); }}>
            <TypedAnswerInput key={`${puzzle.start}-${puzzle.end}`} inputRef={inputRef} aria-label={t.travel.guessField} autoFocus value={typed} disabled={Boolean(closed)} onChange={onType} onCommit={submit} />
            <button className="go" disabled={Boolean(closed) || !typed.trim()}>{t.travel.guess}</button>
          </form>
          {!closed && suggestions.length > 0 && <div className="tv-suggest" role="group" aria-label={t.travel.suggestions}>
            {suggestions.map((id, index) => <button key={id} type="button" className="tv-sug" aria-pressed={index === picked} onPointerDown={(event) => event.preventDefault()} onClick={() => submit(nameOf(id))}>{nameOf(id)}</button>)}
          </div>}
          {closed && <ContinueBar holdMs={TRAVEL_HOLD_MS} onSkip={flow.skip} />}
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
