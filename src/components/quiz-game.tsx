import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { inRegion } from "../domain/regions";
import { regionLabel } from "../domain/regions";
import { flagSource, loadFlags, quizPool, type FlagCatalog } from "../domain/quiz";
import type { Family, Legacy, QuizVariant, RegionSelection } from "../domain/types";
import {
  startLearningSession,
  type LearningSessionHandle,
  type SessionResult,
} from "../domain/learning-store";
import { createFiniteDeck, deckSeedFor, seedFromParts } from "../domain/finite-deck";
import { shuffleAnswerOptions } from "../domain/answer-options";
import { sessionSettings, type SessionOptions } from "../domain/pace";
import { entityTier } from "../domain/spoils";
import { RoundTimer } from "./round-timer";
import { cueCorrect, OptionFlag, OptionMarks, optionClass } from "./answer-feedback";
import { useAdvance } from "./use-advance";
import { useLeaveGuard } from "./leave-guard";
import { ContinueBar, GameTopBar, SupplyTray, bigClass, useGameKeys, useRoundLog } from "./game-shell";
import { useSupplies } from "./use-supplies";
import { LUPA_REMOVE_COUNT, emptySupplyCounts, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { variantLabel } from "../domain/result-view";
import { feedbackHoldMs, feedbackSkipAfterMs } from "../domain/feedback-timing";
import { t } from "../domain/i18n";

type Question = { target: string; options: string[] };

export function QuizGame({
  data,
  family,
  variant,
  region,
  options,
  supplies = emptySupplyCounts(),
  onBack,
  onEnd,
}: {
  data: Legacy;
  family: Extract<Family, "bandeiras" | "capitais">;
  variant: Exclude<QuizVariant, "mapa">;
  region: RegionSelection;
  options?: SessionOptions;
  supplies?: SupplyCounts;
  onBack: () => void;
  onEnd?: (result: SessionResult | null) => void;
}) {
  const settings = sessionSettings(options, variant);
  const { pace, roundLimit, timerSeconds } = settings;
  // Suprimentos de expedição: só na Partida solo (nunca no Treino nem em duelo/PvP).
  const suppliesEnabled = !settings.duel && !settings.pvp;
  const supply = useSupplies(supplies, suppliesEnabled);
  const [lupaHidden, setLupaHidden] = useState<ReadonlySet<string>>(new Set());
  const [flags, setFlags] = useState<FlagCatalog | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "">("");
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(0);
  const [serial, setSerial] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const settledRef = useRef("");
  const advance = useAdvance();
  const leaveGuard = useLeaveGuard(settings.pvp ? "pvp" : Boolean(settings.duel));
  const log = useRoundLog(settings.coinVariant ?? variant, pace);
  const timer = useRef<number | null>(null);
  const targetStartedAtRef = useRef(0);
  const sessionRef = useRef<LearningSessionHandle | null>(null);
  const pendingSessionRef = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsersRef = useRef(0);
  const queuedRoundsRef = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);
  const deckRef = useRef<ReturnType<typeof createFiniteDeck<string>> | null>(null);

  const openSession = () => {
    const pending = startLearningSession({ family, variant, region, pace, roundLimit, timerSeconds, coinVariant: settings.coinVariant, duel: settings.duel, onRound: settings.onRound, coinFactor: settings.coinFactor });
    pendingSessionRef.current = pending;
    pending
      .then((handle) => {
        if (strictUsersRef.current > 0) sessionRef.current = handle;
        if (strictUsersRef.current > 0) {
          queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
        }
        else void handle.end();
      })
      .catch((sessionError) =>
        console.error(
          `[carta-cega] learning session failed: ${
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError)
          }`,
        ),
      );
  };
  // "result": encerrar pelo botão mostra o resultado (com as moedas ganhas até ali); "recorte"/"home" só navegam.
  const leaveSession = async (destination: "recorte" | "home" | "result" = "recorte") => {
    const handle =
      sessionRef.current ??
      (await pendingSessionRef.current?.catch(() => null));
    sessionRef.current = null;
    let result: SessionResult | null = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      result = await handle.end({ complete: false });
    }
    if (destination === "home") location.href = "/";
    else if (destination === "result" && result?.spoils && onEnd) onEnd(result);
    else onBack();
  };
  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    leaveGuard.noteAnswer();
    log.push({ correct: round.correct, tier: round.tier });
    if (sessionRef.current) sessionRef.current.recordRound(round);
    else queuedRoundsRef.current.push(round);
  };
  const finishSession = async () => {
    const handle = sessionRef.current ?? await pendingSessionRef.current?.catch(() => null);
    let result: SessionResult | null = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      result = await handle.finish();
    }
    if (onEnd) onEnd(result);
    else onBack();
  };

  useEffect(() => {
    strictUsersRef.current += 1;
    if (!pendingSessionRef.current) openSession();
    return () => {
      strictUsersRef.current -= 1;
      queueMicrotask(() => {
        if (strictUsersRef.current > 0) return;
        const handle = sessionRef.current;
        sessionRef.current = null;
        if (handle) void handle.end();
      });
    };
  }, []);

  useEffect(() => {
    if (family === "bandeiras") {
      loadFlags().then(setFlags).catch((loadError: Error) => setError(loadError.message));
    } else {
      setFlags({});
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [family]);

  const pool = useMemo(
    () => quizPool(data, family, region, flags ?? undefined),
    [data, family, region, flags],
  );

  const nextQuestion = () => {
    const deck = deckRef.current;
    if (!deck || deck.remaining === 0) return;
    const targetId = deck.draw();
    if (!targetId) return;
    const options = shuffleAnswerOptions([
      targetId,
      ...shuffleAnswerOptions(pool.filter((id) => id !== targetId)).slice(0, 3),
    ]);
    setTarget(targetId);
    setRound(deck.size - deck.remaining);
    targetStartedAtRef.current = Date.now();
    setQuestion({ target: targetId, options });
    setFeedback("");
    setSelected("");
    setTimedOut(false);
    settledRef.current = "";
    setSerial((value) => value + 1);
    supply.resetRound();
    setLupaHidden(new Set());
  };
  const newDeck = () => createFiniteDeck(pool, deckSeedFor(seedFromParts(family, variant, JSON.stringify(region), pool.join("|")), settings.deckSeed), roundLimit);

  useEffect(() => {
    if (pool.length >= 4) {
      deckRef.current = newDeck();
      nextQuestion();
    }
  }, [pool]);

  // id nulo = o tempo da pergunta acabou (conta como erro, sem alternativa marcada).
  const resolveRound = (id: string | null) => {
    if (!question || feedback || settledRef.current === question.target) return;
    settledRef.current = question.target;
    const correct = id !== null && id === question.target;
    recordRound({
      targetId: question.target,
      correct,
      responseTimeMs: Math.max(0, Date.now() - targetStartedAtRef.current),
      answeredAt: Date.now(),
      tier: entityTier(data.meta, question.target),
      ...(id === null ? { timedOut: true } : { selectedId: id }),
      ...(supply.assisted ? { assisted: true } : {}),
    });
    setSelected(id ?? "");
    setTimedOut(id === null);
    setFeedback(correct ? "correct" : "wrong");
    setScore((value) => value + (correct ? 1 : 0));
    setStreak((value) => (correct ? value + 1 : 0));
    const exhausted = deckRef.current?.remaining === 0;
    advance.schedule(async () => {
      if (exhausted) await finishSession();
      else nextQuestion();
    }, feedbackHoldMs(correct, false), feedbackSkipAfterMs(correct));
    if (correct) cueCorrect();
  };
  const answer = (id: string) => resolveRound(id);
  const useSupplyItem = (id: SupplyId) => {
    if (feedback || !supply.use(id)) return;
    if (id === "lupa" && question) {
      const wrong = question.options.filter((option) => option !== question.target && !lupaHidden.has(option));
      const toHide = shuffleAnswerOptions(wrong).slice(0, LUPA_REMOVE_COUNT);
      setLupaHidden((current) => new Set([...current, ...toHide]));
    }
  };
  const restart = () => {
    advance.cancel();
    leaveGuard.reset();
    log.reset();
    const previous = sessionRef.current;
    sessionRef.current = null;
    pendingSessionRef.current = null;
    if (previous) void previous.end();
    openSession();
    setScore(0);
    setStreak(0);
    setRound(0);
    deckRef.current = newDeck();
    nextQuestion();
  };

  const totalRounds = deckRef.current?.size ?? pool.length;
  const exit = () => leaveGuard.ask({ onLeave: () => void leaveSession(), onRestart: restart, coins: log.pending, xp: totalRounds });
  const visibleOptions = useMemo(() => question?.options.filter((id) => !lupaHidden.has(id)) ?? [], [question, lupaHidden]);
  useGameKeys({ exit, choose: (index) => { const id = visibleOptions[index]; if (id && !feedback) answer(id); } });

  const targetMeta = data.meta[target];
  const isFlagPrompt = variant === "bandeira-nome";
  const titleFor = (id: string) => data.meta[id]?.pt ?? id;
  const valueFor = (id: string) =>
    variant === "pais-capital" ? data.meta[id]?.cap ?? "" : titleFor(id);
  const correctAnswer =
    variant === "pais-capital"
      ? valueFor(question?.target ?? target)
      : titleFor(question?.target ?? target);
  // A linha visível é curta e calma; a alternativa certa fica destacada nas opções e a frase completa vai para leitores de tela.
  const feedbackText = feedback === "correct" ? t.common.correct : feedback === "wrong" ? (timedOut ? t.common.timeUp : t.common.wrong) : t.quiz.pickAnswer;

  if (error) {
    return (
      <div className="app-shell">
        <main className="content">
          <button className="back" onClick={() => void leaveSession()}>{t.common.exitGame}</button>
          <div className="diagnostic" style={{ marginTop: 32 }}>
            <div className="eyebrow">{t.quiz.unavailable}</div>
            <p><strong>{t.quiz.loadFailed}</strong></p>
            <p className="mono">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="app-shell">
        <main className="content">
          <button className="back" onClick={() => void leaveSession()}>{t.common.exitGame}</button>
          <div className="eyebrow" style={{ marginTop: 32 }}>{t.quiz.preparing}</div>
          <h1 style={{ marginTop: 18 }}>{family === "bandeiras" ? t.quiz.loadingFlags : t.quiz.loadingCapitals}</h1>
          <p className="lede">{t.quiz.buildingDeck}</p>
        </main>
      </div>
    );
  }

  const flagOptions = variant === "nome-bandeira";
  const promptText = variant === "capital-pais" ? targetMeta?.cap : titleFor(target);
  const promptFlag = isFlagPrompt && targetMeta?.fl ? flags?.[targetMeta.fl.toLowerCase()] : undefined;
  const kicker = isFlagPrompt ? t.quiz.whichCountryFlag : variant === "nome-bandeira" ? t.quiz.pickFlag : variant === "capital-pais" ? t.quiz.whichCountryCapital : t.quiz.whichCapital;
  return (
    <div className="app-shell gs-app">
      {leaveGuard.dialog}
      <div className="gs">
        <GameTopBar results={log.results} total={totalRounds} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel(variant)} · ${regionLabel(region)}`}>
          <RoundTimer pausable={!settings.duel} seconds={timerSeconds} bonusSeconds={supply.bonusSeconds} running={!feedback && !leaveGuard.asking} resetKey={serial} onExpire={() => resolveRound(null)} />
        </GameTopBar>
        {suppliesEnabled && <SupplyTray timed={pace === "timed"} variant={variant} counts={supply.counts} usedThisRound={supply.usedThisRound} disabled={Boolean(feedback)} onUse={useSupplyItem} />}
        <div className="gs-body">
          <main className="gs-stage">
            <div className="gs-kicker">{kicker}</div>
            {promptFlag
              ? <div className="gs-flag"><img src={flagSource(promptFlag)} alt={t.common.flagStimulus} /></div>
              : <div className={bigClass(promptText)}>{promptText}</div>}
            <div className={`gs-ribbon${feedback ? ` on ${feedback === "correct" ? "ok" : "no"}` : ""}`} role="status" aria-live="polite">
              {feedback === "correct" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              {feedback ? feedbackText : ""}
              {feedback === "wrong" && <span className="sr-only">{t.common.rightAnswerIs(correctAnswer)}</span>}
            </div>
          </main>
          <section className="gs-tray" aria-label={t.common.answersRegion}>
            <div className={`quiz-options gs-opts${flagOptions ? " flags" : ""}`}>
              {visibleOptions.map((id, index) => (
                <button
                  key={id}
                  className={`${optionClass(id === question.target, id === selected, feedback)} gs-opt`}
                  disabled={Boolean(feedback)}
                  aria-pressed={selected === id}
                  onClick={() => answer(id)}
                >
                  <span className="gs-key" aria-hidden="true">{index + 1}</span>
                  {flagOptions ? (
                    data.meta[id]?.fl && flags?.[data.meta[id].fl.toLowerCase()] ? (
                      <OptionFlag
                        src={flagSource(flags[data.meta[id].fl.toLowerCase()])}
                        alt={t.common.flagOption}
                      />
                    ) : (
                      <span className="gs-opt-label">{titleFor(id)}</span>
                    )
                  ) : <span className="gs-opt-label">{valueFor(id)}</span>}
                  <OptionMarks isTarget={id === question.target} isPicked={id === selected} verdict={feedback} />
                </button>
              ))}
            </div>
            {feedback === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, false)} onSkip={advance.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>1</kbd>–<kbd>4</kbd> {t.common.keyChoose}</span><span><kbd>Enter</kbd> {t.common.keyContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </section>
        </div>
      </div>
    </div>
  );
}
