import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game } from "./components/map-game";
import { Header, Hub, OptionsScreen, type TopFamily } from "./components/screens";
import { StoreView } from "./components/store-view";
import { ThemeWash } from "./components/theme-decor";
import { Recorte } from "./components/match-config";
import { variantContextFor } from "./domain/match-config";
import { createPreset, diffPresets, removePreset, renamePreset, setFavorite, updatePreset, type Preset, type PresetDraft, type PresetResult } from "./domain/presets";
import { listPresets, savePresets } from "./domain/presets-store";
import {
  buildFeatures,
  eligible,
  loadLegacy,
} from "./domain/legacy-data";
import {
  migrateLegacyProgress,
  type LegacyProfile,
} from "./domain/legacy-migration";
import { QuizGame } from "./components/quiz-game";
import { SpecialQuiz } from "./components/special-quiz";
import { GeometryGame } from "./components/geometry-games";
import { inRegion, normalizeRegionSelection, REGION_ITEMS, regionLabel } from "./domain/regions";
import { inSilhouetteDeck } from "./domain/silhouette";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionSelection, RegionCounts, Screen } from "./domain/types";
import { loadSpecialData, specialInRegion } from "./domain/special-data";
import {
  downloadOfflineMap,
  hasOfflineMap,
  removeOfflineMap,
  type OfflineMapStatus,
} from "./domain/offline-map";
import { initializeEconomy, queryEconomy, unlockRounds, unlockTheme, type EconomySnapshot } from "./domain/economy-store";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, resolveTheme, themeAttributes, themeById } from "./domain/themes";
import { ResultScreen } from "./components/result-screen";
import { buildResultView, type ResultView } from "./domain/result-view";
import { DEFAULT_PACE, isPace, isRoundTier, isRoundTierUnlocked, roundLimitFor, roundUnlockFor, type RoundTier, type RoundUnlockKey } from "./domain/pace";
import type { Pace } from "./domain/spoils";
import type { SessionResult } from "./domain/learning-store";
import { Surface } from "./components/surfaces";
import { geometryIndex, travelDestinationIds } from "./domain/legacy-geometry";
import { registerAchievementLifecycleListener } from "./domain/achievements";
import { freshUnlocks, nearAchievements } from "./domain/achievement-summary";
import { EMPTY_ACHIEVEMENT_SUMMARY, TITLE_IDS, type AchievementSummary } from "./domain/hub-profile";
import { achievementToasts } from "./domain/achievement-toast";
import { queryCollectionSummary, querySurfaces } from "./domain/progress-surfaces";
import { t } from "./domain/i18n";
import { LeagueScreen } from "./components/league-screen";
import { leagueOf } from "./domain/league";
import { MMR_MODEL, matchmaking, surprise } from "./domain/mmr";
import { duelRecordId, mmrStateFromDuels, playerTotalMs, trophiesByLadder, type DuelRecord, type DuelView } from "./domain/duel";
import { pickBot } from "./domain/bots";
import { LEG_ROUNDS, LEGS, drawLegs, groupDef, isVariantOwned, legOfGroup, ownedGroups, type Ladder, type ModeGroup } from "./domain/duel-modes";
import { legOptions, newDuelRun, recordLeg, resolveRun, type DuelRun } from "./domain/duel-run";
import { emptySpoils, mergeSpoils } from "./domain/spoils";
import { ladderCards, nextMilestones, winStreak } from "./domain/duel-view";
import { DUEL_PREVIEW_NAMES, duelPreview } from "./domain/duel-preview";
import { DuelReveal } from "./components/duel-reveal";
import { DuelInterlude } from "./components/duel-interlude";
import type { Milestone } from "./domain/duel-rewards";
import { claimDuelMilestones, claimLeagueThemes, listDuels, saveDuel } from "./domain/duel-store";
import { isDebugEnabled } from "./domain/debug-flag";
import { PvpLobby, type PvpLobbyView } from "./components/pvp-lobby";
import { PvpInterlude } from "./components/pvp-interlude";
import { PvpResult } from "./components/pvp-result";
import { newPvpRun, pvpLegOptions, recordPvpLeg, type PvpRun } from "./domain/pvp-run";
import { parseInvite, type PvpInvite, type PvpMode, type PvpRoomView } from "./domain/pvp";
import { PvpClientError, pvpCommand, pvpCreateRoom, pvpGetInvite, pvpJoinRoom, pvpName as pvpStoredName, pvpSubscribe, setPvpName as setPvpStoredName } from "./domain/pvp-client";
import { listPvpMatches, pvpRatingOf, savePvpMatch, type PvpMatchRecord } from "./domain/pvp-store";
import { pvpRatingChange } from "./domain/pvp-rating";

const isUnPresetEntity = (id: string, meta: { un?: boolean } | undefined) =>
  Boolean(meta?.un || id === "336");


