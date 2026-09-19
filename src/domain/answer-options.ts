import type { Random } from "./finite-deck.js";

export function shuffleAnswerOptions<T>(
  items: readonly T[],
  random: Random = Math.random,
) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}