import { useEffect, useMemo, useRef, useState } from "react";
import { flagSource, loadFlags, type FlagCatalog } from "../domain/quiz";
import { acceptedCapitalAnswers, acceptedWritingAnswers, historicalPool, languagePool, loadSpecialData, type HistoricalEntity, type LanguageEntry } from "../domain/special-data";
import { startLearningSession, type LearningSessionHandle, type SessionResult } from "../domain/learning-store";
import { sessionSettings, type SessionOptions } from "../domain/pace";
import { entityTier } from "../domain/spoils";
import { RoundTimer } from "./round-timer";
import { AnswerReveal, cueCorrect, OptionFlag, OptionMarks, optionClass } from "./answer-feedback";
import { useAdvance } from "./use-advance";
import { useLeaveGuard } from "./leave-guard";
import { ContinueBar, GameTopBar, SupplyTray, bigClass, useGameKeys, useRoundLog } from "./game-shell";
import { useSupplies } from "./use-supplies";
import { emptySupplyCounts, letterHint, LUPA_REMOVE_COUNT, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { variantLabel } from "../domain/result-view";
import { regionLabel } from "../domain/regions";
import { feedbackHoldMs, feedbackSkipAfterMs } from "../domain/feedback-timing";
import type { AnyQuizVariant, Family, Legacy, RegionSelection } from "../domain/types";
import { inRegion } from "../domain/regions";
import { addHistoricalCollection } from "../domain/progress-surfaces";
import { createFiniteDeck, deckSeedFor, seedFromParts } from "../domain/finite-deck";
import { shuffleAnswerOptions } from "../domain/answer-options";
import { TypedAnswerInput } from "./typed-answer-input";
import { answerKey } from "../domain/typed-answer";
import { t } from "../domain/i18n";

type Props = { family: Family; variant: AnyQuizVariant; region: RegionSelection; data: Legacy; options?: SessionOptions; onBack: () => void; supplies?: SupplyCounts };
type Choice = { id: string; label: string; flag?: string };
type WritingTarget = { id: string; pt?: string; en?: string; al?: string | string[]; cap?: string; fl?: string };

export function SpecialQuiz({ variant, region, data, options, onBack, onEnd, supplies = emptySupplyCounts() }: Props & { onEnd?: (result: SessionResult | null) => void }) {
  const settings = sessionSettings(options, variant);
  const { pace, roundLimit, timerSeconds } = settings;
  // Suprimentos de expedição só em Partida solo (nunca Treino/duelo/PvP, ver domain/supplies.ts).
  const suppliesEnabled = !settings.duel && !settings.pvp;
  const supply = useSupplies(supplies, suppliesEnabled);
  const [lupaHidden, setLupaHidden] = useState<Set<string>>(new Set());
  // Segunda chance: alternativas já tentadas (e erradas) / aviso de "tente de novo" na escrita; Escudo: o erro desta rodada foi coberto.
  const [triedWrong, setTriedWrong] = useState<ReadonlySet<string>>(new Set());
  const [retryNotice, setRetryNotice] = useState(false);
  const [shieldSaved, setShieldSaved] = useState(false);
  const [historical, setHistorical] = useState<HistoricalEntity[]>([]);
  const [languages, setLanguages] = useState<LanguageEntry[]>([]);
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [historicalFlags, setHistoricalFlags] = useState<FlagCatalog>({});
  const [error, setError] = useState("");
  const [target, setTarget] = useState<HistoricalEntity | LanguageEntry | WritingTarget | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const [answerResult, setAnswerResult] = useState<"correct" | "wrong" | "">("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [serial, setSerial] = useState(0);
  const [timedOutRound, setTimedOutRound] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const advance = useAdvance();
  const leaveGuard = useLeaveGuard(settings.pvp ? "pvp" : Boolean(settings.duel));
  const log = useRoundLog(settings.coinVariant ?? variant, pace);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedTarget = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const session = useRef<LearningSessionHandle | null>(null);
  const pendingSession = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsers = useRef(0);
  const started = useRef(0);
  const queuedRounds = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);
  const deck = useRef<ReturnType<typeof createFiniteDeck<any>> | null>(null);
  const deckKey = useRef("");
  const historicalMode = variant === "historica-nome" || variant === "nome-historica";
  const writing = variant === "escrita-pais" || variant === "escrita-capital";
  const languageName = variant === "idioma-nome";
  // Idiomas: o retorno traz um cartão de aprendizado (significado, onde é falado, quantos falam), então o prazo é maior.
  const richMode = !writing && !historicalMode;

  useEffect(() => {
    Promise.all([
      loadSpecialData(),
      historicalMode || writing ? loadFlags() : Promise.resolve({}),
    ]).then(([special, loadedFlags]) => {
      setHistorical(special.historical); setLanguages(special.languages); setFlags(loadedFlags);
      setHistoricalFlags(special.historicalFlags);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [historicalMode, writing]);

  useEffect(() => {
    if (!historical.length && !languages.length) return;
    strictUsers.current += 1;
    const handle = startLearningSession({
      family: writing ? "escrita" : historicalMode ? "historicas" : "idiomas",
      variant, region, persistProgress: writing,
      mode: writing ? "escr" : historicalMode ? (variant === "historica-nome" ? "bnhist" : "nbhist") : "idioma",
      subject: writing ? (variant === "escrita-capital" ? "capital" : "pais") : "",
      pace, roundLimit, timerSeconds,
      coinVariant: settings.coinVariant, duel: settings.duel, onRound: settings.onRound, coinFactor: settings.coinFactor,
    });
    pendingSession.current = handle;
    handle.then((value) => {
       if (strictUsers.current > 0) {
         session.current = value;
         for (const round of queuedRounds.current.splice(0)) value.recordRound(round);
       }
      else void value.end();
    }).catch(() => undefined);
    return () => {
      strictUsers.current -= 1;
      queueMicrotask(() => {
        if (strictUsers.current > 0) return;
        queuedRounds.current = [];
        const current = session.current;
        session.current = null;
        pendingSession.current = null;
        if (current) void current.end();
      });
    };
  }, [historical.length, languages.length, variant, region, writing, historicalMode, runKey]);

  const pool = useMemo(() => {
    if (writing) {
      return Object.entries(data.meta)
        .filter(([id, meta]) => !meta.absorvido && inRegion(id, region, data) && (variant === "escrita-pais" ? Boolean(meta.fl) : Boolean(meta.cap)))
        .map(([id, meta]) => ({ id, ...meta }));
    }
    return historicalMode ? historicalPool(historical, region) : languagePool(languages, region);
  }, [data, historical, languages, region, historicalMode, writing, variant]);

  const next = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const item = deck.current?.draw();
    if (!item) return;
    setTarget(item); setTyped(""); setFeedback(""); setAnswerResult(""); setSelectedChoice(""); setLocked(false); setTimedOutRound(false); setSerial((value) => value + 1); committedTarget.current = null; started.current = Date.now();
    setLupaHidden(new Set());
    setTriedWrong(new Set()); setRetryNotice(false); setShieldSaved(false);
    supply.resetRound();
    if (!writing) {
      const distractors = shuffleAnswerOptions(pool.filter((candidate) => candidate.id !== item.id)).slice(0, 3);
      setChoices(shuffleAnswerOptions([item, ...distractors].map((candidate) => ({
        id: candidate.id,
        label: "pt" in candidate ? candidate.pt ?? candidate.id : "idioma" in candidate && languageName ? candidate.idioma : "paises" in candidate ? candidate.paises : candidate.id,
        flag: "fl" in candidate ? candidate.fl : undefined,
      }))));
    }
    if (writing) requestAnimationFrame(() => inputRef.current?.focus());
  };
  useEffect(() => {
    if (pool.length >= 1) {
       const key = `${variant}|${JSON.stringify(region)}|${pool.map((item) => item.id).join("|")}`;
      if (deckKey.current === key) return;
      deckKey.current = key;
       deck.current = createFiniteDeck<any>(pool, deckSeedFor(seedFromParts(variant, JSON.stringify(region), pool.map((item) => item.id).join("|")), settings.deckSeed), roundLimit);
      next();
    }
  }, [pool, variant, region, runKey]);

  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    leaveGuard.noteAnswer();
    log.push({ correct: round.correct, tier: round.tier, shielded: round.shielded });
    if (session.current) session.current.recordRound(round);
    else queuedRounds.current.push(round);
  };
  // Texto da resposta certa: a capital na escrita de capitais, senão o nome (ou os países do idioma).
  const expectedLabel = (item: HistoricalEntity | LanguageEntry | WritingTarget) =>
    variant === "escrita-capital" ? ("cap" in item ? item.cap : "") : "pt" in item ? item.pt : "idioma" in item && languageName ? item.idioma : "paises" in item ? item.paises : item.id;
  const answer = (id: string, value: string, forcedCorrect?: boolean, timedOut = false) => {
    if (!target || locked || committedTarget.current === target.id) return;
    const correct = forcedCorrect ?? id === target.id;
    // Segunda chance: errou respondendo (o tempo acabar não vale): a rodada segue aberta. Nas alternativas a errada fica marcada; na escrita o campo limpa.
    if (!correct && !timedOut && supply.consumeArmed("retorno")) {
      if (writing) { setTyped(""); requestAnimationFrame(() => inputRef.current?.focus()); } else setTriedWrong((current) => new Set(current).add(id));
      setRetryNotice(true);
      return;
    }
    // Escudo: o erro não quebra a sequência nem pesa na partida (a rodada fica de fora da conta, ver spoils.ts).
    const shielded = !correct && supply.consumeArmed("escudo");
    setShieldSaved(shielded); setRetryNotice(false);
    setScore((current) => current + (correct ? 1 : 0));
    setStreak((current) => correct ? current + 1 : shielded ? current : 0);
    setSelectedChoice(id);
    committedTarget.current = target.id;
    if (correct && historicalMode) {
      void addHistoricalCollection(target.id, target);
    }
    setLocked(true); setTimedOutRound(timedOut); setAnswerResult(correct ? "correct" : "wrong"); setFeedback(correct ? t.common.correct : timedOut ? t.common.timeUp : t.common.wrong);
    recordRound({
      targetId: target.id, correct, responseTimeMs: Date.now() - started.current, answeredAt: Date.now(),
      tier: entityTier(data.meta, target.id),
      ...(timedOut ? { timedOut: true, ...(value ? { selectedId: value } : {}) } : { selectedId: value }),
      ...(supply.assisted || shielded ? { assisted: true } : {}),
      ...(shielded ? { shielded: true } : {}),
    });
    const exhausted = deck.current?.remaining === 0;
    advance.schedule(async () => {
      if (exhausted) await finishSession(true);
      else next();
    // Idiomas tem cartão para ler: só continua quando a pessoa confirmar (botão ou Enter), sem passar sozinho.
    }, feedbackHoldMs(correct, writing), feedbackSkipAfterMs(correct), richMode);
    if (correct) cueCorrect();
  };
  const submitWriting = (value = typed) => {
    if (!target || locked) return;
    const expected = variant === "escrita-capital" ? acceptedCapitalAnswers(data.meta[target.id] ?? {}) : acceptedWritingAnswers(data.meta[target.id] ?? {});
    const normalized = answerKey(value);
    if (!normalized) return;
    const correct = expected.some((item) => answerKey(item) === normalized);
    answer(target.id, value, correct);
  };
  // O tempo da pergunta acabou: conta como erro; na escrita, o que já estava digitado fica registrado.
  const timeUp = () => answer("", writing ? typed : "", false, true);
  // Lupa: esconde 2 alternativas erradas ao acaso (nunca a certa) — não existe na escrita, que não tem opções.
  const useLupa = () => {
    if (!target || locked || !supply.use("lupa")) return;
    const wrongIds = shuffleAnswerOptions(choices.filter((choice) => choice.id !== target.id).map((choice) => choice.id)).slice(0, LUPA_REMOVE_COUNT);
    setLupaHidden(new Set(wrongIds));
  };
  const visibleChoices = useMemo(() => choices.filter((choice) => !lupaHidden.has(choice.id)), [choices, lupaHidden]);
  // Pular: o alvo vai para o fim do baralho (sem contar acerto nem erro) e a próxima carta entra. Na última carta não há para onde mandar.
  const skipRound = () => {
    if (!target || locked || !deck.current || deck.current.remaining === 0 || !supply.use("pular")) return;
    deck.current.defer(target);
    next();
  };
  const useItem = (id: SupplyId) => { if (id === "pular") skipRound(); else if (id === "lupa") useLupa(); else supply.use(id); };
  // Baralho fechado (complete) ou "Encerrar sessão": ambos levam ao resultado, que mostra as moedas ganhas.
  const finishSession = async (complete = false) => {
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    let result: SessionResult | null = null;
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      result = await handle.end({ complete });
    }
    if (onEnd && (complete || result?.spoils)) onEnd(result);
    else onBack();
  };
  const finish = async () => {
    await finishSession();
  };
  const leaveToRecorte = async () => {
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      await handle.end({ complete: false });
    }
    onBack();
  };
  // Recomeçar: encerra a partida atual sem pagar nada e sorteia um baralho novo.
  const restart = async () => {
    advance.cancel();
    leaveGuard.reset();
    log.reset();
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      pendingSession.current = null;
      await handle.end({ complete: false });
    }
    setScore(0);
    setStreak(0);
    supply.clearArmed();
    deckKey.current = "";
    setRunKey((value) => value + 1);
  };
  const leaveToHome = async () => {
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      await handle.end({ complete: false });
    }
    location.href = "/";
  };
  useGameKeys({
    exit: () => leaveGuard.ask({ onLeave: () => void finish(), onRestart: () => void restart(), coins: log.pending, xp: deck.current?.size ?? pool.length }),
    choose: (index) => { if (writing || locked) return; const choice = visibleChoices[index]; if (choice && !triedWrong.has(choice.id)) answer(choice.id, choice.label); },
    enabled: Boolean(target),
  });
  if (error) return <div className="app-shell"><main className="content"><button className="back" onClick={finish}>{t.common.exitGame}</button><div className="diagnostic">{error}</div></main></div>;
  if (!target) return <div className="app-shell"><main className="content"><div className="eyebrow">{t.common.preparingCollection}</div><h1>{t.common.loadingMaterial}</h1></main></div>;
  const targetFlag = "fl" in target
    ? (historicalMode ? historicalFlags[target.fl?.toLowerCase() ?? ""] : flags[target.fl?.toLowerCase() ?? ""])
    : undefined;
  const totalRounds = deck.current?.size ?? pool.length;
  const exit = () => leaveGuard.ask({ onLeave: () => void finish(), onRestart: () => void restart(), coins: log.pending, xp: totalRounds });
  const stimulusText = "script" in target ? target.script : "pt" in target ? target.pt : "";
  const stimulus = writing && variant === "escrita-capital"
    ? <div className={bigClass(data.meta[target.id]?.pt)}>{data.meta[target.id]?.pt}</div>
    : writing
      ? <div className="gs-flag"><img src={targetFlag ? flagSource(targetFlag) : undefined} alt={t.common.flagStimulus} /></div>
      : historicalMode && variant === "historica-nome"
        ? <div className="gs-flag"><img src={targetFlag ? flagSource(targetFlag) : undefined} alt={t.common.historicalFlagStimulus} /></div>
        : <div className={"script" in target ? `gs-big script${(stimulusText?.length ?? 0) > 110 ? " xlong" : (stimulusText?.length ?? 0) > 60 ? " long" : ""}` : bigClass(stimulusText)}>{stimulusText}</div>;
  const kicker = writing
    ? (variant === "escrita-capital" ? t.quiz.whichCapital : t.quiz.whichCountryName)
    : historicalMode
      ? (variant === "historica-nome" ? t.quiz.whichEntityFlag : t.quiz.pickFlag)
      : languageName ? t.quiz.whichLanguage : t.quiz.whichCountriesLanguage;
  const flagOptions = variant === "nome-historica";
  const writingAnswers = variant === "escrita-capital" ? acceptedCapitalAnswers(data.meta[target.id] ?? {}) : acceptedWritingAnswers(data.meta[target.id] ?? {});
  return <div className="app-shell gs-app">{leaveGuard.dialog}
    <div className="gs">
      <GameTopBar results={log.results} total={totalRounds} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel(variant)} · ${regionLabel(region)}`}>
        <RoundTimer pausable={!settings.duel} seconds={timerSeconds} bonusSeconds={supply.bonusSeconds} running={!locked && !leaveGuard.asking} resetKey={serial} onExpire={timeUp} />
        {suppliesEnabled && (
          <SupplyTray timed={pace === "timed"}
            variant={variant}
            counts={supply.counts}
            usedThisRound={supply.usedThisRound}
            armed={supply.armed}
            onArm={supply.toggleArm}
            blocked={deck.current?.remaining === 0 ? new Set<SupplyId>(["pular"]) : undefined}
            disabled={locked}
            onUse={useItem}
          />
        )}
      </GameTopBar>
      <div className="gs-body">
        <main className="gs-stage" data-target-id={import.meta.env.DEV ? target.id : undefined}>
          <div className="gs-kicker">{kicker}</div>
          {stimulus}
          {writing && !answerResult && supply.usedThisRound.has("letra") && <div className="gs-letterhint" role="note" aria-label={t.supplies.letterAria}>{letterHint(String(expectedLabel(target)))}</div>}
          <div className={`gs-ribbon${retryNotice && !answerResult ? " on info" : answerResult ? ` on ${answerResult === "correct" ? "ok" : "no"}${shieldSaved ? " wrap" : ""}` : ""}`} role="status" aria-live="polite">
            {answerResult === "correct" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {answerResult ? (shieldSaved ? `${feedback} ${t.supplies.shieldSaved}` : feedback) : retryNotice ? t.supplies.retryNote : ""}
            {answerResult === "wrong" && <span className="sr-only">{t.common.rightAnswerIs(String(expectedLabel(target)))}</span>}
          </div>
          {answerResult && richMode && "script" in target && <LanguageCard entry={target as LanguageEntry} />}
        </main>
        <section className="gs-tray" aria-label={t.common.answersRegion}>
          {writing ? <>
            <form className="gs-field" onSubmit={(e) => { e.preventDefault(); submitWriting(); }}>
              <TypedAnswerInput key={target.id} className={answerResult === "correct" ? "answer-success" : answerResult === "wrong" ? "answer-error" : ""} inputRef={inputRef} aria-label={t.common.answerField} autoFocus value={typed} disabled={locked} onChange={setTyped} onCommit={submitWriting} answers={writingAnswers} />
              <button className="go" disabled={locked || !typed.trim()}>{t.common.answer}</button>
            </form>
            {answerResult
              ? <AnswerReveal verdict={answerResult} expected={String(expectedLabel(target))} typed={typed} timedOut={timedOutRound} />
              : <div className="gs-hintline">{t.common.typingHint}</div>}
            {answerResult === "wrong" && <ContinueBar holdMs={feedbackHoldMs(false, true)} onSkip={advance.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>Enter</kbd> {t.common.keyAnswerContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </> : <>
            <div className={`quiz-options gs-opts${flagOptions ? " flags" : ""}`}>{visibleChoices.map((choice, index) => {
              const historicalFlag = choice.flag ? historicalFlags[choice.flag.toLowerCase()] : undefined;
              return <button key={choice.id} data-option-id={choice.id} className={`${triedWrong.has(choice.id) && !answerResult ? "quiz-option wrong is-tried" : optionClass(choice.id === target.id, choice.id === selectedChoice, answerResult)} gs-opt`} aria-invalid={locked && choice.id === selectedChoice && answerResult === "wrong" ? true : undefined} disabled={locked || triedWrong.has(choice.id)} onClick={() => answer(choice.id, choice.label)}>
                <span className="gs-key" aria-hidden="true">{index + 1}</span>
                {variant === "nome-historica" && historicalFlag ? <OptionFlag src={flagSource(historicalFlag)} alt={t.common.historicalFlagOption} /> : <span className="gs-opt-label">{choice.label}</span>}
                <OptionMarks isTarget={choice.id === target.id} isPicked={choice.id === selectedChoice} verdict={answerResult} />
                {triedWrong.has(choice.id) && !answerResult && <><span className="opt-mark opt-mark-miss" aria-hidden="true">✕</span><span className="sr-only">{t.feedback.wrongPickSr}</span></>}
              </button>;
            })}</div>
            {answerResult && (richMode || answerResult === "wrong") && <ContinueBar holdMs={richMode ? null : feedbackHoldMs(false, false)} onSkip={advance.skip} />}
            <div className="gs-keys" aria-hidden="true"><span><kbd>1</kbd>–<kbd>4</kbd> {t.common.keyChoose}</span><span><kbd>Enter</kbd> {t.common.keyContinue}</span><span><kbd>Esc</kbd> {t.common.keyExit}</span></div>
          </>}
        </section>
      </div>
    </div>
  </div>;
}

/** Depois de responder em Idiomas: o que a frase quer dizer, como se lê, onde o idioma é falado e quantos falam. */
function LanguageCard({ entry }: { entry: LanguageEntry }) {
  // A posição vem com notas entre parênteses em alguns idiomas; no cartão fica só a frase curta.
  const rank = entry.ranking?.replace(/\s*\([^)]*\)\s*$/, "");
  return <section className="gs-lang" aria-label={t.language.about(entry.idioma)}>
    <div className="gs-lang-head"><b>{entry.idioma}</b>{rank && <span>{rank}</span>}</div>
    {entry.translit && <em>{entry.translit}</em>}
    {entry.significado && <p>“{entry.significado}”</p>}
    <dl>
      <div><dt>{t.language.spokenIn}</dt><dd>{entry.paises}</dd></div>
      {entry.tambem && <div><dt>{t.language.alsoOfficial}</dt><dd>{entry.tambem}</dd></div>}
      {entry.falantes && <div><dt>{t.language.speakers}</dt><dd>{entry.falantes}</dd></div>}
    </dl>
  </section>;
}
