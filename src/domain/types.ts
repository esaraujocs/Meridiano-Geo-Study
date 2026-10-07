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
  // Estados e províncias (domain/divisions.ts): "dv:<país>" é o país inteiro, "dv:<país>:<região>" uma região dele
  | DivisionRegion;
export type DivisionRegion = `dv:${string}`;
/** Os recortes do mapa-múndi (os 7 e o Mundo). */
export type WorldRegion = Exclude<Region, DivisionRegion>;
export type RegionSelection = Region | Region[];
export type Family = "mapa" | "bandeiras" | "capitais" | "escrita" | "historicas" | "idiomas" | "silhueta" | "travel" | "gentilicos" | "moedas" | "divisoes" | "epocas";
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
  // Estados e províncias: cada variante joga com as regras de uma do mapa-múndi (DIVISION_BASE em domain/divisions.ts)
  | "dv-mapa"
  | "dv-capital-mapa"
  | "dv-silhueta-opcoes"
  | "dv-silhueta"
  | "dv-nome-bandeira"
  | "dv-bandeira-nome"
  | "dv-capital";
  // Non-map families retain explicit variant identifiers for session history.
export type SpecialVariant =
  | "escrita-pais"
  | "escrita-capital"
  | "historica-nome"
  | "nome-historica"
  | "idioma-nome"
  | "idioma-pais"
  | "dv-escrita-nome"
  | "dv-escrita-capital";
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