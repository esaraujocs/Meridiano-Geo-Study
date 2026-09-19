export type MapAnswerKind = "contour" | "marker";

export function mapDeckSignature(ids: readonly string[]) {
  return ids.join("\u001f");
}

export function createMapRoundEngine(
  ids: readonly string[],
  { onComplete }: { onComplete?: (rounds: number) => void } = {},
) {
  let deck = [...ids];
  let signature = mapDeckSignature(ids);
  let cursor = 0;

  return {
    current() {
      return deck[cursor] ?? null;
    },
    progress() {
      return cursor;
    },
    reconcile(nextIds: readonly string[]) {
      const nextSignature = mapDeckSignature(nextIds);
      if (nextSignature === signature) return;
      deck = [...nextIds];
      signature = nextSignature;
      cursor = 0;
    },
    answer(selectedId: string, kind: MapAnswerKind) {
      const target = deck[cursor] ?? null;
      if (!target) return { correct: false, kind, progress: cursor, complete: true };
      const correct = selectedId === target;
      cursor += 1;
      const complete = cursor === deck.length;
      if (complete) onComplete?.(cursor);
      return { correct, kind, progress: cursor, complete };
    },
  };
}