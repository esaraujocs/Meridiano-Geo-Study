export type Meta = {
  pt?: string;
  en?: string;
  cap?: string;
  /** Outras grafias aceitas da capital (só nos idiomas traduzidos). */
  capAl?: string[];
  fl?: string;
  reg?: string;
  sub?: string;
  ll?: [number, number];
  borders?: string[];
  cca3?: string;
  al?: string[];
  mapa?: boolean;
  mapaPara?: string;
  absorvido?: boolean;
  substitui?: string;
  soBandeira?: boolean;
  un?: boolean;
  lang?: string[];
  cur?: string[];
  pop?: number;
  area?: number;
  fato?: string;
};

export type Legacy = {
  sourceVersion: string;
  sourceHash: string;
  meta: Record<string, Meta>;
  names3?: Record<string, string>;
  mapEntityIds: string[];
};

export type GeoFeature = { id: string; geometry?: { type: string; coordinates?: unknown } };

export type Region =
  | "mundo"
  | "caribe"
  | "pacifico"
  | "europa"
  | "africa"
  | "asia"
  | "america-do-sul"
  | "america-do-norte-central"
  // Família Brasil: o país inteiro e as 5 regiões do IBGE (ver domain/brasil.ts)
  | "brasil"
  | "norte"
  | "nordeste"
  | "centro-oeste"
  | "sudeste"
  | "sul";
export type RegionSelection = Region | Region[];
export type Family = "mapa" | "bandeiras" | "capitais" | "escrita" | "historicas" | "idiomas" | "silhueta" | "travel" | "gentilicos" | "moedas" | "brasil";
export type QuizVariant =
  | "mapa"
  | "bandeira-nome"
  | "nome-bandeira"
  | "capital-pais"
  | "pais-capital"
  | "silhueta"
   | "silhueta-opcoes"
  | "travel"
  | "gentilico-pais"
  | "pais-gentilico"
  | "moeda-pais"
  | "pais-moeda"
  // Família Brasil (os 27 estados): cada variante joga com as regras de uma do mapa-múndi (BRASIL_BASE em domain/brasil.ts)
  | "br-mapa"
  | "br-capital-mapa"
  | "br-silhueta-opcoes"
  | "br-silhueta"
  | "br-nome-bandeira"
  | "br-bandeira-nome"
  | "br-estado-capital";
  // Non-map families retain explicit variant identifiers for session history.
export type SpecialVariant =
  | "escrita-pais"
  | "escrita-capital"
  | "historica-nome"
  | "nome-historica"
  | "idioma-nome"
  | "idioma-pais"
  | "br-escrita-estado"
  | "br-escrita-capital";
export type AnyQuizVariant = QuizVariant | SpecialVariant;
export type Screen =
  | "hub"
  | "recorte"
  | "game"
  | "progress"
  | "collection"
  | "achievements"
  | "history"
   | "options"
  | "store"
  | "mecenato"
  | "league"
  | "duel-reveal"
  | "duel-interlude"
  | "result"
  | "pvp-home"
  | "pvp-lobby"
  | "pvp-interlude"
  | "pvp-result"
  | "friends"
  | "player";

export type RegionCounts = Record<Region, number>;