export type Meta = {
  pt?: string;
  en?: string;
  cap?: string;
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
};

export type Legacy = {
  sourceVersion: string;
  sourceHash: string;
  meta: Record<string, Meta>;
  names3?: Record<string, string>;
  mapEntityIds: string[];
};

export type GeoFeature = { id: string };

export type Region = "mundo" | "caribe" | "pacifico";
export type Family = "mapa" | "bandeiras" | "capitais" | "escrita" | "historicas" | "idiomas" | "silhueta" | "travel";
export type QuizVariant =
  | "mapa"
  | "bandeira-nome"
  | "nome-bandeira"
  | "capital-pais"
  | "pais-capital"
  | "silhueta"
  | "travel";
  // Non-map families retain explicit variant identifiers for session history.
export type SpecialVariant =
  | "escrita-pais"
  | "escrita-capital"
  | "historica-nome"
  | "nome-historica"
  | "idioma-pais";
export type AnyQuizVariant = QuizVariant | SpecialVariant;
export type Screen =
  | "hub"
  | "variant"
  | "recorte"
  | "game"
  | "progress"
  | "collection"
  | "achievements"
  | "history"
  | "result";

export type RegionCounts = Record<Region, number>;