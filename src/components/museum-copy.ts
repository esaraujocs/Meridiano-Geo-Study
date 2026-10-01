import type { Locale } from "../domain/i18n/locale";

export const museumCopy: Record<Locale, {
  eyebrow: string; title: string; intro: string; owned: (count: number, total: number) => string;
  archive: string; expedition: string; next: string; unavailable: string; fullCollection: string;
  noGameplay: string; localStorage: string; loading: string; loadError: string; retry: string;
  cost: string; balance: string; remaining: (amount: string) => string; shortfall: (amount: string) => string;
  reveal: string; confirm: string; cancel: string; confirmLine: (title: string, cost: string) => string;
  funding: string; fundingError: string; fundingInsufficient: string; success: string; refreshFailed: string; refreshRetry: string; ownershipUpdated: string;
  locked: string; acquired: string; open: string; close: string; detail: string; source: string; rights: string;
  author: string; institution: string; year: string; collectionEnd: string; revealMotion: string;
}> = {
  pt: {
    ownershipUpdated: "Esta peça já foi revelada em outra aba. Acervo atualizado; nenhuma nova compra foi feita.",
    eyebrow: "Acervo de geografia", title: "Museu Meridiano", intro: "Peças autênticas que contam como a Terra foi observada, nomeada e imaginada.",
    owned: (count, total) => `${count} de ${total} peças reveladas`, archive: "O atlas", expedition: "Próxima expedição",
    next: "Uma peça de cada vez, na ordem do acervo.", unavailable: "A expedição exige o valor integral; não há bônus nem atalhos.",
    fullCollection: "Acervo completo", noGameplay: "As peças são descobertas culturais. Nenhuma compra altera o jogo ou concede vantagem.",
    localStorage: "Compras e saldo do museu ficam salvos localmente neste aparelho. É possível jogar offline.",
    loading: "Abrindo o acervo…", loadError: "Não foi possível consultar o acervo neste aparelho.",
    retry: "Tentar novamente", cost: "Custo integral", balance: "Seu saldo", remaining: (amount) => `Após a expedição: ${amount}`,
    shortfall: (amount) => `Faltam ${amount} moedas para esta expedição.`, reveal: "Preparar expedição", confirm: "Confirmar e revelar",
    cancel: "Agora não", confirmLine: (title, cost) => `Você vai gastar ${cost} moedas para revelar “${title}”. Esta escolha é permanente.`,
    funding: "Registrando expedição…", fundingError: "A compra não foi concluída. Seu saldo não foi alterado; tente novamente.",
    fundingInsufficient: "O saldo mudou antes da confirmação. Nenhuma moeda foi gasta. Atualize o acervo e tente novamente.",
    success: "Peça revelada. O custo integral foi registrado.", locked: "Ainda não revelada", acquired: "Revelada",
    refreshFailed: "A compra foi salva, mas não foi possível atualizar todos os dados. A peça já está revelada; tente atualizar novamente.",
    refreshRetry: "Atualizar dados",
    open: "Ver peça", close: "Fechar detalhe", detail: "Sobre esta peça", source: "Ver registro da instituição",
    rights: "Direitos e reutilização", author: "Autoria", institution: "Acervo", year: "Ano",
    collectionEnd: "Você revelou todas as peças deste acervo.", revealMotion: "Nova peça revelada",
  },
  en: {
    ownershipUpdated: "This artifact was already revealed in another tab. Collection updated; no new purchase was made.",
    eyebrow: "Geography collection", title: "Meridiano Museum", intro: "Authentic artifacts tracing how Earth has been observed, named and imagined.",
    owned: (count, total) => `${count} of ${total} pieces revealed`, archive: "The atlas", expedition: "Next expedition",
    next: "One artifact at a time, in the collection's set order.", unavailable: "Each expedition requires its full cost; there are no bonuses or shortcuts.",
    fullCollection: "Collection complete", noGameplay: "These are cultural discoveries. No purchase changes gameplay or grants an advantage.",
    localStorage: "Museum purchases and balance are stored on this device. The collection works offline.",
    loading: "Opening the collection…", loadError: "The collection could not be read on this device.",
    retry: "Try again", cost: "Full cost", balance: "Your balance", remaining: (amount) => `After expedition: ${amount}`,
    shortfall: (amount) => `${amount} more coins are needed for this expedition.`, reveal: "Prepare expedition", confirm: "Confirm & reveal",
    cancel: "Not now", confirmLine: (title, cost) => `You will spend ${cost} coins to reveal “${title}”. This choice is permanent.`,
    funding: "Recording expedition…", fundingError: "The purchase did not complete. Your balance was not changed; try again.",
    fundingInsufficient: "Your balance changed before confirmation. No coins were spent. Refresh the collection and try again.",
    success: "Piece revealed. The full cost was recorded.", locked: "Not yet revealed", acquired: "Revealed",
    refreshFailed: "Your purchase was saved, but some data could not be refreshed. The artifact is already revealed; try refreshing again.",
    refreshRetry: "Refresh data",
    open: "View artifact", close: "Close details", detail: "About this artifact", source: "View institution record",
    rights: "Rights & reuse", author: "Creator", institution: "Collection", year: "Year",
    collectionEnd: "You have revealed every piece in this collection.", revealMotion: "New artifact revealed",
  },
  es: {
    ownershipUpdated: "Esta pieza ya se reveló en otra pestaña. Colección actualizada; no se realizó otra compra.",
    eyebrow: "Colección geográfica", title: "Museo Meridiano", intro: "Piezas auténticas que cuentan cómo se ha observado, nombrado e imaginado la Tierra.",
    owned: (count, total) => `${count} de ${total} piezas reveladas`, archive: "El atlas", expedition: "Próxima expedición",
    next: "Una pieza a la vez, en el orden de la colección.", unavailable: "Cada expedición requiere el coste completo; no hay bonificaciones ni atajos.",
    fullCollection: "Colección completa", noGameplay: "Son descubrimientos culturales. Ninguna compra cambia el juego ni concede ventajas.",
    localStorage: "Las compras y el saldo del museo se guardan en este dispositivo. La colección funciona sin conexión.",
    loading: "Abriendo la colección…", loadError: "No se pudo consultar la colección en este dispositivo.",
    retry: "Reintentar", cost: "Coste completo", balance: "Tu saldo", remaining: (amount) => `Después de la expedición: ${amount}`,
    shortfall: (amount) => `Faltan ${amount} monedas para esta expedición.`, reveal: "Preparar expedición", confirm: "Confirmar y revelar",
    cancel: "Ahora no", confirmLine: (title, cost) => `Gastarás ${cost} monedas para revelar «${title}». Esta decisión es permanente.`,
    funding: "Registrando expedición…", fundingError: "La compra no se completó. El saldo no cambió; inténtalo de nuevo.",
    fundingInsufficient: "El saldo cambió antes de confirmar. No se gastaron monedas. Actualiza la colección e inténtalo de nuevo.",
    success: "Pieza revelada. Se registró el coste completo.", locked: "Aún no revelada", acquired: "Revelada",
    refreshFailed: "La compra se guardó, pero no se pudieron actualizar todos los datos. La pieza ya está revelada; vuelve a intentarlo.",
    refreshRetry: "Actualizar datos",
    open: "Ver pieza", close: "Cerrar detalle", detail: "Sobre esta pieza", source: "Ver registro institucional",
    rights: "Derechos y reutilización", author: "Autoría", institution: "Colección", year: "Año",
    collectionEnd: "Has revelado todas las piezas de esta colección.", revealMotion: "Nueva pieza revelada",
  },
};