// País × território. "País" é o que entra no filtro "Só países" da configuração: os 193 membros da ONU (o catálogo marca a Palestina como `un`)
// e o Vaticano. O resto (Ossétia do Sul, Groenlândia, Porto Rico, Kosovo, Taiwan…) é "território" nas perguntas. Lógica pura.
export const isCountry = (id: string, meta: { un?: boolean } | undefined) => Boolean(meta?.un || id === "336");
