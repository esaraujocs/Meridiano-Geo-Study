import { useEffect, useMemo, useRef, useState } from "react";
import { flagSource, loadFlags, type FlagCatalog } from "../domain/quiz";
import { acceptedWritingAnswers, historicalPool, languagePool, loadSpecialData, normalizeAnswer, type HistoricalEntity, type LanguageEntry } from "../domain/special-data";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";
import type { AnyQuizVariant, Family, Legacy, Region } from "../domain/types";
import { inRegion } from "../domain/regions";
import { addHistoricalCollection } from "../domain/progress-surfaces";

type Props = { family: Family; variant: AnyQuizVariant; region: Region; data: Legacy; onBack: () => void };
type Choice = { id: string; label: string; flag?: string };
type WritingTarget = { id: string; pt?: string; en?: string; al?: string | string[]; cap?: string; fl?: string };

function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - .5); }

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
  const [locked, setLocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedTarget = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const session = useRef<LearningSessionHandle | null>(null);
  const pendingSession = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsers = useRef(0);
  const started = useRef(0);
  const queuedRounds = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);
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
    if (pool.length < 4) return;
    const item = pool[Math.floor(Math.random() * pool.length)];
    setTarget(item); setTyped(""); setFeedback(""); setLocked(false); committedTarget.current = null; started.current = Date.now();
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
  useEffect(() => { next(); }, [pool.length, variant]);

  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    if (session.current) session.current.recordRound(round);
    else queuedRounds.current.push(round);
  };
  const answer = (id: string, value: string, forcedCorrect?: boolean) => {
    if (!target || locked || committedTarget.current === target.id) return;
    const correct = forcedCorrect ?? id === target.id;
    committedTarget.current = target.id;
    if (correct && historicalMode) {
      void addHistoricalCollection(target.id, target);
    }
    setLocked(true); setFeedback(correct ? "Acerto. A resposta foi registrada." : `Ainda não. A resposta correta é ${"pt" in target ? target.pt : "paises" in target ? target.paises : target.id}.`);
    recordRound({ targetId: target.id, correct, responseTimeMs: Date.now() - started.current, answeredAt: Date.now(), selectedId: value });
    timer.current = window.setTimeout(next, correct ? 650 : 1400);
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
  const finish = async () => {
    const handle = session.current ?? (await pendingSession.current?.catch(() => null));
    session.current = null;
    if (handle) await handle.finish();
    (onEnd ?? onBack)();
  };
  if (error) return <div className="app-shell"><main className="content"><button className="back" onClick={finish}>← Encerrar sessão</button><div className="diagnostic">{error}</div></main></div>;
  if (!target) return <div className="app-shell"><main className="content"><div className="eyebrow">Preparando acervo</div><h1>Carregando material.</h1></main></div>;
  const targetFlag = "fl" in target
    ? (historicalMode ? historicalFlags[target.fl?.toLowerCase() ?? ""] : flags[target.fl?.toLowerCase() ?? ""])
    : undefined;
  return <div className="app-shell"><div className="quiz-stage"><aside className="quiz-panel">
     <button className="back" onClick={finish}>← Encerrar sessão</button>
    <div className="eyebrow" style={{ marginTop: 28 }}>Sessão · {historicalMode ? "Históricas" : writing ? "Escrita" : "Idiomas"}</div>
    <h1>{writing ? "Escreva a resposta." : historicalMode ? "Reconheça a bandeira." : "Leia o idioma."}</h1>
  </aside><main className="quiz-main">
    <div className="quiz-prompt"><div className="target-kicker">{writing ? (variant === "escrita-capital" ? "Qual é a capital deste país?" : "Qual é o nome deste país?") : historicalMode ? (variant === "historica-nome" ? "Qual entidade usava esta bandeira?" : "Escolha a bandeira correta") : "A que países este idioma está ligado?"}</div>
      {writing && variant === "escrita-capital" ? <div className="quiz-clue">{data.meta[target.id]?.pt}</div> : writing ? <img className="quiz-flag" src={targetFlag ? flagSource(targetFlag) : undefined} alt="Bandeira apresentada como estímulo visual" /> : historicalMode && variant === "historica-nome" ? <img className="quiz-flag" src={targetFlag ? flagSource(targetFlag) : undefined} alt="Bandeira histórica apresentada como estímulo visual" /> : <div className="quiz-clue">{("script" in target ? target.script : target.pt)}</div>}
      <div className="feedback" aria-live="polite" role="status">{feedback || "Escolha uma alternativa."}</div>
    </div>
     {writing ? <form className="quiz-options" onSubmit={(e) => { e.preventDefault(); submitWriting(); }}><input ref={inputRef} aria-label="Resposta" autoFocus value={typed} disabled={locked} onChange={(e) => {
       const value = e.target.value;
       setTyped(value);
       const normalized = normalizeAnswer(value);
       if (!normalized || !target || locked) return;
       const expected = variant === "escrita-capital" ? ("cap" in target ? target.cap : "") : acceptedWritingAnswers(data.meta[target.id] ?? {});
       const correct = Array.isArray(expected) ? expected.includes(normalized) : normalized === normalizeAnswer(expected as string);
       if (correct) submitWriting(value);
     }} onBlur={() => { if (!locked && normalizeAnswer(typed)) submitWriting(); }} /><button className="button" disabled={locked || !typed.trim()}>Responder</button></form> : <div className="quiz-options">{choices.map((choice) => {
      const historicalFlag = choice.flag
        ? historicalFlags[choice.flag.toLowerCase()]
        : undefined;
      return <button key={choice.id} className={`quiz-option ${locked && choice.id === target.id ? "correct" : ""}`} disabled={locked} onClick={() => answer(choice.id, choice.label)}>{variant === "nome-historica" && historicalFlag ? <img src={flagSource(historicalFlag)} alt="Alternativa visual de bandeira histórica" /> : choice.label}</button>;
    })}</div>}
  </main></div></div>;
}