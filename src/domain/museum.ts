import { locale, type Locale } from "./i18n/locale.js";

export type MuseumText = { title: string; subtitle: string; description: string; detail: string };
export type MuseumPiece = {
  id: string; year: number; cost: number; image: string; author: string;
  institution: string; sourceUrl: string; rightsUrl: string;
  rights: Record<Locale, string>; text: Record<Locale, MuseumText>;
};

/** Ordem e IDs são permanentes: novas expedições devem ser acrescentadas ao final. */
export const MUSEUM_PIECES: readonly MuseumPiece[] = [
  {
    id: "waldseemuller-1507", year: 1507, cost: 25_000,
    image: "/museum/waldseemuller-1507.jpg", author: "Martin Waldseemüller",
    institution: "Library of Congress · Geography and Map Division",
    sourceUrl: "https://www.loc.gov/item/2003626426/",
    rightsUrl: "https://www.loc.gov/item/2003626426/#rights-and-access",
    rights: {
      pt: "Domínio público. Obra de 1507; reprodução da Library of Congress, livre para uso e reutilização.",
      en: "Public domain. Work from 1507; Library of Congress reproduction, free to use and reuse.",
      es: "Dominio público. Obra de 1507; reproducción de la Library of Congress, de libre uso y reutilización.",
    },
    text: {
      pt: { title: "Um nome para a América", subtitle: "Mapa-múndi · 1507", description: "O mapa de Waldseemüller que deu à América seu nome.",
        detail: "Impresso em doze folhas, este mapa é o primeiro documento conhecido a usar o nome América. Waldseemüller se baseou em relatos das viagens de Américo Vespúcio para representar as terras ocidentais como uma massa continental separada. A imagem reúne as doze folhas da única cópia conhecida da primeira edição. É um registro do conhecimento geográfico europeu de sua época, não um mapa das fronteiras atuais." },
      en: { title: "A name for America", subtitle: "World map · 1507", description: "Waldseemüller's map that gave America its name.",
        detail: "Printed on twelve sheets, this map is the first known document to use the name America. Waldseemüller drew on accounts of Amerigo Vespucci's voyages to depict the western lands as a separate continental mass. This image combines the twelve sheets of the only known surviving copy of the first edition. It records European geographical knowledge of its time, not today's borders." },
      es: { title: "Un nombre para América", subtitle: "Mapamundi · 1507", description: "El mapa de Waldseemüller que dio su nombre a América.",
        detail: "Impreso en doce hojas, este mapa es el primer documento conocido que utiliza el nombre América. Waldseemüller se basó en relatos de los viajes de Américo Vespucio para representar las tierras occidentales como una masa continental separada. La imagen reúne las doce hojas de la única copia conocida de la primera edición. Es un registro del conocimiento geográfico europeo de su época, no de las fronteras actuales." },
    },
  },
  {
    id: "ortelius-1570", year: 1570, cost: 75_000,
    image: "/museum/ortelius-1570.jpg", author: "Abraham Ortelius",
    institution: "Library of Congress · Parallel Histories",
    sourceUrl: "https://www.loc.gov/resource/g3200m.gct00003/?sp=1",
    rightsUrl: "https://www.loc.gov/item/98687183/#rights-and-access",
    rights: {
      pt: "Domínio público. A coleção Parallel Histories declara seus materiais livres para uso e reutilização.",
      en: "Public domain. The Parallel Histories collection declares its materials free to use and reuse.",
      es: "Dominio público. La colección Parallel Histories declara sus materiales de libre uso y reutilización.",
    },
    text: {
      pt: { title: "O teatro do mundo", subtitle: "Frontispício de atlas · 1570", description: "A gravura que abre o Theatrum orbis terrarum de Ortelius.",
        detail: "Publicado em Antuérpia em 1570, o atlas reúne 53 folhas de mapas, com textos descritivos no verso. Seu frontispício apresenta figuras alegóricas em torno do título latino Theatrum orbis terrarum: o teatro do mundo. A gravura mostra como a geografia também era representada por imagens e símbolos. Esta peça é a página de abertura do atlas, não seu mapa-múndi." },
      en: { title: "The theatre of the world", subtitle: "Atlas frontispiece · 1570", description: "The engraving that opens Ortelius's Theatrum orbis terrarum.",
        detail: "Published in Antwerp in 1570, the atlas contains 53 map sheets with descriptive text on the reverse. Its frontispiece shows allegorical figures around the Latin title Theatrum orbis terrarum: the theatre of the world. The engraving illustrates how geography was also represented through images and symbols. This piece is the atlas's opening page, not its world map." },
      es: { title: "El teatro del mundo", subtitle: "Frontispicio de atlas · 1570", description: "El grabado que abre el Theatrum orbis terrarum de Ortelius.",
        detail: "Publicado en Amberes en 1570, el atlas reúne 53 hojas de mapas con textos descriptivos al reverso. Su frontispicio presenta figuras alegóricas alrededor del título latino Theatrum orbis terrarum: el teatro del mundo. El grabado muestra cómo la geografía también se representaba mediante imágenes y símbolos. Esta pieza es la página de apertura del atlas, no su mapamundi." },
    },
  },
  {
    id: "blue-marble-1972", year: 1972, cost: 200_000,
    image: "/museum/blue-marble-1972.jpg", author: "Apollo 17 · NASA",
    institution: "NASA Johnson Space Center · AS17-148-22727",
    sourceUrl: "https://science.nasa.gov/earth/earth-observatory/the-blue-marble-from-apollo-17-1133/",
    rightsUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    rights: {
      pt: "Domínio público nos EUA: fotografia produzida pela NASA. Crédito da imagem: NASA. Uso educativo, sem sugerir endosso da agência.",
      en: "Public domain in the US: NASA-produced photograph. Image credit: NASA. Educational use; no agency endorsement implied.",
      es: "Dominio público en EE. UU.: fotografía producida por la NASA. Crédito de la imagen: NASA. Uso educativo sin implicar respaldo de la agencia.",
    },
    text: {
      pt: { title: "A Terra inteira em uma imagem", subtitle: "Fotografia da Apollo 17 · 1972", description: "Blue Marble: a Terra vista no caminho para a Lua.",
        detail: "A tripulação da Apollo 17 fotografou a Terra em 7 de dezembro de 1972, durante a viagem para a Lua. Na imagem aparecem quase toda a costa da África, a Península Arábica, Madagascar e a calota polar da Antártida. A identificação da fotografia é AS17-148-22727. Diferentemente dos mapas antigos do acervo, esta peça registra a aparência do planeta em um instante real." },
      en: { title: "A whole Earth in one image", subtitle: "Apollo 17 photograph · 1972", description: "Blue Marble: Earth seen on the way to the Moon.",
        detail: "The Apollo 17 crew photographed Earth on December 7, 1972, while traveling to the Moon. The image shows almost the entire coastline of Africa, the Arabian Peninsula, Madagascar and Antarctica's polar ice cap. Its photograph identifier is AS17-148-22727. Unlike the old maps in this collection, it records the appearance of the planet at a real moment in time." },
      es: { title: "La Tierra entera en una imagen", subtitle: "Fotografía del Apollo 17 · 1972", description: "Blue Marble: la Tierra vista de camino a la Luna.",
        detail: "La tripulación del Apollo 17 fotografió la Tierra el 7 de diciembre de 1972, durante el viaje a la Luna. La imagen muestra casi toda la costa de África, la península arábiga, Madagascar y el casquete polar de la Antártida. Su identificador es AS17-148-22727. A diferencia de los mapas antiguos del acervo, registra la apariencia del planeta en un instante real." },
    },
  },
];

export const museumPieceById = (id: string) => MUSEUM_PIECES.find((piece) => piece.id === id);
export const museumPieceText = (piece: MuseumPiece) => piece.text[locale];
export const museumPieceRights = (piece: MuseumPiece) => piece.rights[locale];