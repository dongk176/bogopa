import type { RelationGroup } from "./types";

export function getRelationGroup(relation: string): RelationGroup {
  const normalized = relation?.trim();

  if (normalized === "엄마") return "mother";
  if (normalized === "아빠") return "father";

  if (normalized === "누나/언니" || normalized === "누나" || normalized === "언니") {
    return "older_sister";
  }

  if (normalized === "형/오빠" || normalized === "형" || normalized === "오빠") {
    return "older_brother";
  }

  if (normalized === "여동생/남동생" || normalized === "여동생" || normalized === "남동생") {
    return "younger_sibling";
  }

  if (normalized === "연인/배우자" || normalized === "연인" || normalized === "배우자") {
    return "romantic";
  }

  return "younger_sibling";
}
