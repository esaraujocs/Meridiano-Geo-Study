// Regras da conta (usuário + senha) que o servidor (server/pvp-accounts.ts) e a tela (components/account-row.tsx) compartilham, para os dois lados dizerem "não" pelo
// mesmo motivo. A conta liga um usuário a UM id de jogador do PvP (server/pvp-players.ts): quem entra com ela em outro aparelho passa a ser o mesmo jogador (força,
// histórico, amigos). O progresso solo (IndexedDB) ainda NÃO acompanha a conta. Funções puras: sem rede, sem armazenamento.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Começa com letra ou número; depois letras, números, ponto, traço e sublinhado. Sem espaço nem acento: o usuário é digitado em vários aparelhos e teclados.
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type UsernameProblem = "short" | "long" | "chars";
export type PasswordProblem = "short" | "long";

export const cleanUsername = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
/** A chave de unicidade: "Enzo" e "enzo" são o mesmo usuário (o nome guarda como foi escrito, a chave não distingue maiúsculas). */
export const usernameKey = (username: string): string => username.toLowerCase();

export function usernameProblem(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN) return "short";
  if (username.length > USERNAME_MAX) return "long";
  return USERNAME_PATTERN.test(username) ? null : "chars";
}

/** Só tamanho: sem regra de "maiúscula + símbolo" (não deixa a senha melhor, só mais difícil de lembrar). Conta pelo texto, sem cortar nem trocar nada. */
export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return "short";
  return password.length > PASSWORD_MAX ? "long" : null;
}
