// Quanto tempo o retorno de uma resposta fica na tela antes de passar para a próxima pergunta. Lógica pura.
// Acerto: rápido, mas com sinal claro. Erro: a alternativa certa fica destacada tempo suficiente para a pessoa ver e aprender,
// sem exagero (e pode ser pulado com um toque ou Enter depois de um instante). Vale para todos os modos, menos "clicar no mapa".

export const FEEDBACK_HOLD_MS = {
  correct: 800,
  /** Erro em modo de alternativas: a resposta certa já está na tela, basta olhar. */
  wrongOptions: 2200,
  /** Erro em modo de escrita: a pessoa precisa comparar o que digitou com a grafia certa. */
  wrongTyped: 2800,
  /** Modos com cartão de aprendizado (Idiomas): dá tempo de ler o significado e onde o idioma é falado. */
  correctRich: 1800,
  wrongRich: 3200,
} as const;

/** Tempo mínimo antes de um toque/Enter poder pular o retorno (evita pular sem querer o Enter que acabou de responder). */
export const FEEDBACK_SKIP_AFTER_MS = { correct: 350, wrong: 900 } as const;

export const feedbackHoldMs = (correct: boolean, typed: boolean, rich = false) =>
  rich ? (correct ? FEEDBACK_HOLD_MS.correctRich : FEEDBACK_HOLD_MS.wrongRich)
    : correct ? FEEDBACK_HOLD_MS.correct : typed ? FEEDBACK_HOLD_MS.wrongTyped : FEEDBACK_HOLD_MS.wrongOptions;

export const feedbackSkipAfterMs = (correct: boolean) => (correct ? FEEDBACK_SKIP_AFTER_MS.correct : FEEDBACK_SKIP_AFTER_MS.wrong);
