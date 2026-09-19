import type { AnyQuizVariant, Family } from "./types.js";

export type FlagCategory = "current" | "writing" | "historical";
export type FlagDirection = "name-to-flag" | "flag-to-name";

export function flagDirectionFromVariant(
  variant: AnyQuizVariant,
): FlagDirection | null {
  if (variant === "nome-bandeira" || variant === "nome-historica") return "name-to-flag";
  if (variant === "bandeira-nome" || variant === "historica-nome") return "flag-to-name";
  return null;
}

export function flagSelection(
  category: FlagCategory,
  direction: FlagDirection = "name-to-flag",
): { family: Family; variant: AnyQuizVariant } {
  if (category === "writing") return { family: "escrita", variant: "escrita-pais" };
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