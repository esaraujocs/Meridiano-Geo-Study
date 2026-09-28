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
import { emptySupplyCounts, type SupplyCounts, type SupplyId } from "./domain/supplies";
import { buySupply, supplyCounts } from "./domain/supplies-store";
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
import { duelRecordId, mmrStateFromDuels, playerTotalMs, trophiesByLadder, trophiesFromDuels, type DuelRecord, type DuelView } from "./domain/duel";
import { pvpLadderEntries, settlePvpTrophies, type LadderEntry } from "./domain/pvp-trophies";
import { pickBot } from "./domain/bots";
import { LADDERS, LEG_ROUNDS, LEGS, drawLegs, groupDef, isVariantOwned, legOfGroup, ownedGroups, type Ladder, type ModeGroup } from "./domain/duel-modes";
import { legOptions, newDuelRun, recordLeg, resolveRun, type DuelRun } from "./domain/duel-run";
import { emptySpoils, mergeSpoils } from "./domain/spoils";
import { ladderCards, nextMilestones, winStreak } from "./domain/duel-view";
import { DUEL_PREVIEW_NAMES, duelPreview } from "./domain/duel-preview";
import { DuelReveal } from "./components/duel-reveal";
import { DuelInterlude } from "./components/duel-interlude";
import type { Milestone } from "./domain/duel-rewards";
import { claimDuelMilestones, claimLeagueThemes, listDuels, saveDuel } from "./domain/duel-store";
import { isDebugEnabled } from "./domain/debug-flag";
import { DRAW_LEGS, PvpLobby, legChoiceGroups, type LegChoice, type PvpLobbyView } from "./components/pvp-lobby";
import { PvpInterlude } from "./components/pvp-interlude";
import { PvpResult } from "./components/pvp-result";
import { PvpHome } from "./components/pvp-home";
import { FriendsScreen } from "./components/friends-screen";
import { PlayerProfileScreen } from "./components/player-profile";
import { SocialLayer } from "./components/social-layer";
import { ratioPercent } from "./domain/hub-profile";
import type { FriendsView, PlayerProfile, PlayerSummary, SocialEvent } from "./domain/pvp-social";
import { PvpQueueLayer, type OfferActivity } from "./components/pvp-offer";
import { PvpNamePrompt } from "./components/pvp-name-prompt";
import { newPvpRun, pvpLegOptions, recordPvpLeg, roomLegs, type PvpRun } from "./domain/pvp-run";
import { IDLE_QUEUE_VIEW, isQueuePrefs, parseInvite, type LadderStandings, type LeaderboardRow, type PvpInvite, type PvpMode, type PvpProfileView, type PvpQueueNotice, type PvpQueueView, type PvpRoomView, type QueuePrefs } from "./domain/pvp";
import {
  PvpClientError, hasPvpIdentity, pvpCommand, pvpCreateRoom, pvpGetInvite, pvpGetRoom, pvpJoinRoom, pvpName as pvpStoredName, pvpProfile, pvpQueueGet, pvpQueueJoin, pvpQueueLeave,
  pvpChallenge, pvpFriendRemove, pvpFriendRequest, pvpFriendRespond, pvpFriends, pvpLeaderboard, pvpPlayer, pvpQueueRespond, pvpSendProfile, pvpServerMatches, pvpSubscribe, pvpSubscribeQueue, setPvpName as setPvpStoredName,
} from "./domain/pvp-client";
import { listPvpMatches, missingPvpRecords, savePvpMatch, type PvpMatchRecord } from "./domain/pvp-store";

const isUnPresetEntity = (id: string, meta: { un?: boolean } | undefined) =>
  Boolean(meta?.un || id === "336");

// Fila ("Buscar duelo"): o que a pessoa buscou por último e se havia uma busca ativa (para retomar depois de recarregar a página).
const QUEUE_PREFS_KEY = "carta-pvp-queue-prefs";
const QUEUE_ACTIVE_KEY = "carta-pvp-queue";
const readQueuePrefs = (): QueuePrefs => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(QUEUE_PREFS_KEY) ?? "null");
    if (isQueuePrefs(saved)) return { ladder: saved.ladder, mode: saved.mode };
  } catch { /* sem armazenamento ou valor velho */ }
  return { ladder: "mapas", mode: "friendly" };
};
/** Aviso da fila que ainda vale mostrar (o servidor guarda o último por um tempo; depois de recarregar a página, um aviso velho não reaparece). */
const FRESH_NOTICE_MS = 60000;


