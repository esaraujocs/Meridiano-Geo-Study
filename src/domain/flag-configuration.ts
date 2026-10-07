import type { AnyQuizVariant, Family } from "./types.js";

/** As categorias de bandeira da Mesa; "divisoes" são as bandeiras das unidades de um país (Estados e províncias). */
export type FlagCategory = "current" | "writing" | "historical" | "divisoes";
export type FlagDirection = "name-to-flag" | "flag-to-name";

export function flagDirectionFromVariant(
  variant: AnyQuizVariant,
): FlagDirection | null {
  if (variant === "nome-bandeira" || variant === "nome-historica" || variant === "dv-nome-bandeira") return "name-to-flag";
  if (variant === "bandeira-nome" || variant === "historica-nome" || variant === "dv-bandeira-nome") return "flag-to-name";
  return null;
}

export function flagSelection(
  category: FlagCategory,
  direction: FlagDirection = "name-to-flag",
): { family: Family; variant: AnyQuizVariant } {
  if (category === "writing") return { family: "escrita", variant: "escrita-pais" };
  if (category === "divisoes") return { family: "divisoes", variant: direction === "name-to-flag" ? "dv-nome-bandeira" : "dv-bandeira-nome" };
  if (category === "historical") {
    return {
      family: "historicas",
      variant: direction === "name-to-flag" ? "nome-historica" : "historica-nome",
    };
  }
  return {
    family: "bandeiras",
    variant: direction === "name-to-flag" ? "nome-bandeira" : "bandeira-nome",
  };
}

/** A variante pertence à categoria de bandeira (qualquer um dos dois sentidos)? Em Estados e províncias todos os modos têm a mesma família do motor,
 *  então só a variante separa as bandeiras dos outros modos. */
export function flagCategoryHas(category: FlagCategory, variant: string): boolean {
  return flagSelection(category, "name-to-flag").variant === variant || flagSelection(category, "flag-to-name").variant === variant;
}
