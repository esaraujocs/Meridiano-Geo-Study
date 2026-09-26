export type Random = () => number;

export function seededRandom(seed: number): Random {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function shuffleSeeded<T>(items: readonly T[], seed = 1): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Semente do baralho de uma partida: a combinação das cartas com um sorteio, ou a semente combinada do duelo, se houver. */
export const deckSeedFor = (base: number, forced?: number) =>
  forced !== undefined ? forced >>> 0 : (base ^ Math.floor(Math.random() * 0x100000000)) >>> 0;

export function seedFromParts(...parts: (string | number)[]) {
  let hash = 2166136261;
  for (const part of parts.join("|")) {
    hash ^= part.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// `limit`: quantas cartas entram no baralho (rodadas da partida); sem valor, entra tudo.
export function createFiniteDeck<T>(
  items: readonly T[],
  seed = Math.floor(Math.random() * 0x100000000) >>> 0,
  limit?: number | null,
) {
  const shuffled = shuffleSeeded(items, seed);
  const deck = limit && limit > 0 ? shuffled.slice(0, limit) : shuffled;
  let cursor = 0;
  return {
    get size() {
      return deck.length;
    },
    get remaining() {
      return deck.length - cursor;
    },
    draw() {
      return deck[cursor++] ?? null;
    },
    values() {
      return [...deck];
    },
  };
}