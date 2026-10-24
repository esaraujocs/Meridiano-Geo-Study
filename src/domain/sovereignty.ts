// País × território. "País" é o que entra no filtro "Só países" da configuração: os 193 membros da ONU e o Vaticano (194; a Palestina não vem
// marcada como `un` no catálogo e fica de fora; os Desafios a contam, ver `isSovereign` em challenges.ts). O resto (Ossétia do Sul, Groenlândia, Porto Rico, Kosovo, Taiwan…) é "território" nas perguntas. Lógica pura.
export const isCountry = (id: string, meta: { un?: boolean } | undefined) => Boolean(meta?.un || id === "336");
