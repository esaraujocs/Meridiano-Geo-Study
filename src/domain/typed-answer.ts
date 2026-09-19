export type TypedMatch = {
  normalized: string;
  exact: boolean;
  autoCommit: boolean;
};

export function normalizeTyped(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchTypedAnswer(value: string, answers: readonly string[], {
  requireUnambiguous = false,
}: { requireUnambiguous?: boolean } = {}): TypedMatch {
  const normalized = normalizeTyped(value);
  if (!normalized) return { normalized, exact: false, autoCommit: false };
  const candidates = [...new Set(answers.map(normalizeTyped).filter(Boolean))];
  const exact = candidates.includes(normalized);
  const ambiguous = candidates.some((candidate) =>
    candidate !== normalized && candidate.startsWith(normalized),
  );
  return { normalized, exact, autoCommit: exact && (!requireUnambiguous || !ambiguous) };
}