export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  // Duelo contra bots (liga no Hub): sempre Mundo inteiro, sem o filtro ONU; a escolha do solo fica guardada.
  const [duelMode, setDuelMode] = useState(false);
  // "Treinar" no resultado de uma derrota: a próxima partida é um Treino curto do modo, no Mundo inteiro e sem o filtro ONU.
  const [trainOnce, setTrainOnce] = useState(false);
  const [regionPref, setRegion] = useState<RegionSelection>("mundo");
  const [family, setFamily] = useState<Family>("mapa");
  const [topFamily, setTopFamily] = useState<TopFamily>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [onlyUnPref, setOnlyUn] = useState(true);
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
  // Duelos entre pessoas já terminados (IndexedDB): os valendo calculados neste aparelho mexem na mesma escada dos duelos contra bot (transição, 28/09).
  const [pvpMatches, setPvpMatches] = useState<PvpMatchRecord[]>([]);
  const [ladderLoaded, setLadderLoaded] = useState(false);
  const ladderEntries = useMemo<LadderEntry[]>(() => [...duels, ...pvpLadderEntries(pvpMatches)], [duels, pvpMatches]);
  const byLadder = useMemo(() => trophiesByLadder(ladderEntries), [ladderEntries]);
  const trophies = Math.max(byLadder.mapas, byLadder.bandeiras);
  // Onde a pessoa está em cada escada (troféus e MMR escondido): vai para o servidor (ranking, proposta da fila e a conta do adversário).
  const standings = useMemo<LadderStandings>(() => Object.fromEntries(LADDERS.map((ladder) => [ladder, { trophies: byLadder[ladder], mmr: mmrStateFromDuels(ladderEntries, ladder).mmr }])) as LadderStandings, [ladderEntries, byLadder]);
  useEffect(() => {
    void Promise.all([listDuels(), listPvpMatches().catch(() => [] as PvpMatchRecord[])]).then(async ([list, matches]) => {
      setDuels(list);
      setPvpMatches(matches);
      setLadderLoaded(true);
      // ao abrir: paga o que faltar (marco novo ou a diferença de um prêmio que foi aumentado) e atualiza o saldo
      const entries = [...list, ...pvpLadderEntries(matches)];
      await claimDuelMilestones(trophiesByLadder(entries)).catch(() => []);
      await claimLeagueThemes(trophiesByLadder(entries)).catch(() => [] as string[]);
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
  const [supplies, setSupplies] = useState<SupplyCounts>(emptySupplyCounts());
  const refreshSupplies = () => supplyCounts().then(setSupplies).catch(() => undefined);
  // Rodadas compradas valem para todos os modos; se a opção escolhida ainda não foi liberada, volta para 10.
  const arenaCards = useMemo(() => ladderCards(ladderEntries, economy.unlocked), [ladderEntries, economy.unlocked]);
  const arenaNext = useMemo(() => nextMilestones(ladderEntries), [ladderEntries]);
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
  // Troféus do duelo valendo contra pessoa (calculados aqui, na hora do resultado; ver pvp-trophies.ts).
  const [pvpTrophy, setPvpTrophy] = useState<{ delta: number; before: number; after: number } | null>(null);
  // Força do valendo e V/D/E: o servidor é a fonte (GET /me); o aparelho só mostra.
  const [pvpProfileView, setPvpProfileView] = useState<PvpProfileView | null>(null);
  const refreshPvpProfile = () => { void pvpProfile().then(setPvpProfileView).catch(() => undefined); };
  // Ranking (só gente de verdade, do servidor) e o que este aparelho informa a ele: troféus e MMR de cada escada, ao abrir o app e sempre que mudam.
  // Quem nunca usou o duelo com pessoas não é registrado à toa (pvpSendProfile não faz nada sem identidade); o ranking dá para ver assim mesmo.
  const [boards, setBoards] = useState<Record<Ladder, readonly LeaderboardRow[] | null>>({ mapas: null, bandeiras: null });
  const refreshBoards = () => {
    for (const ladder of LADDERS) void pvpLeaderboard(ladder).then((rows) => setBoards((current) => ({ ...current, [ladder]: rows }))).catch(() => undefined);
  };
  // O resumo do perfil (o que só o aparelho sabe) vai junto: é o que os amigos veem no perfil da pessoa.
  const profileSummary = useMemo<PlayerSummary>(() => ({
    level: economy.level, xp: economy.xp, mastery: ratioPercent(economy.dominated, data?.mapEntityIds.length ?? 0), dominated: economy.dominated,
    rounds: economy.rounds, sessions: economy.completedSessions, collection: collectionSummary,
    achievements: { unlocked: achievementSummary.unlocked, total: achievementSummary.total },
    botDuels: { wins: duels.filter((duel) => duel.outcome === "win").length, losses: duels.filter((duel) => duel.outcome === "loss").length, draws: duels.filter((duel) => duel.outcome === "draw").length },
  }), [economy, data, collectionSummary, achievementSummary, duels]);
  const standingsKey = JSON.stringify(standings);
  const summaryKey = JSON.stringify(profileSummary);
  const [identityOn, setIdentityOn] = useState(() => hasPvpIdentity());
  useEffect(() => {
    if (!ladderLoaded || !economyReady || !identityOn) return;
    const timer = window.setTimeout(() => { void pvpSendProfile(pvpNameState, standings, profileSummary).then(refreshBoards).catch(() => undefined); }, 600);
    return () => window.clearTimeout(timer);
  }, [ladderLoaded, economyReady, identityOn, standingsKey, summaryKey]);
  useEffect(() => { if ((screen === "hub" && duelMode) || screen === "league") refreshBoards(); }, [screen, duelMode]);
  // ---- Fila ("Buscar duelo") ----
  const [pvpQueue, setPvpQueueState] = useState<PvpQueueView>(IDLE_QUEUE_VIEW);
  const pvpQueueRef = useRef<PvpQueueView>(IDLE_QUEUE_VIEW);
  const queueUnsubRef = useRef<(() => void) | null>(null);
  const [queuePrefs, setQueuePrefsState] = useState<QueuePrefs>(readQueuePrefs);
  const setQueuePrefs = (prefs: QueuePrefs) => { setQueuePrefsState(prefs); try { localStorage.setItem(QUEUE_PREFS_KEY, JSON.stringify(prefs)); } catch { /* sem armazenamento */ } };
  const [queueNotice, setQueueNotice] = useState<PvpQueueNotice | null>(null);
  const lastNoticeAtRef = useRef(0);
  const enteredMatchRef = useRef<string | null>(null);
  // Os dois tempos, para a tabela do resultado: vêm de novo da semente (a mesma conta que os dois jogadores fizeram para jogar).
  const pvpResultLegs = useMemo(() => (pvpRoom ? roomLegs(pvpRoom) : null), [pvpRoom?.seed, pvpRoom?.ladder, pvpRoom?.groups?.join()]);
  // Duelo (contra bot ou com amigo): sempre Mundo inteiro, sem o filtro ONU — os dois lados do PvP precisam do MESMO baralho disponível
  // (a semente sozinha não basta se o recorte/filtro pessoal de cada aparelho for diferente; region/onlyUn não podem vir da preferência solo).
  const region: RegionSelection = duelMode || trainOnce || pvpRoom ? "mundo" : regionPref;
  const onlyUn = duelMode || trainOnce || pvpRoom ? false : onlyUnPref;
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
  // Assim que os dois duelos (Ana e Beto) terminam do lado do servidor, guarda o histórico local com a mudança de força que O SERVIDOR calculou
  // (só no valendo; o servidor guarda a dele em .pvp-data/matches.jsonl e é a fonte).
  useEffect(() => {
    const room = pvpRoom;
    if (!room || !room.result || !room.opponent || pvpSettledCodeRef.current === room.code) return;
    pvpSettledCodeRef.current = room.code;
    const rating = room.result.rating;
    const ratingDelta = rating ? rating.you.after - rating.you.before : null;
    // os grupos dos dois tempos vêm de novo da semente (a mesma conta que os dois jogadores fizeram para jogar); sem semente (nunca deveria acontecer
    // com a sala já fechada), fica sem o detalhe dos tempos, só o placar total.
    const groups = roomLegs(room);
    const legs: PvpMatchRecord["legs"] = groups
      ? groups.map((leg, index) => ({
        group: leg.group,
        youCorrect: room.result!.you.legs[index]?.correct ?? 0, opponentCorrect: room.result!.opponent.legs[index]?.correct ?? 0,
        total: leg.rounds, youMs: room.result!.you.legs[index]?.ms ?? null, opponentMs: room.result!.opponent.legs[index]?.ms ?? null,
      }))
      : undefined;
    const id = `pvp:${room.code}`;
    // Valendo: troféus e MMR da escada, a mesma conta do duelo contra bot, com o MMR do adversário no lugar do rating do bot. Calculado uma vez só
    // (se o registro já tem troféus, não refaz).
    let ladderFields: Partial<PvpMatchRecord> = {};
    const known = pvpMatches.find((match) => match.id === id);
    if (room.mode === "ranked" && typeof known?.trophyDelta !== "number") {
      const prior: LadderEntry[] = [...duels, ...pvpLadderEntries(pvpMatches.filter((match) => match.id !== id))];
      const before = trophiesFromDuels(prior, room.ladder);
      const state = mmrStateFromDuels(prior, room.ladder);
      const settled = settlePvpTrophies({
        trophies: before, mmr: state.mmr, sigma: state.sigma, samples: state.samples, streak: winStreak(prior.filter((entry) => entry.ladder === room.ladder)),
        opponentMmr: room.opponent.mmr ?? room.opponent.trophies, outcome: room.result.outcome, margin: room.result.you.correct - room.result.opponent.correct,
      });
      ladderFields = {
        trophyDelta: settled.trophyDelta, trophiesBefore: before, opponentTrophies: room.opponent.trophies,
        mmrDelta: settled.mmrDelta, mmrVersion: settled.mmrVersion, mmrSigma: settled.mmrSigma, mmrExp: settled.mmrExp,
      };
      setPvpTrophy({ delta: settled.trophyDelta, before, after: settled.trophiesAfter });
    } else if (known && typeof known.trophyDelta === "number") {
      setPvpTrophy({ delta: known.trophyDelta, before: known.trophiesBefore ?? 0, after: (known.trophiesBefore ?? 0) + known.trophyDelta });
    }
    const record: PvpMatchRecord = {
      ...(known ?? {}),
      id, code: room.code, at: known?.at ?? Date.now(), ladder: room.ladder, mode: room.mode,
      opponentName: room.opponent.name, opponentRating: rating?.opponent.before ?? room.opponent.rating, ...(room.opponent.code ? { opponentCode: room.opponent.code } : {}),
      youCorrect: room.result.you.correct, opponentCorrect: room.result.opponent.correct, totalRounds: LEG_ROUNDS * LEGS,
      outcome: room.result.outcome, tiebreak: room.result.tiebreak,
      youForfeited: room.result.you.forfeited, opponentForfeited: room.result.opponent.forfeited,
      youMs: room.result.you.ms, opponentMs: room.result.opponent.ms,
      legs, ratingDelta, ...ladderFields,
    };
    const nextMatches = [...pvpMatches.filter((match) => match.id !== id), record];
    setPvpMatches(nextMatches);
    void savePvpMatch(record).then(async () => {
      if (room.mode !== "ranked") return;
      // subiu de divisão ou de liga contra uma pessoa: os mesmos marcos e temas de liga do duelo contra bot
      const entries = [...duels, ...pvpLadderEntries(nextMatches)];
      await claimDuelMilestones(trophiesByLadder(entries)).catch(() => []);
      await claimLeagueThemes(trophiesByLadder(entries)).catch(() => [] as string[]);
      void refreshEconomy();
    }).catch(() => undefined);
    refreshPvpProfile();
  }, [pvpRoom]);
  /** A tela "Fulano te desafiou" de um convite (link ?duelo= ou desafio de um amigo). */
  const openInvite = (code: string) => {
    setPvpInviteCode(code);
    setPvpEntry("invite");
    setPvpInviteLoading(true);
    setScreen("pvp-lobby");
    pvpGetInvite(code).then(setPvpInvitePreview).catch((error) => setPvpError(pvpErrorMessage(error))).finally(() => setPvpInviteLoading(false));
  };
  // Link de convite (?duelo=CÓDIGO): abre direto na tela do convite, sem precisar do Hub.
  useEffect(() => {
    const code = parseInvite(location.search);
    if (!code) return;
    history.replaceState(null, "", location.pathname);
    openInvite(code);
  }, []);
  const pvpReset = () => {
    pvpUnsubRef.current?.();
    pvpUnsubRef.current = null;
    setPvpRoom(null); setPvpRun(null); setPvpEntry(null); setPvpInvitePreview(null); setPvpInviteCode(null);
    setPvpError(null); setPvpBusy(false); setPvpTrophy(null);
    pvpSettledCodeRef.current = null;
  };
  // Os modos do amistoso na criação do convite (sorteio ou os 2 escolhidos); volta ao sorteio a cada convite novo.
  const [pvpLegChoice, setPvpLegChoice] = useState<LegChoice>(DRAW_LEGS);
  const pvpOpenSetup = (ladder: Ladder) => { pvpReset(); setPvpEntry("setup"); setPvpSetupLadder(ladder); setPvpModeState("friendly"); setPvpLegChoice(DRAW_LEGS); setScreen("pvp-lobby"); };
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
    const run = newPvpRun({ code: room.code, ladder: room.ladder, mode: room.mode, isHost: room.host, seed: room.seed, groups: room.groups });
    setPvpRun(run);
    startPvpLeg(run, 0);
  };
  const handlePvpView = (view: PvpRoomView) => {
    const previous = pvpRoomRef.current;
    setPvpRoom(view);
    if (view.phase === "playing" && (!previous || previous.phase !== "playing") && !pvpRunRef.current) startPvpRun(view);
  };
  const pvpSubscribeTo = (code: string) => { setIdentityOn(true); pvpUnsubRef.current?.(); pvpUnsubRef.current = pvpSubscribe(code, handlePvpView, (error) => setPvpError(pvpErrorMessage(error))); };
  const pvpCreate = async () => {
    const name = pvpNameState.trim();
    if (!name) return;
    setPvpBusy(true); setPvpError(null);
    try { const room = await pvpCreateRoom(pvpSetupLadder, pvpMode, name, standings, pvpMode === "friendly" ? legChoiceGroups(pvpLegChoice) : undefined); setPvpRoom(room); pvpSubscribeTo(room.code); }
    catch (error) { setPvpError(pvpErrorMessage(error)); }
    setPvpBusy(false);
  };
  const pvpJoin = async () => {
    const name = pvpNameState.trim();
    if (!name || !pvpInviteCode) return;
    setPvpBusy(true); setPvpError(null);
    try { const room = await pvpJoinRoom(pvpInviteCode, name, standings); setPvpRoom(room); pvpSubscribeTo(room.code); }
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
    // sala da fila, ou o "Convidar amigo" aberto a partir da tela da fila: volta para ela; o resto volta ao Hub
    const toPvpHome = room?.origin === "queue" || (!room && pvpEntry === "setup");
    pvpReset();
    if (toPvpHome) { setScreen("pvp-home"); refreshPvpProfile(); } else setScreen("hub");
  };
  const pvpDecline = () => { pvpReset(); setScreen("hub"); };
  const pvpGoHome = () => { pvpReset(); setScreen("hub"); };
  const pvpRematch = () => {
    const room = pvpRoomRef.current;
    if (room?.origin === "queue") { pvpOpenHome(); return; }
    const ladder = room?.ladder ?? "mapas"; pvpReset(); pvpOpenSetup(ladder);
  };
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

  // ---- Fila ("Buscar duelo"): a visão chega pelo canal do jogador (SSE /me/events) e pelas respostas dos pedidos ----
  /** Entra na sala que a fila achou (os dois aceitaram). Encerra o que estiver em andamento: o duelo contra bot é ANULADO (sem registro: nenhum troféu
   *  ganho nem perdido; os tempos já terminados continuam pagos e contando para a maestria) e a partida solo fecha incompleta ao sair da tela, sem moedas. */
  const enterMatchedRoom = async (code: string) => {
    if (enteredMatchRef.current === code) return;
    enteredMatchRef.current = code;
    let room: PvpRoomView;
    try { room = await pvpGetRoom(code); }
    catch (error) { enteredMatchRef.current = null; setPvpError(pvpErrorMessage(error)); return; }
    // já começou ou acabou (a página recarregou no meio do duelo): retomar um duelo em andamento ainda não existe, então não entra por aqui
    if (room.phase !== "lobby" && room.phase !== "countdown") return;
    if (duelRunRef.current) { setDuelRun(null); legResults.current = [null, null]; }
    setTrainOnce(false);
    void refreshEconomy();
    pvpUnsubRef.current?.();
    pvpUnsubRef.current = null;
    setPvpRun(null); setPvpEntry(null); setPvpInvitePreview(null); setPvpInviteCode(null); setPvpError(null); setPvpTrophy(null);
    pvpSettledCodeRef.current = null;
    setPvpRoom(room);
    pvpSubscribeTo(code);
    setScreen("pvp-lobby");
  };
  const applyQueueView = (view: PvpQueueView, fromStream: boolean) => {
    // A resposta de um pedido pode chegar depois de uma visão mais nova do canal: fica a mais nova. O canal sempre vale (se o servidor reiniciou, a revisão recomeça).
    if (!fromStream && pvpQueueRef.current.rev > view.rev) return;
    pvpQueueRef.current = view;
    setPvpQueueState(view);
    if (!identityOn && hasPvpIdentity()) setIdentityOn(true);
    if (view.notice && view.notice.at > lastNoticeAtRef.current) {
      lastNoticeAtRef.current = view.notice.at;
      if (view.serverNow - view.notice.at < FRESH_NOTICE_MS) setQueueNotice(view.notice);
    }
    try { if (view.state === "idle") localStorage.removeItem(QUEUE_ACTIVE_KEY); else localStorage.setItem(QUEUE_ACTIVE_KEY, "1"); } catch { /* sem armazenamento */ }
    if (view.state === "matched" && view.room) void enterMatchedRoom(view.room);
  };
  // o canal chama sempre a versão mais nova (as funções acima leem estado desta renderização)
  const applyQueueViewRef = useRef(applyQueueView);
  applyQueueViewRef.current = applyQueueView;
  // O canal fica aberto enquanto a busca vale (o servidor só mantém na fila quem está com o app aberto) e até a sala da fila começar (se o outro sair
  // antes, é por ele que chega a volta para a fila).
  const inQueueRoomBeforePlay = pvpRoom?.origin === "queue" && (pvpRoom.phase === "lobby" || pvpRoom.phase === "countdown" || pvpRoom.phase === "closed");
  const queueChannelWanted = pvpQueue.state === "waiting" || pvpQueue.state === "offer" || (pvpQueue.state === "matched" && !pvpRoom) || inQueueRoomBeforePlay;
  // Quem já usa o duelo com pessoas fica com o canal aberto enquanto o app está aberto: é assim que os amigos o veem online e recebem avisos e desafios.
  const channelWanted = queueChannelWanted || identityOn;
  useEffect(() => {
    if (channelWanted && !queueUnsubRef.current) queueUnsubRef.current = pvpSubscribeQueue((view) => applyQueueViewRef.current(view, true), undefined, (event) => handleSocialRef.current(event));
    if (!channelWanted && queueUnsubRef.current) { queueUnsubRef.current(); queueUnsubRef.current = null; }
  }, [channelWanted]);
  useEffect(() => () => queueUnsubRef.current?.(), []);
  // Ao abrir o app: retoma a busca que estava ativa (recarregou a página) e traz para o aparelho os duelos que só o servidor tem (o app fechou antes
  // do resultado). Só para quem já usou o PvP: quem nunca entrou não é registrado no servidor à toa.
  useEffect(() => {
    if (!hasPvpIdentity()) return;
    let active = false;
    try { active = localStorage.getItem(QUEUE_ACTIVE_KEY) === "1"; } catch { /* sem armazenamento */ }
    if (active) void pvpQueueGet().then((view) => applyQueueViewRef.current(view, false)).catch(() => undefined);
    void Promise.all([pvpServerMatches(100), listPvpMatches()])
      .then(async ([server, local]) => {
        const missing = missingPvpRecords(server, local);
        for (const record of missing) await savePvpMatch(record);
        if (missing.length) setPvpMatches(await listPvpMatches());
      })
      .catch(() => undefined);
  }, []);
  const pvpOpenHome = (ladder?: Ladder, mode?: PvpMode) => {
    pvpReset();
    if (ladder && pvpQueueRef.current.state === "idle") setQueuePrefs({ ladder, mode: mode ?? queuePrefs.mode });
    setScreen("pvp-home");
    refreshPvpProfile();
  };
  // ---- Amigos e perfil de jogador ----
  const [friendsView, setFriendsView] = useState<FriendsView | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [socialNotice, setSocialNotice] = useState<Exclude<SocialEvent, { kind: "challenge" }> | null>(null);
  const [challenge, setChallenge] = useState<Extract<SocialEvent, { kind: "challenge" }> | null>(null);
  const [playerCode, setPlayerCode] = useState<string | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const playerReturnRef = useRef<Screen>("hub");
  const socialErrorMessage = (error: unknown) => {
    if (error instanceof PvpClientError) {
      if (error.code === "not_found") return t.social.msgNotFound;
      if (error.code === "bad_request") return t.social.msgSelf;
      if (error.code === "too_many") return t.social.msgFull;
      if (error.code === "wrong_phase") return t.social.msgOffline;
    }
    return pvpErrorMessage(error);
  };
  const loadFriends = async () => {
    setFriendsLoading(true);
    try { setFriendsView(await pvpFriends()); setIdentityOn(true); } catch (error) { setSocialError(pvpErrorMessage(error)); }
    setFriendsLoading(false);
  };
  const loadPlayer = async (code: string) => {
    setPlayerLoading(true);
    try { setPlayerProfile(await pvpPlayer(code)); setIdentityOn(true); } catch (error) { setSocialError(socialErrorMessage(error)); }
    setPlayerLoading(false);
  };
  const openFriends = () => { setSocialError(null); setSocialMessage(null); setScreen("friends"); void loadFriends(); };
  const openPlayer = (code: string) => {
    if (screen !== "player") playerReturnRef.current = screen;
    setSocialError(null); setPlayerCode(code); setPlayerProfile(null); setScreen("player");
    void loadPlayer(code);
  };
  const nameOf = (code: string, view: FriendsView | null) =>
    [...(view?.friends ?? []), ...(view?.incoming ?? []), ...(view?.outgoing ?? [])].find((item) => item.code === code)?.name ?? (playerProfile?.code === code ? playerProfile.name : code);
  /** Roda uma ação de amizade: atualiza a lista, o perfil aberto e a mensagem. */
  const socialAction = async (run: () => Promise<FriendsView>, message?: (view: FriendsView) => string | null) => {
    setSocialBusy(true); setSocialError(null); setSocialMessage(null);
    try {
      const view = await run();
      setFriendsView(view);
      setIdentityOn(true);
      if (message) setSocialMessage(message(view));
      if (playerCode && screen === "player") void loadPlayer(playerCode);
    } catch (error) { setSocialError(socialErrorMessage(error)); }
    setSocialBusy(false);
  };
  const friendAdd = (code: string) => socialAction(async () => {
    const { result, friends } = await pvpFriendRequest(code, pvpNameState);
    setSocialMessage(result === "accepted" ? t.social.msgAccepted(nameOf(code, friends)) : result === "already" ? t.social.msgAlready : t.social.msgSent(nameOf(code, friends)));
    return friends;
  }).then(() => undefined);
  const friendRespond = (code: string, accept: boolean) => socialAction(() => pvpFriendRespond(code, accept, pvpNameState), (view) => (accept ? t.social.msgAccepted(nameOf(code, view)) : null));
  const friendRemove = (code: string) => socialAction(() => pvpFriendRemove(code));
  /** Desafio direto: cria o convite (você é o anfitrião) e vai para o lobby; o amigo recebe o aviso na hora. */
  const friendChallenge = async (code: string, ladder: Ladder, mode: PvpMode, groups?: [ModeGroup, ModeGroup]) => {
    setSocialBusy(true); setSocialError(null); setSocialMessage(null);
    try {
      const room = await pvpChallenge(code, ladder, mode, pvpNameState.trim(), standings, groups);
      pvpReset(); setPvpEntry("setup"); setPvpSetupLadder(ladder); setPvpModeState(mode);
      setPvpRoom(room); pvpSubscribeTo(room.code); setScreen("pvp-lobby");
    } catch (error) { setSocialError(socialErrorMessage(error)); }
    setSocialBusy(false);
  };
  /** Aceitar o desafio de um amigo: entra direto no convite (sem nome ainda, a tela do convite pede). */
  const joinChallenge = async (event: Extract<SocialEvent, { kind: "challenge" }>) => {
    setChallenge(null);
    pvpReset();
    const name = pvpNameState.trim();
    if (!name) { openInvite(event.room); return; }
    setPvpInviteCode(event.room); setPvpEntry("invite"); setPvpBusy(true); setScreen("pvp-lobby");
    try { const room = await pvpJoinRoom(event.room, name, standings); setPvpRoom(room); pvpSubscribeTo(room.code); }
    catch (error) { setPvpError(pvpErrorMessage(error)); void pvpGetInvite(event.room).then(setPvpInvitePreview).catch(() => undefined); }
    setPvpBusy(false);
  };
  const handleSocial = (event: SocialEvent) => {
    if (event.kind === "challenge") { setChallenge(event); return; }
    setSocialNotice(event);
    if (screen === "friends") void loadFriends();
    if (screen === "player" && playerCode === event.from.code) void loadPlayer(event.from.code);
  };
  const handleSocialRef = useRef(handleSocial);
  handleSocialRef.current = handleSocial;
  // No resultado de um duelo contra pessoa: a lista de amigos decide se aparece "Adicionar amigo".
  useEffect(() => { if (screen === "pvp-result" && identityOn) void pvpFriends().then(setFriendsView).catch(() => undefined); }, [screen]);

  const queueSearch = async () => {
    const name = pvpNameState.trim();
    if (!name) return;
    setPvpBusy(true); setPvpError(null); setQueueNotice(null);
    try { applyQueueView(await pvpQueueJoin(queuePrefs, name, standings), false); }
    catch (error) { setPvpError(error instanceof PvpClientError && error.code === "wrong_phase" ? t.pvp.home.busy : pvpErrorMessage(error)); }
    setPvpBusy(false);
  };
  // Arena do Hub: "Duelar" busca uma pessoa no valendo daquela escada, direto do Hub. Sem nome ainda salvo, um diálogo pede o nome por cima do
  // Hub (pvpNamePrompt); confirmando, entra na fila na hora, sem precisar visitar a tela da fila.
  const [arenaError, setArenaError] = useState<{ ladder: Ladder; message: string } | null>(null);
  const [pvpNamePrompt, setPvpNamePrompt] = useState<Ladder | null>(null);
  const arenaSearchWithName = async (ladder: Ladder, name: string) => {
    const prefs: QueuePrefs = { ladder, mode: "ranked" };
    setArenaError(null);
    setQueuePrefs(prefs);
    setPvpBusy(true); setPvpError(null); setQueueNotice(null);
    try { applyQueueView(await pvpQueueJoin(prefs, name, standings), false); }
    catch (error) { setArenaError({ ladder, message: error instanceof PvpClientError && error.code === "wrong_phase" ? t.pvp.home.busy : pvpErrorMessage(error) }); }
    setPvpBusy(false);
  };
  const arenaSearch = async (ladder: Ladder) => {
    setArenaError(null);
    const name = pvpNameState.trim();
    if (!name) { setPvpNamePrompt(ladder); return; }
    await arenaSearchWithName(ladder, name);
  };
  const confirmPvpName = (name: string) => {
    const ladder = pvpNamePrompt;
    setPvpNamePrompt(null);
    setPvpDisplayName(name);
    if (ladder) void arenaSearchWithName(ladder, name);
  };
  const queueCancel = async () => {
    setPvpBusy(true); setPvpError(null);
    try { applyQueueView(await pvpQueueLeave(), false); } catch (error) { setPvpError(pvpErrorMessage(error)); }
    setPvpBusy(false);
  };
  const queueRespond = async (accept: boolean) => {
    const offer = pvpQueueRef.current.offer;
    if (!offer) return;
    try { applyQueueView(await pvpQueueRespond(offer.id, accept), false); } catch (error) { setPvpError(pvpErrorMessage(error)); }
  };
  // O que aceitar a proposta encerra (a proposta avisa antes): duelo contra bot já começado (anulado) ou partida solo (sem moedas).
  const offerActivity: OfferActivity = duelRun && (screen === "game" || screen === "duel-interlude") ? "bot-duel" : screen === "game" && !pvpRun ? "solo" : "none";

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
    const streak = winStreak(ladderEntries.filter((duel) => duel.ladder === ladder));
    const state = mmrStateFromDuels(ladderEntries, ladder);
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
    // a escada soma os duelos contra bot e os valendo contra pessoas
    const nextEntries = [...nextDuels, ...pvpLadderEntries(pvpMatches)];
    // Marcos de divisão e de liga: crédito único no livro-caixa (não repete se os troféus caírem e subirem de novo).
    const milestones: readonly Milestone[] = await saveDuel(record).then(() => claimDuelMilestones(trophiesByLadder(nextEntries))).catch(() => []);
    // Tema de liga: dado uma vez ao entrar na liga (melhor das duas escadas); o resultado avisa quando foi este duelo que abriu.
    const themesGranted = await claimLeagueThemes(trophiesByLadder(nextEntries)).catch(() => [] as string[]);
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
      streakBefore: run.streak, streakAfter: winStreak(nextEntries.filter((duel) => duel.ladder === run.ladder)), streakBonus: outcome.streakBonus, perfBonus: outcome.perfBonus, abandoned: run.done.length < LEGS,
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
    void refreshSupplies();
    setScreen("recorte");
  };
  const finishGame = async (result: SessionResult | null) => {
    if (duelRunRef.current) { await finishLeg(result); return; }
    if (pvpRunRef.current) { await finishPvpLeg(result); return; }
    void refreshSupplies();
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
  // Suprimentos de expedição: preço fixo por unidade, compra qualquer quantidade de uma vez.
  const buySupplyItem = async (id: SupplyId, qty: number) => { await buySupply(id, qty); await Promise.all([refreshEconomy(), refreshSupplies()]); };
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
    void refreshSupplies();
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

  // A fila vale em qualquer tela: a proposta, o indicador de busca e os avisos ficam por cima da página.
  const queueLayer = (
    <PvpQueueLayer
      queue={pvpQueue}
      inGame={screen === "game"}
      activity={offerActivity}
      showPill={screen !== "game" && screen !== "pvp-home" && screen !== "pvp-lobby"}
      notice={screen === "pvp-home" || screen === "game" ? null : queueNotice}
      onAccept={() => void queueRespond(true)}
      onDecline={() => void queueRespond(false)}
      onOpenHome={() => pvpOpenHome()}
      onDismissNotice={() => setQueueNotice(null)}
    />
  );
  // Avisos de amizade e desafios de amigos: nunca por cima de uma partida (o desafio espera ela acabar; o convite fica aberto no servidor).
  const inMatch = screen === "game" || screen === "pvp-interlude" || screen === "duel-interlude" || (screen === "pvp-lobby" && Boolean(pvpRoom));
  const socialLayer = (
    <SocialLayer
      notice={inMatch ? null : socialNotice}
      challenge={inMatch ? null : challenge}
      onDismissNotice={() => setSocialNotice(null)}
      onOpenFriends={() => { setSocialNotice(null); openFriends(); }}
      onJoin={(event) => void joinChallenge(event)}
      onDeclineChallenge={() => setChallenge(null)}
    />
  );
  const page = (() => {
  if (screen === "friends") {
    return <div className="app-shell grain"><FriendsScreen view={friendsView} loading={friendsLoading} error={socialError} message={socialMessage} busy={socialBusy} onAdd={(code) => void friendAdd(code)} onRespond={(code, accept) => void friendRespond(code, accept)} onRemove={(code) => void friendRemove(code)} onOpenPlayer={openPlayer} onChallenge={(code, ladder, mode, groups) => void friendChallenge(code, ladder, mode, groups)} onBack={() => setScreen("hub")} /></div>;
  }
  if (screen === "player") {
    return <div className="app-shell grain"><PlayerProfileScreen profile={playerProfile} loading={playerLoading} error={socialError} busy={socialBusy}
      onAdd={() => playerCode && void friendAdd(playerCode)} onRespond={(accept) => playerCode && void friendRespond(playerCode, accept)} onRemove={() => playerCode && void friendRemove(playerCode)}
      onChallenge={openFriends} onBack={() => setScreen(playerReturnRef.current === "player" ? "hub" : playerReturnRef.current)} /></div>;
  }
  if (screen === "pvp-home") {
    return <div className="app-shell grain"><PvpHome standings={standings} onFriends={openFriends} prefs={queuePrefs} onPrefsChange={setQueuePrefs} name={pvpNameState} onNameChange={setPvpDisplayName} queue={pvpQueue} profile={pvpProfileView} busy={pvpBusy} error={pvpError} notice={queueNotice} onDismissNotice={() => setQueueNotice(null)} onSearch={() => void queueSearch()} onCancel={() => void queueCancel()} onInvite={() => pvpOpenSetup(queuePrefs.ladder)} onPlayBots={() => { setDuelMode(true); setScreen("hub"); }} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "result") {
    return <div className="app-shell grain">{lastResult
      ? <ResultScreen view={lastResult} duel={lastDuel} onLeague={() => openLeague(lastDuel?.ladder)} onTrain={(group) => void trainGroup(group)} onStore={() => navigate("store")} onEquipTheme={setTheme} onAgain={lastDuel?.ladder ? () => openDuel(lastDuel.ladder!) : startGame} onAdjust={() => setScreen(lastDuel ? "hub" : "recorte")} onHome={() => setScreen("hub")} />
      : <main className="content"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button></main>}</div>;
  }
  if (screen === "progress" || screen === "collection" || screen === "achievements" || screen === "history") {
     return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current={screen === "history" ? "hub" : screen} onNavigate={navigate} onSurface={openSurface} /><Surface key={surfaceRevision} data={data} kind={screen} onBack={() => setScreen("hub")} economy={economy} onTrain={selectFamily} onOpenCollection={openCollectionAt} collectionRegion={collectionRegion} onOpenPlayer={openPlayer} /></div>;
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
    return <div className="app-shell grain"><PvpLobby view={view} name={pvpNameState} level={economy.level} legChoice={pvpLegChoice} onLegChoice={setPvpLegChoice} onNameChange={setPvpDisplayName} onModeChange={setPvpModeState} onCreate={() => void pvpCreate()} onJoin={() => void pvpJoin()} onDecline={pvpDecline} onReady={pvpToggleReady} onLeave={pvpLeaveLobby} onBack={pvpLeaveLobby} /></div>;
  }
  if (screen === "pvp-interlude" && pvpRun) {
    return <div className="app-shell grain"><PvpInterlude run={pvpRun} onContinue={pvpContinueLeg} /></div>;
  }
  if (screen === "pvp-result" && pvpRoom) {
    const coinsGained = Math.max(0, economy.balance - economyBeforeRef.current.balance);
    const xpGained = Math.max(0, economy.xp - economyBeforeRef.current.xp);
    const opponentCode = pvpRoom.opponent?.code ?? "";
    const friendship = !friendsView || !opponentCode ? "unknown"
      : friendsView.friends.some((item) => item.code === opponentCode) ? "friends"
        : friendsView.outgoing.some((item) => item.code === opponentCode) ? "outgoing"
          : friendsView.incoming.some((item) => item.code === opponentCode) ? "incoming" : "none";
    return <div className="app-shell grain"><PvpResult room={pvpRoom} legs={pvpResultLegs} trophy={pvpTrophy} coinsGained={coinsGained} xpGained={xpGained}
      friendship={friendship} onAddFriend={(code) => void friendAdd(code)} onOpenProfile={openPlayer} onRematch={pvpRematch} onHome={pvpGoHome} /></div>;
  }
  if (screen === "league") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="hub" onNavigate={navigate} onSurface={openSurface} /><LeagueScreen entries={ladderEntries} duels={duels} pvpMatches={pvpMatches} boards={boards} initialLadder={leagueLadder} onBack={() => setScreen("hub")} onOpenPlayer={openPlayer} /></div>;
  }
  if (screen === "store") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="store" onNavigate={navigate} onSurface={openSurface} /><main className="content surface" data-surface="store"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button><StoreView economy={economy} activeTheme={theme} onEquip={setTheme} onBuy={buyTheme} supplies={supplies} onBuySupply={buySupplyItem} /></main></div>;
  }
  if (screen === "options") {
    return <div className="app-shell grain"><Header legacy={legacy} economy={economy} current="options" onNavigate={navigate} onSurface={openSurface} /><OptionsScreen data={data} theme={theme} ownedUnlocks={economy.unlocked} onTheme={setTheme} onOpenStore={() => setScreen("store")} offlineMap={offlineMap} onToggleOfflineMap={async () => {
      if (offlineMap === "installed") { await removeOfflineMap(); setOfflineMap("available"); }
      else { setOfflineMap("downloading"); try { await downloadOfflineMap(); setOfflineMap("installed"); } catch { setOfflineMap("error"); } }
    }} onDebugChange={onDebugChange} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "game") {
    if (family === "capitais" && variant === "capital-pais") {
       return <Game data={playableData ?? data} features={gameFeatures} region={region} family={family} variant={variant} onlyUn={onlyUn} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} supplies={supplies} />;
    }
    if (family === "silhueta" || family === "travel") {
        return <GeometryGame family={family} variant={variant} data={playableData ?? data} region={region} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} supplies={supplies} />;
    }
    if (family === "historicas" || family === "idiomas" || family === "escrita") {
        const specialData = family === "historicas" || family === "idiomas" ? data : (playableData ?? data);
        return <SpecialQuiz data={specialData} family={family} variant={variant} region={region} onBack={leaveGame} onEnd={finishGame} options={sessionOptions} supplies={supplies} />;
    }
    if (family !== "mapa") {
      return (
        <QuizGame
          data={playableData ?? data}
          family={family}
            variant={variant as Exclude<QuizVariant, "mapa">}
          region={region}
          onBack={leaveGame}
          onEnd={finishGame} options={sessionOptions} supplies={supplies}
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
        onEnd={finishGame} options={sessionOptions} supplies={supplies}
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
          arenas={{
            cards: arenaCards, next: arenaNext, formatCost: roundUnlockFor("long")?.cost ?? 3000, boards,
            onFriends: openFriends, onOpenPlayer: openPlayer,
            search: { queue: pvpQueue, error: arenaError, busy: pvpBusy, onSearch: (ladder) => void arenaSearch(ladder), onCancel: () => void queueCancel(), onBot: openDuel, onFriendly: (ladder) => pvpOpenHome(ladder, "friendly") },
          }}
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
  })();
  const namePromptLayer = pvpNamePrompt && (
    <PvpNamePrompt busy={pvpBusy} error={pvpError} onConfirm={confirmPvpName} onCancel={() => setPvpNamePrompt(null)} />
  );
  return <>{page}{queueLayer}{socialLayer}{namePromptLayer}</>;
}