import type { AnyQuizVariant, Family } from "./types.js";

/** As categorias de bandeira da Mesa; "brasil" são as bandeiras dos estados (família Brasil). */
export type FlagCategory = "current" | "writing" | "historical" | "brasil";
export type FlagDirection = "name-to-flag" | "flag-to-name";

export function flagDirectionFromVariant(
  variant: AnyQuizVariant,
): FlagDirection | null {
  if (variant === "nome-bandeira" || variant === "nome-historica" || variant === "br-nome-bandeira") return "name-to-flag";
  if (variant === "bandeira-nome" || variant === "historica-nome" || variant === "br-bandeira-nome") return "flag-to-name";
  return null;
}

export function flagSelection(
  category: FlagCategory,
  direction: FlagDirection = "name-to-flag",
): { family: Family; variant: AnyQuizVariant } {
  if (category === "writing") return { family: "escrita", variant: "escrita-pais" };
  if (category === "brasil") return { family: "brasil", variant: direction === "name-to-flag" ? "br-nome-bandeira" : "br-bandeira-nome" };
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

/** A variante pertence à categoria de bandeira (qualquer um dos dois sentidos)? Na família Brasil todos os modos têm a mesma família do motor,
 *  então só a variante separa as bandeiras dos outros modos. */
export function flagCategoryHas(category: FlagCategory, variant: string): boolean {
  return flagSelection(category, "name-to-flag").variant === variant || flagSelection(category, "flag-to-name").variant === variant;
}
