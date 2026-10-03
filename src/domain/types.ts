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
  | "america-do-norte-central";
export type RegionSelection = Region | Region[];
export type Family = "mapa" | "bandeiras" | "capitais" | "escrita" | "historicas" | "idiomas" | "silhueta" | "travel";
export type QuizVariant =
  | "mapa"
  | "bandeira-nome"
  | "nome-bandeira"
  | "capital-pais"
  | "pais-capital"
  | "silhueta"
   | "silhueta-opcoes"
  | "travel";
  // Non-map families retain explicit variant identifiers for session history.
export type SpecialVariant =
  | "escrita-pais"
  | "escrita-capital"
  | "historica-nome"
  | "nome-historica"
  | "idioma-nome"
  | "idioma-pais";
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