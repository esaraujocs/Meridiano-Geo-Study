// Duelos no IndexedDB (loja `preferences`, id `duel:<sessão>`): entram no Exportar/Importar progresso, como as Favoritas.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { DUEL_ID_PREFIX, DUEL_SOURCE, parseDuel, type DuelRecord } from "./duel.js";
import { milestoneLedgerId, milestoneTopUps, pendingMilestones, type Milestone, type TrophiesByLadder } from "./duel-rewards.js";
import { leagueOf } from "./league.js";
import { leagueThemesFor, themeUnlockKey } from "./themes.js";
import { BOT_RANKING_ID, settleBotMatch, type BotRankingState } from "./bot-ranking.js";
import { advanceStoredBotRanking, botRankingDay } from "./bot-ranking-store.js";

const STORE = "preferences";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listDuels(): Promise<DuelRecord[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows
      .filter((row) => String((row as { id?: unknown })?.id ?? "").startsWith(DUEL_ID_PREFIX))
      .map(parseDuel)
      .filter((item): item is DuelRecord => item !== null)
      .sort((a, b) => a.at - b.at);
  } finally { database.close(); }
}

export async function saveDuel(record: DuelRecord, playerMmrBefore?: number): Promise<BotRankingState> {
  const now = Date.now();
  const day = botRankingDay(now);
  const database = await openDatabase();
  try {
    return await new Promise<BotRankingState>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const duelRequest = store.get(record.id);
      const rankingRequest = store.get(BOT_RANKING_ID);
      let duelRow: unknown;
      let rankingRow: unknown;
      let ready = 0;
      let state: BotRankingState | undefined;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try { transaction.abort(); } catch { /* já abortada */ }
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const apply = () => {
        ready += 1;
        if (ready !== 2 || settled) return;
        try {
          state = advanceStoredBotRanking(rankingRow, day * 86_400_000);
          if (duelRow === undefined) {
            if (typeof playerMmrBefore !== "number" || !Number.isFinite(playerMmrBefore) || playerMmrBefore < 0) {
              throw new TypeError("A new duel requires the player's pre-match MMR to settle bot ranking.");
            }
            const botOutcome = record.outcome === "win" ? "loss" : record.outcome === "loss" ? "win" : "draw";
            state = settleBotMatch(state, {
              ladder: record.ladder,
              botId: record.botId,
              opponentMmr: playerMmrBefore,
              outcome: botOutcome,
              margin: record.botCorrect - record.playerCorrect,
            });
            store.put({ ...record, source: DUEL_SOURCE });
          }
          store.put(state);
        } catch (error) { fail(error); }
      };
      duelRequest.onsuccess = () => { duelRow = duelRequest.result; apply(); };
      rankingRequest.onsuccess = () => { rankingRow = rankingRequest.result; apply(); };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        if (state) resolve(state);
        else reject(new Error("Duel transaction completed without a bot ranking state."));
      };
      transaction.onerror = () => {
        if (!settled) { settled = true; reject(transaction.error ?? new Error("Duel transaction failed.")); }
      };
      transaction.onabort = () => {
        if (!settled) { settled = true; reject(transaction.error ?? new Error("Duel transaction was aborted.")); }
      };
    });
  } finally { database.close(); }
}

/** Dá os temas de liga a que a pessoa já tem direito (a melhor liga entre as duas escadas) e que ainda não estão desbloqueados. Cada tema é dado uma vez:
 *  o desbloqueio fica gravado e não some se os troféus caírem. Devolve os ids que entraram agora. */
export async function claimLeagueThemes(trophies: number | TrophiesByLadder): Promise<string[]> {
  const best = typeof trophies === "number" ? trophies : Math.max(0, ...Object.values(trophies).map((value) => value ?? 0));
  const themes = leagueThemesFor(leagueOf(best).index);
  if (!themes.length) return [];
  const database = await openDatabase();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const transaction = database.transaction("unlocks", "readwrite");
      const store = transaction.objectStore("unlocks");
      const granted: string[] = [];
      let pending = themes.length;
      for (const theme of themes) {
        const key = themeUnlockKey(theme.id);
        const owned = store.get(key);
        owned.onsuccess = () => {
          if (!owned.result) { store.put({ id: key, key, source: "league", unlockedAt: Date.now() }); granted.push(theme.id); }
          pending -= 1;
        };
      }
      transaction.oncomplete = () => resolve(granted);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

/** Credita no livro-caixa os marcos já alcançados que ainda não foram pagos (um crédito por marco, id único: nunca repete) e a diferença dos que
 *  foram pagos com um valor menor. Devolve só os marcos novos (a diferença entra sem aparecer no resultado). */
export async function claimDuelMilestones(trophies: number | TrophiesByLadder): Promise<Milestone[]> {
  const database = await openDatabase();
  try {
    return await new Promise<Milestone[]>((resolve, reject) => {
      const transaction = database.transaction("ledger", "readwrite");
      const store = transaction.objectStore("ledger");
      const rows = store.getAll();
      let granted: Milestone[] = [];
      rows.onsuccess = () => {
        const all = rows.result as { id?: unknown; amount?: unknown }[];
        granted = pendingMilestones(trophies, new Set(all.map((row) => String(row.id))));
        for (const milestone of granted) {
          store.put({ id: milestoneLedgerId(milestone), kind: "credit", amount: milestone.coins, reason: "duel-milestone", source: milestone.id, createdAt: Date.now() });
        }
        // marcos já pagos com o valor antigo ganham a diferença (uma vez por valor)
        const paid = new Map<string, number>();
        for (const row of all) if (String(row.id).startsWith("grant:duel:") && typeof row.amount === "number") paid.set(String(row.id), row.amount);
        for (const topup of milestoneTopUps(trophies, paid)) {
          store.put({ id: topup.id, kind: "credit", amount: topup.amount, reason: "duel-milestone-topup", source: topup.milestone.id, createdAt: Date.now() });
        }
      };
      transaction.oncomplete = () => resolve(granted);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
