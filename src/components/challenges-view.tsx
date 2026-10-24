// Desafios (23/10/2026): a lista dos desafios (o do dia em destaque, os 21 por degrau e recorte, com o recorde e a medalha) e a tabela no estilo do
// JetPunk: digitar o nome de um país abre a linha dele; nas linhas abertas cada célula só aceita a resposta daquele país e fecha sozinha ao acertar.
// Contra o relógio; ao acabar o tempo, desistir ou completar, o que faltou aparece em vermelho e a tentativa é gravada (o recorde sai delas).
import { useEffect, useMemo, useRef, useState } from "react";
import { compareText, formatNumber, t } from "../domain/i18n";
import { locale } from "../domain/i18n/locale";
import {
  CHALLENGE_SCOPES, CHALLENGE_TIERS, bestRun, buildChallenge, cellAccepts, cellId, challengeById, countryWaits, dailyChallenge, longerKeys, matchCountry, medalOf, spillOf,
  type ChallengeBoard, type ChallengeCell, type ChallengeDef, type ChallengeEnd, type ChallengeRow, type ChallengeRun, type Medal,
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
        <p>{t.challenges.tierHints[daily.tier]}{dailyBoard ? ` · ${t.challenges.minutes(dailyBoard.seconds / 60)} · ${t.challenges.answers(dailyBoard.total)}` : ""}</p>
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
            <small>{item ? `${t.challenges.minutes(item.seconds / 60)} · ${t.challenges.answers(item.total)}` : "…"}</small>
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
  const [found, setFound] = useState<ReadonlySet<string>>(() => new Set());
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [end, setEnd] = useState<{ kind: ChallengeEnd; ms: number; record: boolean } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [reward, setReward] = useState<SavedChallengeRun | null>(null);
  const mainRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);
  const rows = useMemo(() => new Map(board.groups.flatMap((group) => group.rows.map((row) => [row.id, row] as const))), [board]);
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
    onPlaying(false);
    const missed = board.groups.flatMap((group) => group.rows.flatMap((row) => row.cells.map((cell) => cellId(row.id, cell.column)))).filter((id) => !solvedNow.has(id));
    void saveChallengeRun(board.def.id, { correct, total: board.total, ms, end: kind, missed }).then((run) => { setReward(run); onSaved(); }, () => undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // o relógio: 4 vezes por segundo; acabou o tempo, acabou o desafio
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - startedAt >= limit) finish("time", solvedRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);
  const solvedRef = useRef(solved);
  solvedRef.current = solved;
  useEffect(() => () => onPlaying(false), []);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current === "main" ? mainRef.current : cellRefs.current.get(pendingFocus.current);
    pendingFocus.current = null;
    target?.focus();
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  const start = () => {
    ended.current = false;
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
    setPhase("playing");
    onPlaying(true);
    pendingFocus.current = "main";
  };
  const nextOpenCell = (row: ChallengeRow, solvedNow: ReadonlySet<string>, after?: ChallengeCell) => {
    const cells = row.cells.slice(1);
    const from = after ? cells.indexOf(after) + 1 : 0;
    return [...cells.slice(from), ...cells.slice(0, from)].find((cell) => !solvedNow.has(cellId(row.id, cell.column))) ?? null;
  };
  const solve = (ids: readonly string[], foundNow: ReadonlySet<string>) => {
    const next = new Set(solved);
    for (const id of ids) next.add(id);
    setSolved(next);
    setFound(foundNow);
    if (next.size >= board.total) finish("complete", next);
    return next;
  };
  // depois de uma resposta fechar, quem continua escrevendo a forma longa dela ("Estados Unidos" + " da América", "real" + " brasileiro") tem o
  // resto engolido, onde quer que o cursor esteja; a primeira tecla que já é outra coisa desliga isso
  const spill = useRef<{ base: string; longer: readonly string[] } | null>(null);
  const arm = (keys: ReadonlySet<string>, value: string) => {
    const longer = longerKeys(keys, value);
    spill.current = longer.length ? { base: answerKey(value), longer } : null;
  };
  const swallow = (value: string) => {
    if (!spill.current) return false;
    const next = spillOf(spill.current, value);
    if (next === null) { spill.current = null; return false; }
    spill.current = spill.current.longer.some((candidate) => candidate.length > next.length) ? { ...spill.current, base: next } : null;
    return true;
  };
  // o país abre sozinho quando o nome está inteiro e não é o começo de outro país ("Niger" espera o Enter: pode virar "Nigeria")
  const openCountry = (id: string, value: string) => {
    const row = rows.get(id)!;
    const next = solve([cellId(id, "nome")], new Set(found).add(id));
    setTyped("");
    arm(row.cells[0].keys, value);
    const cell = nextOpenCell(row, next);
    pendingFocus.current = cell ? cellId(id, cell.column) : "main";
  };
  const onMainInput = (value: string) => {
    if (swallow(value)) { setTyped(""); return; }
    setTyped(value);
    const id = matchCountry(board, value, found);
    if (id && !countryWaits(board, value, found)) openCountry(id, value);
  };
  const onMainKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const id = matchCountry(board, typed, found);
    if (id) openCountry(id, typed);
  };
  // a célula fecha sozinha com a resposta certa e o cursor pula para a próxima
  const closeCell = (row: ChallengeRow, cell: ChallengeCell, value: string) => {
    const next = solve([cellId(row.id, cell.column)], found);
    arm(cell.keys, value);
    const following = nextOpenCell(row, next, cell);
    pendingFocus.current = following ? cellId(row.id, following.column) : "main";
  };
  const onCellInput = (row: ChallengeRow, cell: ChallengeCell, input: HTMLInputElement) => {
    if (swallow(input.value)) { input.value = ""; return; }
    if (cellAccepts(cell, input.value)) closeCell(row, cell, input.value);
  };
  const onCellKey = (row: ChallengeRow, cell: ChallengeCell, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); mainRef.current?.focus(); return; }
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (cellAccepts(cell, event.currentTarget.value)) { event.preventDefault(); closeCell(row, cell, event.currentTarget.value); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const following = nextOpenCell(row, solved, cell);
      const target = following && following !== cell ? cellRefs.current.get(cellId(row.id, following.column)) : mainRef.current;
      target?.focus();
    }
  };
  const onCellBlur = (row: ChallengeRow, cell: ChallengeCell, input: HTMLInputElement) => {
    if (phase === "playing" && !solved.has(cellId(row.id, cell.column)) && cellAccepts(cell, input.value)) solve([cellId(row.id, cell.column)], found);
  };

  const title = challengeName(board.def);
  const rowsLeft = [...rows.keys()].filter((id) => !found.has(id)).length;
  const answer = (row: ChallengeRow, cell: ChallengeCell) => {
    const id = cellId(row.id, cell.column);
    const ok = solved.has(id);
    if (ok) return <span className="ch-ok">{cell.answer}</span>;
    if (phase === "done") return <span className="ch-miss" title={t.challenges.missed}>{cell.answer}</span>;
    if (phase === "playing" && found.has(row.id) && cell.column !== "nome") {
      return <input ref={(element) => { if (element) cellRefs.current.set(id, element); else cellRefs.current.delete(id); }}
        className="ch-cell-in" aria-label={t.challenges.cellAria(t.challenges.columns[cell.column], row.name)} autoComplete="off" spellCheck={false}
        onChange={(event) => onCellInput(row, cell, event.currentTarget)} onKeyDown={(event) => onCellKey(row, cell, event)}
        onBlur={(event) => onCellBlur(row, cell, event.currentTarget)} />;
    }
    return <span className="ch-blank" aria-hidden="true" />;
  };

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
      <input ref={mainRef} value={typed} onChange={(event) => onMainInput(event.currentTarget.value)} onKeyDown={onMainKey} placeholder={t.challenges.typeCountry}
        aria-label={t.challenges.inputAria} autoComplete="off" spellCheck={false} />
      <small>{t.challenges.rowsLeft(rowsLeft)}</small>
    </div>}
    </div>
    {phase === "ready" && <section className="ch-start">
      <div>
        <h2>{t.challenges.howTitle}</h2>
        <ul>{t.challenges.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p className="ch-start-meta">{t.challenges.tierHints[board.def.tier]} · {t.challenges.minutes(board.seconds / 60)} · {t.challenges.answers(board.total)}</p>
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
        <button type="button" className="ch-go" onClick={() => { setFound(new Set()); setSolved(new Set()); setEnd(null); setReward(null); setTyped(""); setPhase("ready"); }}>{t.challenges.again}</button>
        <button type="button" className="ch-ghost" onClick={onExit}>{t.challenges.back}</button>
      </div>
    </section>}
    <div className="ch-board">
      {board.groups.map((group) => <section key={group.continent} className="ch-group" aria-label={t.challenges.scopes[group.continent]} tabIndex={single ? undefined : 0}>
        {board.def.scope === "mundo" && <h3>{t.challenges.scopes[group.continent]} <small>{group.rows.filter((row) => found.has(row.id)).length}/{group.rows.length}</small></h3>}
        {single
          ? <ol className="ch-list">{group.rows.map((row) => <li key={row.id}>{answer(row, row.cells[0])}</li>)}</ol>
          : <table className="ch-table">
              <thead><tr>{board.columns.map((column) => <th key={column} scope="col">{t.challenges.columns[column]}</th>)}</tr></thead>
              <tbody>{group.rows.map((row) => <tr key={row.id} className={found.has(row.id) ? "is-open" : undefined}>
                {board.columns.map((column) => {
                  const cell = row.cells.find((item) => item.column === column);
                  return <td key={column}>{cell ? answer(row, cell) : <span className="ch-none" aria-hidden="true">—</span>}</td>;
                })}
              </tr>)}</tbody>
            </table>}
      </section>)}
    </div>
  </div>;
}
