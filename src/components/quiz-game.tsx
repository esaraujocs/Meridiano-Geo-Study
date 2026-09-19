import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { inRegion } from "../domain/regions";
import { regionLabel } from "../domain/regions";
import { flagSource, loadFlags, quizPool, type FlagCatalog } from "../domain/quiz";
import type { Family, Legacy, QuizVariant, RegionSelection } from "../domain/types";
import {
  startLearningSession,
  type LearningSessionHandle,
} from "../domain/learning-store";
import { createFiniteDeck, seedFromParts, shuffleSeeded } from "../domain/finite-deck";

type Question = { target: string; options: string[] };

function shuffled<T>(items: T[]) {
  return shuffleSeeded(items, seedFromParts(items.map(String).join("|")));
}

export function QuizGame({
  data,
  family,
  variant,
  region,
  onBack,
  onEnd,
}: {
  data: Legacy;
  family: Extract<Family, "bandeiras" | "capitais">;
  variant: Exclude<QuizVariant, "mapa">;
  region: RegionSelection;
  onBack: () => void;
  onEnd?: () => void;
}) {
  const [flags, setFlags] = useState<FlagCatalog | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "">("");
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(0);
  const timer = useRef<number | null>(null);
  const targetStartedAtRef = useRef(0);
  const sessionRef = useRef<LearningSessionHandle | null>(null);
  const pendingSessionRef = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsersRef = useRef(0);
  const queuedRoundsRef = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);
  const deckRef = useRef<ReturnType<typeof createFiniteDeck<string>> | null>(null);

  const openSession = () => {
    const pending = startLearningSession({ family, variant, region });
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
  const leaveSession = async (home = false) => {
    const handle =
      sessionRef.current ??
      (await pendingSessionRef.current?.catch(() => null));
    sessionRef.current = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      await handle.end({ complete: false });
    }
    if (home) location.href = "/";
    else onBack();
  };
  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    if (sessionRef.current) sessionRef.current.recordRound(round);
    else queuedRoundsRef.current.push(round);
  };
  const finishSession = async () => {
    const handle = sessionRef.current ?? await pendingSessionRef.current?.catch(() => null);
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      await handle.finish();
    }
    (onEnd ?? onBack)();
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
    const options = shuffled([
      targetId,
      ...shuffled(pool.filter((id) => id !== targetId)).slice(0, 3),
    ]);
    setTarget(targetId);
    setRound(pool.length - deck.remaining);
    targetStartedAtRef.current = Date.now();
    setQuestion({ target: targetId, options });
    setFeedback("");
    setSelected("");
  };

  useEffect(() => {
    if (pool.length >= 4) {
      deckRef.current = createFiniteDeck(pool, seedFromParts(family, variant, JSON.stringify(region), pool.join("|")) ^ Math.floor(Math.random() * 0x100000000));
      nextQuestion();
    }
  }, [pool]);

  const answer = (id: string) => {
    if (!question || feedback) return;
    const correct = id === question.target;
    recordRound({
      targetId: question.target,
      correct,
      responseTimeMs: Math.max(0, Date.now() - targetStartedAtRef.current),
      answeredAt: Date.now(),
      selectedId: id,
    });
    setSelected(id);
    setFeedback(correct ? "correct" : "wrong");
    setScore((value) => value + (correct ? 1 : 0));
    setStreak((value) => (correct ? value + 1 : 0));
    const exhausted = deckRef.current?.remaining === 0;
    timer.current = window.setTimeout(async () => {
      if (exhausted) {
        await finishSession();
      } else {
        nextQuestion();
      }
    }, correct ? 350 : 1400);
  };
  const restart = () => {
    if (timer.current) window.clearTimeout(timer.current);
    const previous = sessionRef.current;
    sessionRef.current = null;
    pendingSessionRef.current = null;
    if (previous) void previous.end();
    openSession();
    setScore(0);
    setStreak(0);
    setRound(0);
    nextQuestion();
  };

  const title = family === "bandeiras" ? "Reconheça a resposta." : "Recupere a resposta.";
  const targetMeta = data.meta[target];
  const isFlagPrompt = variant === "bandeira-nome";
  const titleFor = (id: string) => data.meta[id]?.pt ?? id;
  const valueFor = (id: string) =>
    variant === "pais-capital" ? data.meta[id]?.cap ?? "" : titleFor(id);
  const correctAnswer =
    variant === "pais-capital"
      ? valueFor(question?.target ?? target)
      : titleFor(question?.target ?? target);
  const feedbackText =
    feedback === "correct"
      ? "Acerto. A resposta foi registrada."
      : feedback === "wrong"
        ? `Ainda não. A resposta correta é ${correctAnswer}.`
        : "Selecione uma resposta.";

  if (error) {
    return (
      <div className="app-shell">
        <main className="content">
          <button className="back" onClick={() => void leaveSession()}>← Encerrar sessão</button>
          <div className="diagnostic" style={{ marginTop: 32 }}>
            <div className="eyebrow">Quiz indisponível</div>
            <p><strong>Não foi possível carregar este material.</strong></p>
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
          <button className="back" onClick={() => void leaveSession()}>← Encerrar sessão</button>
          <div className="eyebrow" style={{ marginTop: 32 }}>Preparando sessão</div>
          <h1 style={{ marginTop: 18 }}>{family === "bandeiras" ? "Carregando bandeiras." : "Carregando capitais."}</h1>
          <p className="lede">Montando um baralho de quatro alternativas.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="quiz-stage">
        <aside className="quiz-panel">
           <button className="back" onClick={() => void leaveSession()}>← Encerrar sessão</button>
          <div className="eyebrow">{regionLabel(region)}</div>
          <h1>{title}</h1>
          <div className="score-box">
            <div><span>progresso</span><b>{round}/{pool.length}</b></div>
            <div><span>acertos</span><b>{score}</b></div>
            <div><span>sequência</span><b>{streak}</b></div>
          </div>
           <details className="hud-overflow"><summary aria-label="Mais ações">⋯</summary><div><button type="button" onClick={restart}>Recomeçar</button><button type="button" onClick={() => void leaveSession()}>Voltar ao recorte</button><button type="button" onClick={() => void leaveSession(true)}>Início</button></div></details>
        </aside>
        <main className="quiz-main">
          <div className="quiz-prompt">
            <div className="target-kicker">{isFlagPrompt ? "Qual país usa esta bandeira?" : variant === "nome-bandeira" ? "Escolha a bandeira correta" : variant === "capital-pais" ? "A qual país pertence esta capital?" : "Qual é a capital deste país?"}</div>
            {isFlagPrompt && targetMeta?.fl && flags?.[targetMeta.fl.toLowerCase()] ? (
              <img
                className="quiz-flag"
                src={flagSource(flags[targetMeta.fl.toLowerCase()])}
                alt="Bandeira apresentada como estímulo visual"
              />
            ) : (
              <div className="quiz-clue">{variant === "capital-pais" ? targetMeta?.cap : titleFor(target)}</div>
            )}
            <div className={feedback ? `feedback ${feedback === "wrong" ? "bad" : ""}` : "feedback"} aria-live="polite" role="status">
              {feedbackText}
            </div>
          </div>
          <div className="quiz-options">
            {question.options.map((id) => (
              <button
                key={id}
                className={`quiz-option ${feedback && id === question.target ? "correct" : ""} ${feedback === "wrong" && id === selected ? "wrong" : ""}`}
                disabled={Boolean(feedback)}
                aria-pressed={selected === id}
                onClick={() => answer(id)}
              >
                {variant === "nome-bandeira" ? (
                  data.meta[id]?.fl && flags?.[data.meta[id].fl.toLowerCase()] ? (
                    <img
                      src={flagSource(flags[data.meta[id].fl.toLowerCase()])}
                      alt="Alternativa visual de bandeira"
                    />
                  ) : (
                    titleFor(id)
                  )
                ) : valueFor(id)}
                 {feedback && id === question.target && <span aria-label="Resposta correta"> Acerto</span>}
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}