export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  // Duelo contra bots (liga no Hub): sempre Mundo inteiro, sem o filtro ONU; a escolha do solo fica guardada.
  const [duelMode, setDuelMode] = useState(false);
  // "Treinar" no resultado de uma derrota: a próxima partida é um Treino curto do modo, no Mundo inteiro e sem o filtro ONU.
  const [trainOnce, setTrainOnce] = useState(false);
  const [regionPref, setRegion] = useState<RegionSelection>("mundo");
  const region: RegionSelection = duelMode || trainOnce ? "mundo" : regionPref;
  const [family, setFamily] = useState<Family>("mapa");
  const [topFamily, setTopFamily] = useState<TopFamily>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [onlyUnPref, setOnlyUn] = useState(true);
  const onlyUn = duelMode || trainOnce ? false : onlyUnPref;
  // Ritmo (Partida com tempo ou Treino) e quantas rodadas: lembrados entre as partidas.
  const [pace, setPaceState] = useState<Pace>(() => {
    try { const saved = localStorage.getItem("carta-pace"); return isPace(saved) ? saved : DEFAULT_PACE; } catch { return DEFAULT_PACE; }
  });
  const [roundTier, setRoundTierState] = useState<RoundTier>(() => {
    try { const saved = localStorage.getItem("carta-round-tier"); return isRoundTier(saved) ? saved : "short"; } catch { return "short"; }
  });
  const setPace = (value: Pace) => { setPaceState(value); try { localStorage.setItem("carta-pace", value); } catch { /* sem armazenamento */ } };
  const setRoundTier = (value: RoundTier) => { setRoundTierState(value); try { localStorage.setItem("carta-round-tier", value); } catch { /* sem armazenamento */ } };
  // Tema do Hub: guardado neste aparelho; só vale se for do jogador (o padrão é grátis, os outros se compram na Loja).
  const [theme, setThemeState] = useState<string>(() => {
    try { const saved = localStorage.getItem(THEME_STORAGE_KEY); return isThemeId(saved) ? saved : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
  });
  const setTheme = (id: string) => { setThemeState(id); try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* sem armazenamento */ } };
  // Os troféus vêm do histórico de duelos (como XP e maestria), por escada (Mapas e Bandeiras). O adversário é sorteado entre os
  // 5 bots da liga da pessoa na escada (sem repetir o do duelo anterior). O Hub mostra a melhor das duas escadas.
  const [duels, setDuels] = useState<DuelRecord[]>([]);
  const [lastDuel, setLastDuel] = useState<DuelView | null>(null);
  const [duelRun, setDuelRunState] = useState<DuelRun | null>(null);
  const duelRunRef = useRef<DuelRun | null>(null);
  const setDuelRun = (run: DuelRun | null) => { duelRunRef.current = run; setDuelRunState(run); };
  const legResults = useRef<(SessionResult | null)[]>([null, null]);
  const lastBotRef = useRef<Record<Ladder, string | null>>({ mapas: null, bandeiras: null });
  const [duelBusy, setDuelBusy] = useState(false);
  const [leagueLadder, setLeagueLadder] = useState<Ladder | undefined>(undefined);
  const byLadder = useMemo(() => trophiesByLadder(duels), [duels]);
  const trophies = Math.max(byLadder.mapas, byLadder.bandeiras);
  useEffect(() => {
    void listDuels().then(async (list) => {
      setDuels(list);
      // ao abrir: paga o que faltar (marco novo ou a diferença de um prêmio que foi aumentado) e atualiza o saldo
      await claimDuelMilestones(trophiesByLadder(list)).catch(() => []);
      await claimLeagueThemes(trophiesByLadder(list)).catch(() => [] as string[]);
      void refreshEconomy();
    }).catch(() => undefined);
  }, []);
  // Só com ?debug=1: `__cartaDuelResult("t4")` no console abre o resultado de um cenário pronto (sem gravar nada).
  useEffect(() => {
    if (!isDebugEnabled()) return;
    const target = window as unknown as Record<string, unknown>;
    target.__cartaDuelResult = (name: string) => {
      const preview = duelPreview(name);
      if (!preview) return DUEL_PREVIEW_NAMES;
      // passa pelo Hub para a tela do resultado nascer do zero a cada cenário
      setScreen("hub");
      window.setTimeout(() => { setLastDuel(preview.duel); setLastResult(preview.view); setScreen("result"); }, 60);
      return name;
    };
    return () => { delete target.__cartaDuelResult; };
  }, []);
  const [economyReady, setEconomyReady] = useState(false);
  const [lastResult, setLastResult] = useState<ResultView | null>(null);
  const [specialCounts, setSpecialCounts] = useState({
    historicas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
    idiomas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
  });
  const [specialEntries, setSpecialEntries] = useState<{ historicas: Awaited<ReturnType<typeof loadSpecialData>>["historical"]; idiomas: Awaited<ReturnType<typeof loadSpecialData>>["languages"] }>({ historicas: [], idiomas: [] });
  const [travelIds, setTravelIds] = useState<string[]>([]);
  const [travelCounts, setTravelCounts] = useState<RegionCounts | null>(null);
  const [legacy, setLegacy] = useState<LegacyProfile | null>(null);
  const [offlineMap, setOfflineMap] =
    useState<OfflineMapStatus>("checking");
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [collectionRegion, setCollectionRegion] = useState<Region>("mundo");
  const [collectionSummary, setCollectionSummary] = useState({ discovered: 0, total: 0 });
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary>(EMPTY_ACHIEVEMENT_SUMMARY);
  const [economy, setEconomy] = useState<EconomySnapshot>({
    balance: 0,
    earned: 0,
    spent: 0,
    coverage: 0,
    xp: 0,
    level: 1,
    xpBase: 0,
    xpNext: 100,
    rounds: 0,
    completedSessions: 0,
    dominated: 0,
    coverageByColumn: { bandeiras: 0, mapa: 0, capitais: 0, escrita: 0 },
    sessions: 0,
    unlocked: [
      "mapa:mapa",
      "bandeiras:bandeira-nome",
      "capitais:capital-pais",
      "capitais:pais-capital",
    ],
  });
  const refreshEconomy = () => queryEconomy().then(setEconomy).catch(() => undefined);
  // Rodadas compradas valem para todos os modos; se a opção escolhida ainda não foi liberada, volta para 10.
  const arenaCards = useMemo(() => ladderCards(duels, economy.unlocked), [duels, economy.unlocked]);
  const arenaNext = useMemo(() => nextMilestones(duels), [duels]);
  const effectiveTier: RoundTier = isRoundTierUnlocked(roundTier, economy.unlocked) ? roundTier : "short";

  // ---- Duelo com amigo (PvP ao vivo, por link) ----
  const [pvpEntry, setPvpEntry] = useState<"setup" | "invite" | null>(null);
  const [pvpSetupLadder, setPvpSetupLadder] = useState<Ladder>("mapas");
  const [pvpMode, setPvpModeState] = useState<PvpMode>("friendly");
  const [pvpInviteCode, setPvpInviteCode] = useState<string | null>(null);
  const [pvpInvitePreview, setPvpInvitePreview] = useState<PvpInvite | null>(null);
  const [pvpInviteLoading, setPvpInviteLoading] = useState(false);
  const [pvpBusy, setPvpBusy] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [pvpNameState, setPvpNameState] = useState<string>(() => pvpStoredName());
  const setPvpDisplayName = (value: string) => { setPvpNameState(value); setPvpStoredName(value); };
  const [pvpRoom, setPvpRoomState] = useState<PvpRoomView | null>(null);
  const pvpRoomRef = useRef<PvpRoomView | null>(null);
  const setPvpRoom = (view: PvpRoomView | null) => { pvpRoomRef.current = view; setPvpRoomState(view); };
  const [pvpRun, setPvpRunState] = useState<PvpRun | null>(null);
  const pvpRunRef = useRef<PvpRun | null>(null);
  const setPvpRun = (run: PvpRun | null) => { pvpRunRef.current = run; setPvpRunState(run); };
  const pvpUnsubRef = useRef<(() => void) | null>(null);
  const pvpRoundIndexRef = useRef(0);
  const pvpSettledCodeRef = useRef<string | null>(null);
  const [pvpRatingDelta, setPvpRatingDelta] = useState<number | null>(null);
  const [pvpMatches, setPvpMatches] = useState<PvpMatchRecord[]>([]);
  const pvpRating = useMemo(() => pvpRatingOf(pvpMatches), [pvpMatches]);
  // Os dois tempos, para a tabela do resultado: vêm de novo da semente (a mesma conta que os dois jogadores fizeram para jogar).
  const pvpResultLegs = useMemo(() => (pvpRoom?.seed ? drawLegs(pvpRoom.ladder, pvpRoom.seed) : null), [pvpRoom?.seed, pvpRoom?.ladder]);
  useEffect(() => { void listPvpMatches().then(setPvpMatches).catch(() => undefined); }, []);
  const pvpErrorMessage = (error: unknown) => {
    if (error instanceof PvpClientError) {
      if (error.code === "not_found") return t.pvp.invite.notFound;
      if (error.code === "room_full" || error.code === "wrong_phase") return t.pvp.invite.full;
      if (error.code === "network") return t.pvp.errors.network;
    }
    return t.pvp.errors.generic;
  };
  const reportPvpRound = (round: { correct: boolean; responseTimeMs: number | null }) => {
    const run = pvpRunRef.current;
    if (!run) return;
    const roundIndex = pvpRoundIndexRef.current;
    pvpRoundIndexRef.current += 1;
    void pvpCommand(run.code, { type: "round", leg: run.index, round: roundIndex, correct: round.correct, ms: round.responseTimeMs ?? 0 }).catch(() => undefined);
  };
  // Assim que os dois duelos (Ana e Beto) terminam do lado do servidor, guarda o histórico local e calcula a mudança de força (só no valendo).
  useEffect(() => {
    const room = pvpRoom;
    if (!room || !room.result || !room.opponent || pvpSettledCodeRef.current === room.code) return;
    pvpSettledCodeRef.current = room.code;
    const ratingDelta = room.mode === "ranked" ? pvpRatingChange(pvpRating, room.opponent.rating, room.result.outcome) : null;
    setPvpRatingDelta(ratingDelta);
    // os grupos dos dois tempos vêm de novo da semente (a mesma conta que os dois jogadores fizeram para jogar); sem semente (nunca deveria acontecer
    // com a sala já fechada), fica sem o detalhe dos tempos, só o placar total.
    const groups = room.seed ? drawLegs(room.ladder, room.seed) : null;
    const legs: PvpMatchRecord["legs"] = groups
      ? groups.map((leg, index) => ({
        group: leg.group,
        youCorrect: room.result!.you.legs[index]?.correct ?? 0, opponentCorrect: room.result!.opponent.legs[index]?.correct ?? 0,
        total: leg.rounds, youMs: room.result!.you.legs[index]?.ms ?? null, opponentMs: room.result!.opponent.legs[index]?.ms ?? null,
      }))
      : undefined;
    const record: PvpMatchRecord = {
      id: `pvp:${room.code}`, code: room.code, at: Date.now(), ladder: room.ladder, mode: room.mode,
      opponentName: room.opponent.name, opponentRating: room.opponent.rating,
      youCorrect: room.result.you.correct, opponentCorrect: room.result.opponent.correct, totalRounds: LEG_ROUNDS * LEGS,
      outcome: room.result.outcome, tiebreak: room.result.tiebreak,
      youForfeited: room.result.you.forfeited, opponentForfeited: room.result.opponent.forfeited,
      youMs: room.result.you.ms, opponentMs: room.result.opponent.ms,
      legs, ratingDelta,
    };
    void savePvpMatch(record).then(listPvpMatches).then(setPvpMatches).catch(() => undefined);
  }, [pvpRoom, pvpRating]);
  // Link de convite (?duelo=CÓDIGO): abre direto na tela do convite, sem precisar do Hub.
  useEffect(() => {
    const code = parseInvite(location.search);
    if (!code) return;
    history.replaceState(null, "", location.pathname);
    setPvpInviteCode(code);
    setPvpEntry("invite");
    setPvpInviteLoading(true);
    setScreen("pvp-lobby");
    pvpGetInvite(code).then(setPvpInvitePreview).catch((error) => setPvpError(pvpErrorMessage(error))).finally(() => setPvpInviteLoading(false));
  }, []);
  const pvpReset = () => {
    pvpUnsubRef.current?.();
    pvpUnsubRef.current = null;
    setPvpRoom(null); setPvpRun(null); setPvpEntry(null); setPvpInvitePreview(null); setPvpInviteCode(null);
    setPvpError(null); setPvpBusy(false); setPvpRatingDelta(null);
    pvpSettledCodeRef.current = null;
  };
  const pvpOpenSetup = (ladder: Ladder) => { pvpReset(); setPvpEntry("setup"); setPvpSetupLadder(ladder); setPvpModeState("friendly"); setScreen("pvp-lobby"); };
  const startPvpLeg = (run: PvpRun, index: number) => {
    const leg = run.legs[index];
    pvpRoundIndexRef.current = 0;
    setFamily(leg.family);
    setVariant(leg.variant);
    setPvpRun({ ...run, index });
    setScreen("game");
  };
  const startPvpRun = (room: PvpRoomView) => {
    if (!room.seed) return;
    economyBeforeRef.current = economy;
    const run = newPvpRun({ code: room.code, ladder: room.ladder, mode: room.mode, isHost: room.host, seed: room.seed });
    setPvpRun(run);
    startPvpLeg(run, 0);
  };
  const handlePvpView = (view: PvpRoomView) => {
    const previous = pvpRoomRef.current;
    setPvpRoom(view);
    if (view.phase === "playing" && (!previous || previous.phase !== "playing") && !pvpRunRef.current) startPvpRun(view);
  };
  const pvpSubscribeTo = (code: string) => { pvpUnsubRef.current?.(); pvpUnsubRef.current = pvpSubscribe(code, handlePvpView, (error) => setPvpError(pvpErrorMessage(error))); };
  const pvpCreate = async () => {
    const name = pvpNameState.trim();
    if (!name) return;
    setPvpBusy(true); setPvpError(null);
    try { const room = await pvpCreateRoom(pvpSetupLadder, pvpMode, name, pvpRating, byLadder[pvpSetupLadder]); setPvpRoom(room); pvpSubscribeTo(room.code); }
    catch (error) { setPvpError(pvpErrorMessage(error)); }
    setPvpBusy(false);
  };
  const pvpJoin = async () => {
    const name = pvpNameState.trim();
    if (!name || !pvpInviteCode) return;
    setPvpBusy(true); setPvpError(null);
    try { const room = await pvpJoinRoom(pvpInviteCode, name, pvpRating, byLadder[pvpInvitePreview?.ladder ?? "mapas"]); setPvpRoom(room); pvpSubscribeTo(room.code); }
    catch (error) { setPvpError(pvpErrorMessage(error)); }
    setPvpBusy(false);
  };
  const pvpToggleReady = (ready: boolean) => {
    const room = pvpRoomRef.current;
    if (!room) return;
    void pvpCommand(room.code, { type: "ready", ready }).then((view) => { if (view) setPvpRoom(view); }).catch((error) => setPvpError(pvpErrorMessage(error)));
  };
  const pvpLeaveLobby = () => {
    const room = pvpRoomRef.current;
    if (room && room.phase !== "closed" && room.phase !== "done") void pvpCommand(room.code, { type: "leave" }).catch(() => undefined);
    pvpReset();
    setScreen("hub");
  };
  const pvpDecline = () => { pvpReset(); setScreen("hub"); };
  const pvpGoHome = () => { pvpReset(); setScreen("hub"); };
  const pvpRematch = () => { const ladder = pvpRoomRef.current?.ladder ?? "mapas"; pvpReset(); pvpOpenSetup(ladder); };
  const pvpContinueLeg = () => { const run = pvpRunRef.current; if (run) startPvpLeg(run, 1); };
  /** Um tempo terminou (ou a pessoa saiu dele): reporta o que faltar ao servidor e mostra o resultado quando os dois tempos acabaram para mim. */
  const finishPvpLeg = async (result: SessionResult | null) => {
    const run = pvpRunRef.current;
    if (!run) return;
    if (!result?.spoils) {
      void pvpCommand(run.code, { type: "leave" }).catch(() => undefined);
      void refreshEconomy();
      setPvpRun(null);
      setScreen("pvp-result");
      return;
    }
    const rounds = result.session.rounds;
    const leg = run.legs[run.index];
    const next = recordPvpLeg(run, { group: leg.group, rounds: leg.rounds, playerCorrect: rounds.filter((round) => round.correct).length, playerMs: playerTotalMs(rounds, result.session.timerSeconds) });
    setPvpRun(next);
    void refreshEconomy();
    setScreen(run.index === 0 ? "pvp-interlude" : "pvp-result");
  };
  useEffect(() => () => pvpUnsubRef.current?.(), []);

  // Duelo: cada tempo é uma sessão de 10 rodadas com tempo, baralho da semente do duelo e, em modo de prévia, moedas do modo base.
  const sessionOptions = useMemo(() => duelRun && screen === "game"
    ? legOptions(duelRun, economy.unlocked)
    : pvpRun && screen === "game"
    ? pvpLegOptions(pvpRun, pvpRun.index, economy.unlocked, reportPvpRound)
    : trainOnce ? { pace: "training" as Pace, roundLimit: 10 }
    : { pace, roundLimit: roundLimitFor(effectiveTier, family) }, [duelRun, pvpRun, screen, economy.unlocked, trainOnce, pace, effectiveTier, family]);
  // Saldo e XP de antes da partida: o resultado mostra o "antes → depois" e anima a diferença.
  const economyBeforeRef = useRef<EconomySnapshot>(economy);
  const startGame = () => { economyBeforeRef.current = economy; setLastDuel(null); setScreen("game"); };

  // ---- Duelo em dois tempos ----
  const newDuelId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  /** Sorteia adversário e tempos (a semente é o id) e abre a revelação; a pessoa não escolhe nada. */
  const openDuel = (ladder: Ladder) => {
    const id = newDuelId();
    setTrainOnce(false);
    const trophiesBefore = byLadder[ladder];
    const status = leagueOf(trophiesBefore);
    const legs = drawLegs(ladder, id, ownedGroups(economy.unlocked));
    const streak = winStreak(duels.filter((duel) => duel.ladder === ladder));
    const state = mmrStateFromDuels(duels, ladder);
    // matchmaking: o rating do bot é o MMR mais o otimismo pela incerteza (para cima quando a pessoa vem vencendo mais do que o esperado), preso entre a
    // própria liga e 2 ligas acima; o bot sai da liga desse rating e a força dele acompanha o rating
    const match = matchmaking(trophiesBefore, state.mmr, state.sigma, surprise(state.samples));
    setLastDuel(null);
    legResults.current = [null, null];
    setDuelRun(newDuelRun({ id, ladder, bot: pickBot(match.league, id, lastBotRef.current[ladder]), trophiesBefore, division: match.division, rating: match.rating, legs, streak, mmr: state.mmr, sigma: state.sigma, samples: state.samples }));
    setScreen("duel-reveal");
  };
  /** Só com ?debug=1: troca o modo de um tempo para testar. */
  const pickLegGroup = (index: number, group: ModeGroup) => {
    const run = duelRunRef.current;
    if (!run) return;
    const groups = run.legs.map((leg) => leg.group);
    groups[index] = group;
    setDuelRun({ ...run, legs: [legOfGroup(groups[0], run.id, 0), legOfGroup(groups[1], run.id, 1)] });
  };
  const startLeg = (index: number) => {
    const run = duelRunRef.current;
    if (!run) return;
    const leg = run.legs[index];
    setFamily(leg.family);
    setVariant(leg.variant);
    setDuelRun({ ...run, index });
    setScreen("game");
  };
  const beginDuel = () => {
    if (!duelRunRef.current || !isRoundTierUnlocked("long", economy.unlocked)) return;
    economyBeforeRef.current = economy;
    startLeg(0);
  };
  const buyDuelFormat = async () => {
    setDuelBusy(true);
    try { setEconomy(await unlockRounds("rounds:20")); } catch { await refreshEconomy(); }
    setDuelBusy(false);
  };
  /** Fecha o duelo: o bot joga os dois tempos, o placar decide, os troféus entram no histórico e os marcos são pagos. */
  const concludeDuel = async (run: DuelRun) => {
    const outcome = resolveRun(run);
    const before = economyBeforeRef.current;
    const economyAfter = await queryEconomy().catch(() => null);
    const record: DuelRecord = {
      id: duelRecordId(run.id), sessionId: run.id, at: Date.now(), botId: run.bot.id, ladder: run.ladder,
      family: run.legs[0].family, variant: run.legs[0].variant, playerCorrect: outcome.playerCorrect, total: outcome.total, botCorrect: outcome.botCorrect,
      outcome: outcome.outcome, tiebreak: outcome.tiebreak, delta: outcome.delta, mmrDelta: outcome.mmrDelta, mmrVersion: MMR_MODEL, mmrSigma: outcome.mmrSigma, mmrExp: outcome.mmrExp,
      legs: outcome.legs.map((leg, index) => ({ group: leg.group, playerCorrect: leg.playerCorrect, botCorrect: leg.botCorrect, total: leg.rounds, playerMs: run.done[index]?.playerMs ?? null, botMs: leg.botMs })),
      abandoned: run.done.length < LEGS,
    };
    const nextDuels = [...duels.filter((item) => item.id !== record.id), record];
    setDuels(nextDuels);
    // Marcos de divisão e de liga: crédito único no livro-caixa (não repete se os troféus caírem e subirem de novo).
    const milestones: readonly Milestone[] = await saveDuel(record).then(() => claimDuelMilestones(trophiesByLadder(nextDuels))).catch(() => []);
    // Tema de liga: dado uma vez ao entrar na liga (melhor das duas escadas); o resultado avisa quando foi este duelo que abriu.
    const themesGranted = await claimLeagueThemes(trophiesByLadder(nextDuels)).catch(() => [] as string[]);
    void refreshEconomy();
    lastBotRef.current = { ...lastBotRef.current, [run.ladder]: run.bot.id };
    const played = legResults.current.filter((leg): leg is SessionResult => Boolean(leg?.spoils));
    if (played.length) {
      const sessions = played.map((leg) => leg.session);
      const merged = { ...sessions[sessions.length - 1], rounds: sessions.flatMap((item) => item.rounds), startedAt: sessions[0].startedAt, complete: true };
      const view = buildResultView({ session: merged, spoils: mergeSpoils(played.map((leg) => leg.spoils!)), before, after: economyAfter ?? before, regionLabel: t.duel.ladders[run.ladder] });
      setLastResult({ ...view, eyebrow: t.duel.reveal.eyebrow(t.duel.ladders[run.ladder]) });
    } else {
      // Saiu antes de terminar qualquer tempo: resultado vazio, só com o duelo perdido.
      const now = Date.now();
      const empty = buildResultView({ session: { variant: run.legs[0].variant, startedAt: now, endedAt: now, complete: false, rounds: [], pace: "timed", timerSeconds: null }, spoils: emptySpoils("timed"), before, after: economyAfter ?? before, regionLabel: t.duel.ladders[run.ladder] });
      setLastResult({ ...empty, eyebrow: t.duel.reveal.eyebrow(t.duel.ladders[run.ladder]) });
    }
    setLastDuel({
      botName: run.bot.name, botLeague: run.bot.league, botStyle: run.bot.style, botSpecialty: run.bot.specialty,
      outcome: outcome.outcome, tiebreak: outcome.tiebreak, playerCorrect: outcome.playerCorrect, botCorrect: outcome.botCorrect, total: outcome.total,
      delta: outcome.delta, trophiesBefore: run.trophiesBefore, trophiesAfter: outcome.trophiesAfter, milestones, ladder: run.ladder, legs: record.legs,
      ...(themesGranted.length ? { themeUnlocked: themesGranted[themesGranted.length - 1] } : {}),
      streakBefore: run.streak, streakAfter: winStreak(nextDuels.filter((duel) => duel.ladder === run.ladder)), streakBonus: outcome.streakBonus, perfBonus: outcome.perfBonus, abandoned: run.done.length < LEGS,
      // moedas de cada tempo sem o bônus de partida completa (ele aparece à parte) e se o modo foi de prévia
      legCoins: run.legs.map((_, index) => { const spoils = legResults.current[index]?.spoils; return spoils ? spoils.total - spoils.completion.coins : 0; }),
      legPreview: run.legs.map((leg) => !isVariantOwned(leg, economy.unlocked)),
      legTimes: outcome.legs.map((leg, index) => ({ playerMs: run.done[index]?.playerMs ?? null, botMs: leg.botMs })),
      playerMs: run.done.length >= LEGS && run.done.every((leg) => leg.playerMs !== null) ? run.done.reduce((sum, leg) => sum + (leg.playerMs as number), 0) : null,
      botMs: outcome.botMs,
    });
    setDuelRun(null);
    legResults.current = [null, null];
    setScreen("result");
  };
  /** Um tempo terminou (ou a pessoa saiu dele). Depois de "Começar duelo", sair de qualquer tempo é derrota: o que faltou vale zero. */
  const finishLeg = async (result: SessionResult | null) => {
    const run = duelRunRef.current;
    if (!run) return;
    if (!result?.spoils) {
      void refreshEconomy();
      await concludeDuel(run);
      return;
    }
    const rounds = result.session.rounds;
    const leg = run.legs[run.index];
    legResults.current[run.index] = result;
    const next = recordLeg(run, { group: leg.group, rounds: leg.rounds, playerCorrect: rounds.filter((round) => round.correct).length, playerMs: playerTotalMs(rounds, result.session.timerSeconds) });
    setDuelRun(next);
    if (run.index === 0) { void refreshEconomy(); setScreen("duel-interlude"); return; }
    await concludeDuel(next);
  };
  const leaveGame = () => {
    if (duelRunRef.current) { void finishLeg(null); return; }
    if (pvpRunRef.current) { void finishPvpLeg(null); return; }
    void refreshEconomy();
    setScreen("recorte");
  };
  const finishGame = async (result: SessionResult | null) => {
    if (duelRunRef.current) { await finishLeg(result); return; }
    if (pvpRunRef.current) { await finishPvpLeg(result); return; }
    if (!result?.spoils) { void refreshEconomy(); setScreen("recorte"); return; }
    const before = economyBeforeRef.current;
    const after = await queryEconomy().catch(() => null);
    if (after) setEconomy(after);
    const { session } = result;
    setLastDuel(null);
    setLastResult(buildResultView({
      session, spoils: result.spoils, before, after: after ?? before,
      regionLabel: regionLabel(session.regions?.length ? session.regions : session.region),
    }));
    setScreen("result");
  };
  const buyRounds = async (key: RoundUnlockKey) => { setEconomy(await unlockRounds(key)); };
  // Compra na Loja: debita as moedas e já aplica o tema.
  const buyTheme = async (id: string) => { setEconomy(await unlockTheme(id)); setTheme(id); };
  const openSurface = (surface: "progress" | "collection" | "achievements" | "history") => { if (surface === "collection") setCollectionRegion("mundo"); setScreen(surface); };
  const navigate = (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => { if (destination === "collection") setCollectionRegion("mundo"); setScreen(destination); };
  /** "Treinar" no resultado do duelo: um Treino de 10 rodadas do modo em que a pessoa mais ficou atrás. */
  const trainGroup = async (group: ModeGroup) => {
    const mode = groupDef(group).variants[0];
    if (mode.family === "bandeiras" || mode.family === "historicas" || mode.family === "idiomas" || mode.family === "escrita") await loadSpecial();
    setTrainOnce(true);
    setFamily(mode.family);
    setVariant(mode.variant);
    economyBeforeRef.current = economy;
    setLastDuel(null);
    setScreen("game");
  };
  const openLeague = (ladder?: Ladder) => { setLeagueLadder(ladder); setScreen("league"); };
  const openCollectionAt = (target: Region) => { setCollectionRegion(target); setScreen("collection"); };
  const restoreVariantContext = (familyKey: TopFamily, saved: string) => {
    const context = variantContextFor(familyKey, saved);
    if (context) { setFamily(context.family); setVariant(context.variant); }
  };

  useEffect(() => {
    loadLegacy()
      .then(setData)
      .catch((loadError) => setError(loadError.message));
    migrateLegacyProgress().then(setLegacy).then(() => initializeEconomy()).then((snapshot) => { setEconomy(snapshot); setEconomyReady(true); });
    hasOfflineMap()
      .then((installed) => setOfflineMap(installed ? "installed" : "available"))
      .catch(() => setOfflineMap("unavailable"));
  }, []);
  // O CSS lê o tema nos atributos do elemento raiz.
  useEffect(() => {
    const { theme: id, treat, wash, scheme } = themeAttributes(theme);
    const root = document.documentElement;
    root.dataset.theme = id; root.dataset.treat = treat; root.dataset.wash = wash; root.dataset.scheme = scheme;
  }, [theme]);
  // Tema guardado que não é do jogador (dados limpos, valor antigo) volta ao padrão, mas só depois de a economia carregar de verdade.
  useEffect(() => {
    if (!economyReady) return;
    const valid = resolveTheme(theme, economy.unlocked);
    if (valid !== theme) setTheme(valid);
  }, [economyReady, economy.unlocked, theme]);
  useEffect(() => {
    const saved = localStorage.getItem(`carta-last-variant:${topFamily}`);
    if (saved) restoreVariantContext(topFamily, saved);
  }, [topFamily]);
  useEffect(() => {
    if (!data) return;
    setTravelCounts(null);
    void geometryIndex().then(({ features: geometryFeatures }) => {
      const ids = [...geometryFeatures.keys()].filter((id) =>
        data.meta[id] && (!onlyUn || isUnPresetEntity(id, data.meta[id])),
      );
      setTravelIds(ids);
      setTravelCounts(Object.fromEntries(REGION_ITEMS.map(([key]) => [key, travelDestinationIds(data.meta, ids.filter((id) => inRegion(id, key, data))).length])) as RegionCounts);
    }).catch(() => setTravelCounts(null));
  }, [data, onlyUn]);
  useEffect(() => {
    if (!data) return;
    void queryCollectionSummary(data).then(setCollectionSummary).catch(() => undefined);
  }, [data, economy.coverage, surfaceRevision]);
  // Conquistas: avalia depois de cada rodada/partida, atualiza o card do Hub e avisa as que acabaram de abrir.
  // A primeira leitura (ao abrir o app) só serve de base: o que já estava desbloqueado não vira aviso.
  const knownAchievements = useRef<ReadonlySet<string> | null>(null);
  const achievementChain = useRef<Promise<unknown>>(Promise.resolve());
  const syncAchievements = useCallback((announce: boolean) => {
    if (!data) return Promise.resolve();
    const run = async () => {
      const state = await querySurfaces(data);
      const { fresh, next, count } = freshUnlocks(announce ? knownAchievements.current : null, state.achievements);
      knownAchievements.current = next;
      const near = nearAchievements(state.achievements)[0];
      setAchievementSummary({
        unlocked: count,
        total: state.achievements.length,
        titles: state.achievements.filter((item) => item.unlocked && TITLE_IDS.includes(item.id)).map((item) => item.id),
        next: near ? { name: near.name, current: Number(near.current ?? 0), target: Number(near.target ?? 0) } : null,
      });
      achievementToasts.push(fresh.map(({ id, name, description, rarity }) => ({ id, name, description, rarity })));
    };
    // uma avaliação por vez, na ordem: a base de abertura sempre vem antes de qualquer aviso
    const task = achievementChain.current.then(run).catch((achievementError) => {
      console.error("[carta-cega] achievement evaluation failed", achievementError);
    });
    achievementChain.current = task;
    return task;
  }, [data]);
  useEffect(() => { void syncAchievements(false); }, [syncAchievements]);
  useEffect(() => {
    registerAchievementLifecycleListener(() => {
      void syncAchievements(true).then(() => setSurfaceRevision((current) => current + 1));
    });
    return () => registerAchievementLifecycleListener(null);
  }, [syncAchievements]);
  const onDebugChange = async ({ announce }: { announce: boolean }) => {
    await refreshEconomy();
    await syncAchievements(announce);
    setSurfaceRevision((current) => current + 1);
  };

  const features = useMemo(
    () => (data ? eligible(buildFeatures(data)).filter((item) => {
      const meta = data.meta[item.id];
      return meta && !meta.absorvido && meta.mapa !== false &&
        (!onlyUn || isUnPresetEntity(item.id, meta));
    }) : []),
    [data, onlyUn],
  );
  const playableData = useMemo(() => {
    if (!data || !onlyUn) return data;
    return {
      ...data,
      meta: Object.fromEntries(
        Object.entries(data.meta).filter(([id, meta]) => isUnPresetEntity(id, meta)),
      ),
    };
  }, [data, onlyUn]);
  const gameFeatures = useMemo(
    () => data
      ? features.filter((item) =>
        inRegion(item.id, region, data) &&
        (family !== "capitais" || Boolean(data.meta[item.id]?.cap)),
      )
      : [],
    [data, family, features, region],
  );
  const counts = useMemo(
    () => data
      ? Object.fromEntries(REGION_ITEMS.map(([key]) => [
        key,
        features.filter((item) => inRegion(item.id, key, data)).length,
      ])) as RegionCounts
      : null,
    [data, features],
  );
  // O baralho da Silhueta não tem as ilhas pequenas (silhouette.ts); a configuração conta o mesmo que a partida sorteia.
  const silhouetteCounts = useMemo(
    () => data
      ? Object.fromEntries(REGION_ITEMS.map(([key]) => [
        key,
        features.filter((item) => inSilhouetteDeck(data.meta[item.id]) && inRegion(item.id, key, data)).length,
      ])) as RegionCounts
      : null,
    [data, features],
  );
  const familyCounts = useMemo(() => {
    if (!data) return null;
    const count = (selected: Family, selectedRegion: Region) =>
      Object.entries(data.meta).filter(([id, meta]) => {
         if (meta.absorvido || !inRegion(id, selectedRegion, data)) return false;
         if (onlyUn && !isUnPresetEntity(id, meta)) return false;
        if (selected === "mapa") return features.some((item) => item.id === id);
        if (selected === "bandeiras") return Boolean(meta.fl);
        return Boolean(typeof meta.cap === "string" && meta.cap.trim() && !meta.soBandeira);
      }).length;
    const regionCounts = (selected: Family) => Object.fromEntries(
      REGION_ITEMS.map(([key]) => [key, count(selected, key)]),
    ) as RegionCounts;
    return {
      mapa: regionCounts("mapa"),
      bandeiras: regionCounts("bandeiras"),
      capitais: regionCounts("capitais"),
      escrita: regionCounts(variant === "escrita-capital" ? "capitais" : "bandeiras"),
      historicas: specialCounts.historicas,
      idiomas: specialCounts.idiomas,
      silhueta: silhouetteCounts,
       travel: travelCounts ?? Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
    } as Record<Family, RegionCounts>;
  }, [data, features, specialCounts, travelCounts, onlyUn, variant, silhouetteCounts]);
  const selectedCount = useMemo(() => {
    if (!data) return 0;
    const ids = Object.entries(data.meta).filter(([id, meta]) => {
      if (
        meta.absorvido ||
        !inRegion(id, region, data) ||
        (onlyUn && !isUnPresetEntity(id, meta))
      ) return false;
      if (family === "mapa") return features.some((item) => item.id === id);
      if (family === "silhueta") return features.some((item) => item.id === id) && inSilhouetteDeck(meta);
      if (family === "bandeiras") return Boolean(meta.fl);
      if (family === "capitais") return Boolean(meta.cap && !meta.soBandeira);
      if (family === "escrita") return variant === "escrita-capital" ? Boolean(meta.cap) : Boolean(meta.fl);
      return true;
    });
    if (family === "historicas" || family === "idiomas") {
      const source = family === "historicas" ? specialEntries.historicas : specialEntries.idiomas;
      return source.filter((item) => specialInRegion(item, region)).length;
    }
    if (family === "travel") return travelDestinationIds(data.meta, travelIds.filter((id) => inRegion(id, region, data))).length;
    return ids.length;
  }, [data, family, features, onlyUn, region, specialEntries, travelIds, variant]);

  // Contagens e entradas de Históricas e Idiomas (a configuração e a partida dependem delas).
  const loadSpecial = () => loadSpecialData().then((special) => {
    const count = (items: { reg?: string; sub?: string }[]) =>
      Object.fromEntries(REGION_ITEMS.map(([key]) => [
        key,
        items.filter((item) => specialInRegion(item, key)).length,
      ])) as RegionCounts;
    setSpecialCounts({
      historicas: count(special.historical),
      idiomas: count(special.languages),
    });
    setSpecialEntries({ historicas: special.historical, idiomas: special.languages });
  });

  // ---- Favoritas (configurações guardadas) ----
  const [presets, setPresets] = useState<Preset[]>([]);
  const presetsRef = useRef<Preset[]>([]);
  useEffect(() => { void listPresets().then((list) => { presetsRef.current = list; setPresets(list); }).catch(() => undefined); }, []);
  const commitPresets = (next: Preset[]) => {
    const { changed, removedIds } = diffPresets(presetsRef.current, next);
    presetsRef.current = next;
    setPresets(next);
    void savePresets(changed, removedIds).catch(() => undefined);
  };
  const newPresetId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const presetApi = {
    list: presets,
    save: (draft: PresetDraft, name?: string): PresetResult => { const result = createPreset(presetsRef.current, draft, { id: newPresetId(), now: Date.now(), name }); if (result.ok) commitPresets(result.list); return result; },
    update: (id: string, draft: PresetDraft): PresetResult => { const result = updatePreset(presetsRef.current, id, draft, Date.now()); if (result.ok) commitPresets(result.list); return result; },
    rename: (id: string, name: string) => commitPresets(renamePreset(presetsRef.current, id, name, Date.now())),
    favorite: (id: string) => commitPresets(setFavorite(presetsRef.current, id, Date.now())),
    remove: (id: string) => commitPresets(removePreset(presetsRef.current, id, Date.now())),
    apply: (preset: Preset) => applyPreset(preset),
  };
  // Coloca no estado tudo o que a favorita guarda (modo, ritmo, rodadas, recorte e filtro).
  const applyPreset = (preset: Preset) => {
    const context = variantContextFor(preset.topFamily, preset.variant);
    if (!context) return;
    try { localStorage.setItem(`carta-last-variant:${preset.topFamily}`, context.variant); } catch { /* sem armazenamento */ }
    setTopFamily(preset.topFamily);
    setFamily(context.family);
    setVariant(context.variant);
    setRegion(preset.region);
    setOnlyUn(preset.onlyUn);
    setPace(preset.pace);
    setRoundTier(preset.roundTier);
  };
  // Escolhe a família de jogo e abre a configuração da partida (Hub e cards de pilar da tela de Progresso).
  const selectFamily = async (selected: Family) => {
            setTrainOnce(false);
            setFamily(selected);
            setRegion("mundo");
             const selectedTopFamily: TopFamily = selected === "mapa" || selected === "silhueta" || selected === "travel" ? "mapa" : selected === "bandeiras" || selected === "escrita" || selected === "historicas" ? "bandeiras" : selected === "capitais" ? "capitais" : "idiomas";
             setTopFamily(selectedTopFamily);
            if (selected === "bandeiras" || selected === "historicas" || selected === "idiomas" || selected === "escrita") {
              await loadSpecial();
            }
              const defaultVariant = selected === "mapa" ? "mapa" : selected === "bandeiras" ? "nome-bandeira" : selected === "capitais" ? "capital-pais" : selected === "escrita" ? "escrita-pais" : selected === "historicas" ? "nome-historica" : selected === "idiomas" ? "idioma-nome" : selected === "silhueta" ? "silhueta" : "travel";
              const savedVariant = localStorage.getItem(`carta-last-variant:${selectedTopFamily}`);
              const restored =
                variantContextFor(selectedTopFamily, savedVariant ?? "") ??
                variantContextFor(selectedTopFamily, defaultVariant);
              if (restored) {
                setFamily(restored.family);
                setVariant(restored.variant);
                localStorage.setItem(`carta-last-variant:${selectedTopFamily}`, restored.variant);
              }
             setScreen("recorte");
  };

  if (error) {
    return (
      <div className="app-shell">
        <Header />
        <main className="content">
          <div className="diagnostic">
            <b>{t.app.errorTitle}</b>
            <p>{error}</p>
            <button className="button" onClick={() => location.reload()}>
              {t.app.retry}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!data || !counts) {
    return (
      <div className="app-shell">
        <Header />
        <main className="content">
          <div className="eyebrow">{t.app.loadingEyebrow}</div>
          <h1 style={{ marginTop: 20 }}>{t.app.loadingTitle}</h1>
          <p className="lede">{t.app.loadingLede}</p>
        </main>
      </div>
    );
  }

  if (screen === "result") {
    return <div className="app-shell grain">{lastResult
      ? <ResultScreen view={lastResult} duel={lastDuel} onLeague={() => openLeague(lastDuel?.ladder)} onTrain={(group) => void trainGroup(group)} onStore={() => navigate("store")} onEquipTheme={setTheme} onAgain={lastDuel?.ladder ? () => openDuel(lastDuel.ladder!) : startGame} onAdjust={() => setScreen(lastDuel ? "hub" : "recorte")} onHome={() => setScreen("hub")} />
      : <main className="content"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button></main>}</div>;
  }
  if (screen === "progress" || screen === "collection" || screen === "achievements" || screen === "history") {
     return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current={screen === "history" ? "hub" : screen} onNavigate={navigate} onSurface={openSurface} /><Surface key={surfaceRevision} data={data} kind={screen} onBack={() => setScreen("hub")} economy={economy} onTrain={selectFamily} onOpenCollection={openCollectionAt} collectionRegion={collectionRegion} /></div>;
  }
  if (screen === "duel-reveal" && duelRun) {
    return <div className="app-shell grain"><DuelReveal run={duelRun} unlocked={economy.unlocked} balance={economy.balance} formatOwned={isRoundTierUnlocked("long", economy.unlocked)} formatCost={roundUnlockFor("long")?.cost ?? 3000} busy={duelBusy} onStart={beginDuel} onBack={() => { setDuelRun(null); setScreen("hub"); }} onBuyFormat={() => void buyDuelFormat()} debug={isDebugEnabled() ? { onPick: pickLegGroup } : undefined} /></div>;
  }
  if (screen === "duel-interlude" && duelRun) {
    return <div className="app-shell grain"><DuelInterlude run={duelRun} unlocked={economy.unlocked} onContinue={() => startLeg(1)} /></div>;
  }
  if (screen === "pvp-lobby") {
    const view: PvpLobbyView = pvpRoom
      ? { kind: "room", room: pvpRoom }
      : pvpEntry === "invite"
        ? { kind: "invite", invite: pvpInvitePreview, loading: pvpInviteLoading, busy: pvpBusy, error: pvpError }
        : { kind: "setup", ladder: pvpSetupLadder, mode: pvpMode, busy: pvpBusy, error: pvpError };
    return <div className="app-shell grain"><PvpLobby view={view} name={pvpNameState} onNameChange={setPvpDisplayName} onModeChange={setPvpModeState} onCreate={() => void pvpCreate()} onJoin={() => void pvpJoin()} onDecline={pvpDecline} onReady={pvpToggleReady} onLeave={pvpLeaveLobby} onBack={pvpLeaveLobby} /></div>;
  }
  if (screen === "pvp-interlude" && pvpRun) {
    return <div className="app-shell grain"><PvpInterlude run={pvpRun} onContinue={pvpContinueLeg} /></div>;
  }
  if (screen === "pvp-result" && pvpRoom) {
    const coinsGained = Math.max(0, economy.balance - economyBeforeRef.current.balance);
    const xpGained = Math.max(0, economy.xp - economyBeforeRef.current.xp);
    return <div className="app-shell grain"><PvpResult room={pvpRoom} legs={pvpResultLegs} ratingDelta={pvpRatingDelta} coinsGained={coinsGained} xpGained={xpGained} onRematch={pvpRematch} onHome={pvpGoHome} /></div>;
  }
  if (screen === "league") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="hub" onNavigate={navigate} onSurface={openSurface} /><LeagueScreen duels={duels} initialLadder={leagueLadder} onBack={() => setScreen("hub")} /></div>;
  }
  if (screen === "store") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="store" onNavigate={navigate} onSurface={openSurface} /><main className="content surface" data-surface="store"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button><StoreView economy={economy} activeTheme={theme} onEquip={setTheme} onBuy={buyTheme} /></main></div>;
  }
  if (screen === "options") {
    return <div className="app-shell grain"><Header legacy={legacy} economy={economy} current="options" onNavigate={navigate} onSurface={openSurface} /><OptionsScreen data={data} theme={theme} ownedUnlocks={economy.unlocked} onTheme={setTheme} onOpenStore={() => setScreen("store")} offlineMap={offlineMap} onToggleOfflineMap={async () => {
      if (offlineMap === "installed") { await removeOfflineMap(); setOfflineMap("available"); }
      else { setOfflineMap("downloading"); try { await downloadOfflineMap(); setOfflineMap("installed"); } catch { setOfflineMap("error"); } }
    }} onDebugChange={onDebugChange} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "game") {
    if (family === "capitais" && variant === "capital-pais") {
       return <Game data={playableData ?? data} features={gameFeatures} region={region} family={family} variant={variant} onlyUn={onlyUn} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family === "silhueta" || family === "travel") {
        return <GeometryGame family={family} variant={variant} data={playableData ?? data} region={region} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family === "historicas" || family === "idiomas" || family === "escrita") {
        const specialData = family === "historicas" || family === "idiomas" ? data : (playableData ?? data);
        return <SpecialQuiz data={specialData} family={family} variant={variant} region={region} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family !== "mapa") {
      return (
        <QuizGame
          data={playableData ?? data}
          family={family}
            variant={variant as Exclude<QuizVariant, "mapa">}
          region={region}
          onBack={leaveGame}
          onEnd={finishGame} options={sessionOptions}
        />
      );
    }
    return (
      <Game
        data={data}
        features={gameFeatures}
        region={region}
        onlyUn={onlyUn}
        onBack={leaveGame}
        onEnd={finishGame} options={sessionOptions}
      />
    );
  }

  return (
    <div className={`app-shell grain ${screen === "recorte" ? "focused-flow" : ""}`}>
        {screen === "hub" && themeById(theme)?.wash && <ThemeWash />}
        <Header legacy={legacy} economy={economy} current={screen === "hub" ? "hub" : undefined} onNavigate={navigate} onSurface={openSurface} />
      {screen === "hub" && (
        <Hub
          legacy={legacy}
            economy={economy}
            onSurface={openSurface}
          offlineMap={offlineMap}
          totalEntities={data.mapEntityIds.length}
          collectionSummary={collectionSummary}
          achievementSummary={achievementSummary}
          onSelect={selectFamily}
           onNavigate={navigate}
          duelMode={duelMode}
          duelReady={isRoundTierUnlocked("long", economy.unlocked)}
          onDuelMode={setDuelMode}
          trophies={trophies}
          duelsPlayed={duels.length}
          onOpenLeague={() => openLeague()}
          arenas={{ cards: arenaCards, next: arenaNext, formatCost: roundUnlockFor("long")?.cost ?? 3000, onDuel: openDuel, onFriend: pvpOpenSetup }}
         />
      )}
      {screen === "recorte" && (
        <Recorte
          data={data}
            family={family}
            variant={variant}
            counts={familyCounts?.[family] ?? counts}
            selectedCount={selectedCount}
          region={region}
          setRegion={setRegion}
          onBack={() => setScreen("hub")}
           economy={economy}
           onRefresh={refreshEconomy}
           onPlay={startGame}
           pace={pace}
           setPace={setPace}
           roundTier={effectiveTier}
           setRoundTier={setRoundTier}
           onBuyRounds={buyRounds}
           onlyUn={onlyUn}
           setOnlyUn={setOnlyUn}
           presetApi={presetApi}
            setVariant={setVariant}
            topFamily={topFamily}
            onFamilyChange={(nextFamily, nextVariant) => {
              setFamily(nextFamily);
              setVariant(nextVariant);
            }}
        />
      )}
    </div>
  );
}