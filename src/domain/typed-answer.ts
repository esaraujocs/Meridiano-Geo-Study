export type TypedMatch = {
  normalized: string;
  exact: boolean;
  autoCommit: boolean;
};

export function normalizeTyped(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Chave de comparação da resposta digitada, mais tolerante que `normalizeTyped`: ignora apóstrofos, pontos e espaços ("St. George's" = "st georges" =
 *  "St Georges") e trata "Saint"/"St" (e "Sainte"/"Ste") como a mesma palavra. Só para comparar, nunca para mostrar. */
export function answerKey(value: string) {
  return normalizeTyped(value.replace(/['’ʼ`´]/g, ""))
    .replace(/\bsainte\b/g, "ste").replace(/\bsaint\b/g, "st")
    .replace(/ /g, "");
}

export function matchTypedAnswer(value: string, answers: readonly string[], {
  requireUnambiguous = false,
}: { requireUnambiguous?: boolean } = {}): TypedMatch {
  const normalized = answerKey(value);
  if (!normalized) return { normalized, exact: false, autoCommit: false };
  const candidates = [...new Set(answers.map(answerKey).filter(Boolean))];
  const exact = candidates.includes(normalized);
  const ambiguous = candidates.some((candidate) =>
    candidate !== normalized && candidate.startsWith(normalized),
  );
  return { normalized, exact, autoCommit: exact && (!requireUnambiguous || !ambiguous) };
}
/** Duas capitais com o mesmo nome (Victoria: Hong Kong e Seychelles; George Town/Georgetown: Ilhas Cayman, Guiana e Ascensão; Kingston: Jamaica e
 *  Ilha Norfolk; Oranjestad: Aruba e Santo Eustáquio). No Capitais · clicar a pergunta só mostra o nome, então clicar em qualquer uma vale. */
export function sameCapitalName(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const key = answerKey(a);
  return key !== "" && key === answerKey(b);
}
