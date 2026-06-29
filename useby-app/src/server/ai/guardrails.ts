export const AI_ALLOWED_USES = [
  "copy",
  "explanation",
  "summarisation",
  "secondary_semantic_ranking_after_deterministic_filters",
] as const;

export const AI_FORBIDDEN_DECISIONS = [
  "eligibility",
  "trust",
  "payment",
  "safety",
  "reservation_capacity",
  "visibility",
] as const;

export type AiForbiddenDecision = (typeof AI_FORBIDDEN_DECISIONS)[number];

export type AiGuardrailSummary = {
  allowedUses: typeof AI_ALLOWED_USES;
  forbiddenDecisions: typeof AI_FORBIDDEN_DECISIONS;
  copyOnly: true;
  deterministicFirst: true;
  canSetEligibility: false;
  canSetTrust: false;
  canSetPayment: false;
  canSetSafety: false;
  canSetReservationCapacity: false;
  canSetVisibility: false;
};

const FORBIDDEN_DECISION_PATTERNS: Record<AiForbiddenDecision, RegExp[]> = {
  eligibility: [
    /["']?(?:eligible|eligibility|isEligible)["']?\s*:/i,
    /\bAI\s+(?:decided|approved|rejected)\s+eligibility\b/i,
  ],
  trust: [
    /["']?(?:trust|trustScore|trust_score)["']?\s*:/i,
    /\b(?:set|updated|changed)\s+trust\s+score\b/i,
  ],
  payment: [
    /["']?(?:payment|paymentStatus|payment_status|charge|deposit)["']?\s*:/i,
    /\b(?:captured|charged|authorized|held)\s+(?:a\s+)?(?:payment|deposit|card)\b/i,
  ],
  safety: [
    /["']?(?:safety|safetyStatus|safety_status|safeToShare)["']?\s*:/i,
    /\bAI\s+(?:certified|cleared|approved)\s+(?:food\s+)?safety\b/i,
  ],
  reservation_capacity: [
    /["']?(?:capacity|availableCapacity|reservedQuantity|remainingCapacity)["']?\s*:/i,
    /\bAI\s+(?:reserved|released|allocated)\s+(?:capacity|quantity)\b/i,
  ],
  visibility: [
    /["']?(?:visibility|visibleTo|householdVisibility|publicVisibility)["']?\s*:/i,
    /\bAI\s+(?:exposed|hid|revealed)\s+(?:household|visibility|coordinates)\b/i,
  ],
};

export function aiGuardrailSummary(): AiGuardrailSummary {
  return {
    allowedUses: AI_ALLOWED_USES,
    forbiddenDecisions: AI_FORBIDDEN_DECISIONS,
    copyOnly: true,
    deterministicFirst: true,
    canSetEligibility: false,
    canSetTrust: false,
    canSetPayment: false,
    canSetSafety: false,
    canSetReservationCapacity: false,
    canSetVisibility: false,
  };
}

export function forbiddenDecisionClaims(text: string): AiForbiddenDecision[] {
  return AI_FORBIDDEN_DECISIONS.filter((decision) =>
    FORBIDDEN_DECISION_PATTERNS[decision].some((pattern) => pattern.test(text)),
  );
}

export function hasForbiddenDecisionClaim(text: string): boolean {
  return forbiddenDecisionClaims(text).length > 0;
}
