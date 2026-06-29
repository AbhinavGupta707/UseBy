import {
  isFoodShareEligible,
  type GroceryItemForRules,
} from "../actions/rules";

export type FoodNeedForScoring = {
  id: string;
  title: string;
  quantity: number;
  unit: string;
  neededBy?: string | Date | null;
};

export type FoodMatchCandidate = {
  need: FoodNeedForScoring;
  item: GroceryItemForRules;
  distanceMeters: number;
  textSimilarity: number;
};

export type FoodMatchScore = {
  eligible: boolean;
  score: number;
  rationale: string;
  blockedReasons: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function needUrgencyScore(neededBy: string | Date | null | undefined, now: Date) {
  if (!neededBy) {
    return 6;
  }

  const date = neededBy instanceof Date ? neededBy : new Date(neededBy);
  if (Number.isNaN(date.getTime())) {
    return 6;
  }

  const hours = (date.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 6) {
    return 18;
  }

  if (hours <= 24) {
    return 14;
  }

  if (hours <= 72) {
    return 10;
  }

  return 6;
}

export function scoreFoodMatchCandidate(
  candidate: FoodMatchCandidate,
  now = new Date(),
): FoodMatchScore {
  const safety = isFoodShareEligible(candidate.item, now);
  if (!safety.eligible) {
    return {
      eligible: false,
      score: 0,
      rationale: safety.explanation,
      blockedReasons: safety.reasons,
    };
  }

  const similarity = clamp(candidate.textSimilarity, 0, 1);
  const distanceScore = clamp(1 - candidate.distanceMeters / 1_500, 0, 1) * 25;
  const quantityScore =
    candidate.item.quantity >= candidate.need.quantity
      ? 12
      : clamp(candidate.item.quantity / candidate.need.quantity, 0, 1) * 12;
  const urgencyScore = needUrgencyScore(candidate.need.neededBy, now);
  const textScore = similarity * 45;
  const score = Math.round((textScore + distanceScore + quantityScore + urgencyScore) * 10) / 10;

  return {
    eligible: true,
    score,
    rationale: [
      `${candidate.item.title} is package-safe for neighbour sharing.`,
      `${Math.round(candidate.distanceMeters)}m away.`,
      `Text match ${(similarity * 100).toFixed(0)}%.`,
      candidate.item.quantity >= candidate.need.quantity
        ? "Quantity covers the request."
        : "Quantity partially covers the request.",
    ].join(" "),
    blockedReasons: [],
  };
}
