// Tamanhos das respostas digitadas (letras sem acento nem pontuação, com espaços: `typedChars`) dos nomes de país e das capitais do catálogo, em
// pares [letras, quantas]. O ranking dos bots sorteia daqui as respostas dos modos digitados nos duelos bot × bot (bot-ranking.ts). Gerado do
// public/data/legacy-map.json em 19/10/2026 (262 nomes, 256 capitais); não precisa ser exato, só ter a forma certa.
export const TYPED_LENGTHS: { readonly nome: readonly (readonly [number, number])[]; readonly capital: readonly (readonly [number, number])[] } = {
  nome: [[3, 2], [4, 9], [5, 27], [6, 32], [7, 48], [8, 29], [9, 21], [10, 18], [11, 14], [12, 6], [13, 7], [14, 11], [15, 7], [16, 4], [17, 2], [18, 2], [19, 3], [20, 5], [21, 2], [22, 2], [23, 1], [24, 3], [25, 1], [30, 2], [32, 1], [37, 1], [38, 1], [42, 1]],
  capital: [[3, 1], [4, 17], [5, 26], [6, 44], [7, 34], [8, 39], [9, 28], [10, 27], [11, 9], [12, 12], [13, 4], [14, 3], [16, 6], [17, 2], [18, 1], [19, 2], [24, 1]],
};
