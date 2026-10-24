// Desafios (23/10/2026): a lista dos desafios (o do dia em destaque, os 21 por degrau e recorte, com o recorde e a medalha) e a tabela no estilo do
// JetPunk: digitar o nome de um país abre a linha dele; nas linhas abertas cada célula só aceita a resposta daquele país e fecha sozinha ao acertar.
// Contra o relógio; ao acabar o tempo, desistir ou completar, o que faltou aparece em vermelho e a tentativa é gravada (o recorde sai delas).
import { useEffect, useMemo, useRef, useState } from "react";
import { compareText, formatNumber, t } from "../domain/i18n";
import { locale } from "../domain/i18n/locale";
import {
  CHALLENGE_SCOPES, CHALLENGE_TIERS, bestRun, buildChallenge, cellId, challengeById, dailyChallenge, continuesAnswer, matchAnswer, medalOf,
  type AnswerMatch, type ChallengeBoard, type ChallengeCell, type ChallengeColumn, type ChallengeDef, type ChallengeEnd, type ChallengeRow, type ChallengeRun, type Medal,
} from "../domain/challenges";
import { listChallengeRuns, saveChallengeRun, type SavedChallengeRun } from "../domain/challenges-store";
import { answerKey } from "../domain/typed-answer";
import type { PeoplesFile } from "../domain/peoples";
import type { Legacy } from "../domain/types";
import { Icon } from "./icons";
import { ScreenBar } from "./screen-bar";

let peoplesFile: Promise<PeoplesFile> | null = null;
const loadPeoplesFile = () => (peoplesFile ??= fetch("/data/peoples.json").then((response) => {
  if (!response.ok) throw new Error(`peoples.json: ${response.status}`);
  return response.json() as Promise<PeoplesFile>;
}).catch((error) => { peoplesFile = null; throw error; }));

export const challengeName = (def: ChallengeDef) => t.challenges.name(def.tier, def.scope, t.challenges.scopes[def.scope]);
const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const pct = (run: Pick<ChallengeRun, "correct" | "total">) => Math.floor((run.correct / run.total) * 100);

function MedalBadge({ medal }: { medal: Medal }) {
  if (!medal) return null;
  return <span className="ch-medal" data-medal={medal} title={t.challenges.medals[medal]}><span className="sr-only">{t.challenges.medals[medal]}</span></span>;
}

export function ChallengesScreen({ data, balance, startWith, onBack, onPlaying, onRunSaved }: {
  data: Legacy;
  balance: number;
  /** Abrir direto num desafio (o do dia, pelo Hub). */
  startWith?: string | null;
  onBack: () => void;
  /** Durante a partida a tela some com a barra do app (sair do meio é desistir). */
  onPlaying: (playing: boolean) => void;
  onRunSaved?: () => void;
}) {
  const [peoples, setPeoples] = useState<PeoplesFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [runs, setRuns] = useState<ChallengeRun[]>([]);
  const [open, setOpen] = useState<string | null>(startWith ?? null);
  useEffect(() => { loadPeoplesFile().then(setPeoples, () => setFailed(true)); }, []);
  const refreshRuns = () => { void listChallengeRuns().then(setRuns, () => undefined); };
  useEffect(refreshRuns, []);
  const boards = useMemo(() => peoples ? new Map(CHALLENGE_TIERS.flatMap((tier) => CHALLENGE_SCOPES.map((scope) => {
    const def = challengeById(`${tier}-${scope}`)!;
    return [def.id, buildChallenge(def, data.meta, peoples, locale, compareText)] as const;
  }))) : null, [peoples, data]);
  const bestOf = (id: string) => bestRun(runs.filter((run) => run.challenge === id));

  const board = open ? boards?.get(open) : null;
  if (open && board) {
    return <ChallengePlay key={open} board={board} best={bestOf(open)} onExit={() => { setOpen(null); onPlaying(false); }} onPlaying={onPlaying}
      onSaved={() => { refreshRuns(); onRunSaved?.(); }} />;
  }
  const daily = dailyChallenge();
  const dailyBoard = boards?.get(daily.id);
  const played = new Set(runs.map((run) => run.challenge)).size;
  return <div className="st ch">
    <ScreenBar onBack={onBack} eyebrow={t.challenges.eyebrow} title={t.challenges.title} balance={balance} />
    {failed && <p className="ch-error" role="alert">{t.map.loadFailed}</p>}
    <section className="ch-daily" aria-label={t.challenges.daily}>
      <span className="ch-daily-ic" aria-hidden="true"><Icon type="arches" size={30} /></span>
      <div className="ch-daily-copy">
        <small>{t.challenges.daily}</small>
        <h2>{challengeName(daily)}</h2>
        <p>{t.challenges.tierHints[daily.tier]}{dailyBoard ? ` · ${t.challenges.duration(dailyBoard.seconds)} · ${t.challenges.answers(dailyBoard.total)}` : ""}</p>
      </div>
      <RecordBox run={bestOf(daily.id)} />
      <button type="button" className="ch-go" disabled={!dailyBoard} onClick={() => setOpen(daily.id)}><Icon type="arches" size={16} /> {t.hub.challengesGo}</button>
    </section>
    <p className="ch-played">{t.challenges.played(played, boards?.size ?? 21)} · {t.challenges.medalRule}</p>
    {CHALLENGE_TIERS.map((tier) => <section key={tier} className="ch-tier" aria-labelledby={`ch-tier-${tier}`}>
      <header><h2 id={`ch-tier-${tier}`}>{t.challenges.tiers[tier]}</h2><p>{t.challenges.tierHints[tier]}</p></header>
      <div className="ch-grid">
        {CHALLENGE_SCOPES.map((scope) => {
          const id = `${tier}-${scope}`;
          const item = boards?.get(id);
          const best = bestOf(id);
          return <button type="button" key={id} className={`ch-card${scope === "mundo" ? " is-world" : ""}`} disabled={!item} onClick={() => setOpen(id)}>
            <span className="ch-card-top"><b>{t.challenges.scopes[scope]}</b><MedalBadge medal={medalOf(best)} /></span>
            <small>{item ? `${t.challenges.duration(item.seconds)} · ${t.challenges.answers(item.total)}` : "…"}</small>
            <em>{best ? `${pct(best)}%` : t.challenges.noRecord}</em>
          </button>;
        })}
      </div>
    </section>)}
  </div>;
}

