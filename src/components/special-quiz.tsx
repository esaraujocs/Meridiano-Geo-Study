import { useEffect, useMemo, useRef, useState } from "react";
import { flagSource, loadFlags, type FlagCatalog } from "../domain/quiz";
import { acceptedWritingAnswers, historicalPool, languagePool, loadSpecialData, normalizeAnswer, type HistoricalEntity, type LanguageEntry } from "../domain/special-data";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";
import type { AnyQuizVariant, Family, Legacy, Region } from "../domain/types";
import { inRegion } from "../domain/regions";
import { addHistoricalCollection } from "../domain/progress-surfaces";
import { createFiniteDeck, seedFromParts, shuffleSeeded } from "../domain/finite-deck";
import { TypedAnswerInput } from "./typed-answer-input";

type Props = { family: Family; variant: AnyQuizVariant; region: Region; data: Legacy; onBack: () => void };
type Choice = { id: string; label: string; flag?: string };
type WritingTarget = { id: string; pt?: string; en?: string; al?: string | string[]; cap?: string; fl?: string };

function shuffle<T>(items: T[]) { return shuffleSeeded(items, seedFromParts(items.map(String).join("|"))); }

export function SpecialQuiz({ variant, region, data, onBack, onEnd }: Props & { onEnd?: () => void }) {
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
  }, [historical.length, languages.length, variant, region, writing, historicalMode]);

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
    setTarget(item); setTyped(""); setFeedback(""); setAnswerResult(""); setSelectedChoice(""); setLocked(false); committedTarget.current = null; started.current = Date.now();
    if (!writing) {
      const distractors = shuffle(pool.filter((candidate) => candidate.id !== item.id)).slice(0, 3);
      setChoices(shuffle([item, ...distractors].map((candidate) => ({
        id: candidate.id,
        label: "pt" in candidate ? candidate.pt ?? candidate.id : "paises" in candidate ? candidate.paises : candidate.id,
        flag: "fl" in candidate ? candidate.fl : undefined,
      }))));
    }
    if (writing) requestAnimationFrame(() => inputRef.current?.focus());
  };
  useEffect(() => {
    if (pool.length >= 1) {
      const key = `${variant}|${region}|${pool.map((item) => item.id).join("|")}`;
      if (deckKey.current === key) return;
      deckKey.current = key;
      deck.current = createFiniteDeck<any>(pool, seedFromParts(variant, region, pool.map((item) => item.id).join("|")) ^ Math.floor(Math.random() * 0x100000000));
      next();
    }
  }, [pool, variant, region]);

  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    if (session.current) session.current.recordRound(round);
    else queuedRounds.current.push(round);
  };
  const answer = (id: string, value: string, forcedCorrect?: boolean) => {
    if (!target || locked || committedTarget.current === target.id) return;
    const correct = forcedCorrect ?? id === target.id;
    setScore((current) => current + (correct ? 1 : 0));
    setStreak((current) => correct ? current + 1 : 0);
    setSelectedChoice(id);
    committedTarget.current = target.id;
    if (correct && historicalMode) {
      void addHistoricalCollection(target.id, target);
    }
    setLocked(true); setAnswerResult(correct ? "correct" : "wrong"); setFeedback(correct ? "Acerto. A resposta foi registrada." : `Ainda não. A resposta correta é ${"pt" in target ? target.pt : "paises" in target ? target.paises : target.id}.`);
    recordRound({ targetId: target.id, correct, responseTimeMs: Date.now() - started.current, answeredAt: Date.now(), selectedId: value });
    const exhausted = deck.current?.remaining === 0;
    timer.current = window.setTimeout(async () => {
      if (exhausted) {
        await finishSession(true);
      } else next();
    }, correct ? 350 : 1400);
  };
  const submitWriting = (value = typed) => {
    if (!target || locked) return;
    const expected = variant === "escrita-capital" ? ("cap" in target ? target.cap : "") : acceptedWritingAnswers(data.meta[target.id] ?? {});
    const normalized = normalizeAnswer(value);
    if (!normalized) return;
    const correct = Array.isArray(expected) ? expected.includes(normalized) : normalized === normalizeAnswer(expected as string);
    answer(target.id, value, correct);
    if (!correct) setFeedback(`Ainda não. A resposta correta é ${variant === "escrita-capital" ? expected : ("pt" in target ? target.pt : target.id)}.`);
  };
  const finishSession = async (complete = false) => {
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      await handle.end({ complete });
    }
    (onEnd ?? onBack)();
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
  const leaveToHome = async () => {
    const handle = session.current ?? await pendingSession.current?.catch(() => null);
    if (handle) {
      for (const round of queuedRounds.current.splice(0)) handle.recordRound(round);
      session.current = null;
      await handle.end({ complete: false });
    }
    location.href = "/";
  };
  if (error) return <div className="app-shell"><main className="content"><button className="back" onClick={finish}>← Encerrar sessão</button><div className="diagnostic">{error}</div></main></div>;
  if (!target) return <div className="app-shell"><main className="content"><div className="eyebrow">Preparando acervo</div><h1>Carregando material.</h1></main></div>;
  const targetFlag = "fl" in target
    ? (historicalMode ? historicalFlags[target.fl?.toLowerCase() ?? ""] : flags[target.fl?.toLowerCase() ?? ""])
    : undefined;
  return <div className="app-shell"><div className="quiz-stage"><aside className="quiz-panel">
     <button className="back" onClick={finish}>← Encerrar sessão</button>
    <div className="eyebrow">{historicalMode ? "Históricas" : writing ? "Escrita" : "Idiomas"}</div>
    <div className="score-box"><div><span>progresso</span><b>{pool.length - (deck.current?.remaining ?? pool.length)}/{pool.length}</b></div><div><span>acertos</span><b>{score}</b></div><div><span>sequência</span><b>{streak}</b></div></div>
    <details className="hud-overflow"><summary aria-label="Mais ações">⋯</summary><div><button type="button" onClick={() => void leaveToRecorte()}>Voltar ao recorte</button><button type="button" onClick={() => void leaveToHome()}>Início</button></div></details>
  </aside><main className="quiz-main">
    <div className="quiz-prompt"><div className="target-kicker">{writing ? (variant === "escrita-capital" ? "Qual é a capital deste país?" : "Qual é o nome deste país?") : historicalMode ? (variant === "historica-nome" ? "Qual entidade usava esta bandeira?" : "Escolha a bandeira correta") : "A que países este idioma está ligado?"}</div>
      {writing && variant === "escrita-capital" ? <div className="quiz-clue">{data.meta[target.id]?.pt}</div> : writing ? <img className="quiz-flag" src={targetFlag ? flagSource(targetFlag) : undefined} alt="Bandeira apresentada como estímulo visual" /> : historicalMode && variant === "historica-nome" ? <img className="quiz-flag" src={targetFlag ? flagSource(targetFlag) : undefined} alt="Bandeira histórica apresentada como estímulo visual" /> : <div className="quiz-clue">{("script" in target ? target.script : target.pt)}</div>}
        <div className={`feedback ${answerResult === "correct" ? "feedback-success" : answerResult === "wrong" ? "feedback-error" : ""}`} aria-live="polite" role="status">{feedback || (writing ? (variant === "escrita-capital" ? "Digite o nome da capital." : "Digite o nome do país.") : historicalMode ? "Selecione uma resposta." : "Leia o idioma e responda.")}</div>
    </div>
      {writing ? <form className="quiz-options" onSubmit={(e) => { e.preventDefault(); submitWriting(); }}><TypedAnswerInput key={target.id} className={answerResult === "correct" ? "answer-success" : answerResult === "wrong" ? "answer-error" : ""} inputRef={inputRef} aria-label="Resposta" autoFocus value={typed} disabled={locked} onChange={setTyped} onCommit={submitWriting} answers={(() => { const expected = variant === "escrita-capital" ? ("cap" in target ? target.cap : "") : acceptedWritingAnswers(data.meta[target.id] ?? {}); return (Array.isArray(expected) ? expected : [expected]).filter((answer): answer is string => Boolean(answer)); })()} /><button className="button" disabled={locked || !typed.trim()}>Responder</button></form> : <div className="quiz-options">{choices.map((choice) => {
      const historicalFlag = choice.flag
        ? historicalFlags[choice.flag.toLowerCase()]
        : undefined;
       return <button key={choice.id} className={`quiz-option ${locked && choice.id === target.id ? "correct" : ""} ${locked && choice.id === selectedChoice && answerResult === "wrong" ? "wrong" : ""}`} aria-invalid={locked && choice.id === selectedChoice && answerResult === "wrong" ? true : undefined} disabled={locked} onClick={() => answer(choice.id, choice.label)}>{variant === "nome-historica" && historicalFlag ? <img src={flagSource(historicalFlag)} alt="Alternativa visual de bandeira histórica" /> : choice.label}</button>;
    })}</div>}
  </main></div></div>;
}