function RecordBox({ run }: { run: ChallengeRun | null }) {
  return <div className="ch-record">
    <small>{t.challenges.record}</small>
    <b>{run ? `${pct(run)}%` : "—"}</b>
    {run && <span>{clock(run.ms)}</span>}
  </div>;
}

type Phase = "ready" | "playing" | "done";

function ChallengePlay({ board, best, onExit, onPlaying, onSaved }: {
  board: ChallengeBoard; best: ChallengeRun | null; onExit: () => void; onPlaying: (playing: boolean) => void; onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());
  // a linha da última resposta: é para ela que vai a resposta que vale para vários países (euro, espanhol)
  const [current, setCurrent] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<{ kind: "wait"; answer: string; column: ChallengeColumn } | { kind: "ambiguous" } | null>(null);
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [end, setEnd] = useState<{ kind: ChallengeEnd; ms: number; record: boolean } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [reward, setReward] = useState<SavedChallengeRun | null>(null);
  const mainRef = useRef<HTMLInputElement>(null);
  const focusMain = useRef(false);
  const rows = useMemo(() => new Map(board.groups.flatMap((group) => group.rows.map((row) => [row.id, row] as const))), [board]);
  // o país "abre" (conta como encontrado) quando o nome dele foi escrito
  const found = useMemo(() => new Set([...rows.keys()].filter((id) => solved.has(cellId(id, "nome")))), [rows, solved]);
  const single = board.columns.length === 1;
  const limit = board.seconds * 1000;
  const left = phase === "playing" ? limit - (now - startedAt) : phase === "ready" ? limit : limit - (end?.ms ?? 0);

  const ended = useRef(false);
  const finish = (kind: ChallengeEnd, solvedNow: ReadonlySet<string>) => {
    if (ended.current) return;
    ended.current = true;
    const ms = Math.min(limit, Date.now() - startedAt);
    const correct = solvedNow.size;
    const previous = best ? best.correct / best.total : -1;
    const record = correct / board.total > previous || (correct / board.total === previous && best !== null && ms < best.ms);
    setEnd({ kind, ms, record: record && correct > 0 });
    setPhase("done");
    setHint(null);
    onPlaying(false);
    const missed = board.groups.flatMap((group) => group.rows.flatMap((row) => row.cells.map((cell) => cellId(row.id, cell.column)))).filter((id) => !solvedNow.has(id));
    void saveChallengeRun(board.def.id, { correct, total: board.total, ms, end: kind, missed }).then((run) => { setReward(run); onSaved(); }, () => undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // o relógio: 4 vezes por segundo; acabou o tempo, acabou o desafio
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const moment = Date.now();
      setNow(moment);
      if (moment - startedAt >= limit) finish("time", solvedRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);
  const solvedRef = useRef(solved);
  solvedRef.current = solved;
  useEffect(() => () => onPlaying(false), []);
  useEffect(() => {
    if (!focusMain.current) return;
    focusMain.current = false;
    mainRef.current?.focus();
  });

  const start = () => {
    ended.current = false;
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
    setPhase("playing");
    onPlaying(true);
    focusMain.current = true;
  };
  // o que acabou de entrar: se a próxima tecla, somada a ele, ainda vira uma resposta ("Brasil" + "ia" → Brasília, "Mali" + "ano" → maliano) ou a
  // forma longa dele ("real" + " brasileiro", "Estados Unidos" + " da América"), o campo retoma o texto inteiro
  const carry = useRef<{ text: string; keys: ReadonlySet<string> } | null>(null);
  const commit = (match: AnswerMatch, value: string) => {
    if (!match.cell || !match.row) return;
    const row = rows.get(match.row)!;
    const cell = row.cells.find((item) => cellId(row.id, item.column) === match.cell)!;
    const next = new Set(solved).add(match.cell);
    setSolved(next);
    setCurrent(row.id);
    setTyped("");
    setHint(null);
    carry.current = { text: value, keys: cell.keys };
    document.getElementById(`ch-row-${row.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (next.size >= board.total) finish("complete", next);
  };
  const onMainInput = (input: string) => {
    let value = input;
    const previous = carry.current;
    if (previous) {
      // na primeira tecla depois de entrar, o texto que entrou + a tecla; nas seguintes, o campo já traz o texto inteiro
      const combined = typed === "" ? previous.text + input : input;
      if (input && continuesAnswer(board, combined, solved, previous.keys)) {
        value = combined;
        const key = answerKey(combined);
        // a forma longa inteira do que já entrou ("real brasileiro"): nada a fazer, o campo esvazia
        if (previous.keys.has(key) && ![...previous.keys].some((candidate) => candidate.length > key.length && candidate.startsWith(key))) { carry.current = null; setTyped(""); return; }
      } else carry.current = null;
    }
    setTyped(value);
    const match = matchAnswer(board, value, solved, current);
    if (match.cell && !match.waits) { commit(match, value); return; }
    if (match.cell && match.row) {
      const cell = rows.get(match.row)!.cells.find((item) => cellId(match.row!, item.column) === match.cell)!;
      setHint({ kind: "wait", answer: cell.answer, column: cell.column });
    } else setHint(match.ambiguous ? { kind: "ambiguous" } : null);
  };
  const onMainKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(matchAnswer(board, typed, solved, current), typed);
  };

  const title = challengeName(board.def);
  const rowsLeft = [...rows.keys()].filter((id) => !found.has(id)).length;
  const answer = (cell: ChallengeCell, rowId: string) => {
    const id = cellId(rowId, cell.column);
    if (solved.has(id)) return <span className="ch-ok">{cell.answer}</span>;
    if (phase === "done") return <span className="ch-miss" title={t.challenges.missed}>{cell.answer}</span>;
    return <span className="ch-blank" aria-hidden="true" />;
  };
  const rowState = (row: ChallengeRow) => [row.cells.some((cell) => solved.has(cellId(row.id, cell.column))) ? "is-open" : "", row.id === current && phase === "playing" ? "is-current" : ""].filter(Boolean).join(" ") || undefined;

  return <div className={`ch-play is-${phase}${single ? " is-single" : ""}`}>
    <div className="ch-head">
    <header className="ch-bar">
      {phase === "playing"
        ? <button type="button" className={`ch-quit${confirmQuit ? " is-confirm" : ""}`} onClick={() => confirmQuit ? finish("gaveup", solved) : setConfirmQuit(true)} onBlur={() => setConfirmQuit(false)}>
            {confirmQuit ? t.challenges.giveUpConfirm : t.challenges.giveUp}</button>
        : <button type="button" className="ch-quit" onClick={onExit}>← {t.challenges.back}</button>}
      <div className="ch-bar-title"><small>{t.challenges.title}</small><h1>{title}</h1></div>
      <div className="ch-bar-score" aria-live="polite"><small>{t.challenges.found}</small><b>{t.challenges.progress(solved.size, board.total)}</b></div>
      <div className={`ch-bar-time${left < 60_000 && phase === "playing" ? " is-low" : ""}`}><small>{t.challenges.timeLeft}</small><b>{clock(left)}</b></div>
    </header>
    {phase === "playing" && <div className="ch-type">
      <input ref={mainRef} value={typed} onChange={(event) => onMainInput(event.currentTarget.value)} onKeyDown={onMainKey} placeholder={single ? t.challenges.typeCountry : t.challenges.typeAnswer}
        aria-label={single ? t.challenges.inputAria : t.challenges.inputAnswerAria} aria-describedby="ch-hint" autoComplete="off" spellCheck={false} />
      <small>{t.challenges.rowsLeft(rowsLeft)}</small>
    </div>}
    {phase === "playing" && <p id="ch-hint" className={`ch-hint${hint ? " is-on" : ""}`} aria-live="polite">{hint?.kind === "wait" ? t.challenges.enterHint(hint.answer, t.challenges.columns[hint.column]) : hint?.kind === "ambiguous" ? t.challenges.ambiguousHint : ""}</p>}
    </div>
    {phase === "ready" && <section className="ch-start">
      <div>
        <h2>{t.challenges.howTitle}</h2>
        <ul>{t.challenges.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p className="ch-start-meta">{t.challenges.tierHints[board.def.tier]} · {t.challenges.duration(board.seconds)} · {t.challenges.answers(board.total)}</p>
      </div>
      <RecordBox run={best} />
      <button type="button" className="ch-go" autoFocus onClick={start}><Icon type="arches" size={16} /> {t.challenges.start}</button>
    </section>}
    {phase === "done" && end && <section className="ch-result" role="status">
      <MedalBadge medal={medalOf({ correct: solved.size, total: board.total })} />
      <div>
        <h2>{t.challenges.ends[end.kind]}</h2>
        <p><b>{t.challenges.score(solved.size, board.total, Math.floor((solved.size / board.total) * 100))}</b> {t.challenges.usedTime(clock(end.ms))}</p>
        {end.record && <p className="ch-new">{t.challenges.newRecord}</p>}
        {reward && <p className="ch-reward">
          <span>{t.challenges.reward(formatNumber(reward.coins ?? 0), formatNumber(reward.xp ?? 0))}</span>
          {reward.daily && <span className="ch-tag">{t.challenges.dailyDouble}</span>}
          {reward.medals.length > 0 && <span className="ch-tag">{t.challenges.medalBonus(t.challenges.medals[reward.medals[reward.medals.length - 1]], formatNumber(reward.medalBonus ?? 0))}</span>}
        </p>}
      </div>
      <div className="ch-result-acts">
        <button type="button" className="ch-go" onClick={() => { setSolved(new Set()); setCurrent(null); setEnd(null); setReward(null); setTyped(""); setPhase("ready"); }}>{t.challenges.again}</button>
        <button type="button" className="ch-ghost" onClick={onExit}>{t.challenges.back}</button>
      </div>
    </section>}
    <div className="ch-board">
      {board.groups.map((group) => <section key={group.continent} className="ch-group" aria-label={t.challenges.scopes[group.continent]} tabIndex={single ? undefined : 0}>
        {board.def.scope === "mundo" && <h3>{t.challenges.scopes[group.continent]} <small>{group.rows.filter((row) => found.has(row.id)).length}/{group.rows.length}</small></h3>}
        {single
          ? <ol className="ch-list">{group.rows.map((row) => <li key={row.id} id={`ch-row-${row.id}`}>{answer(row.cells[0], row.id)}</li>)}</ol>
          : <table className="ch-table">
              <thead><tr>{board.columns.map((column) => <th key={column} scope="col">{t.challenges.columns[column]}</th>)}</tr></thead>
              <tbody>{group.rows.map((row) => <tr key={row.id} id={`ch-row-${row.id}`} className={rowState(row)}>
                {board.columns.map((column) => {
                  const cell = row.cells.find((item) => item.column === column);
                  return <td key={column}>{cell ? answer(cell, row.id) : <span className="ch-none" aria-hidden="true">—</span>}</td>;
                })}
              </tr>)}</tbody>
            </table>}
      </section>)}
    </div>
  </div>;
}
