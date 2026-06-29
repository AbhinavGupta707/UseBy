export type GroceryStorageState =
  | "sealed"
  | "opened"
  | "fridge"
  | "freezer"
  | "cupboard"
  | "cooked"
  | string;

export type SafetyStatus = "eligible" | "restricted" | "blocked" | "unknown" | string;

export type ItemState =
  | "private"
  | "use_soon"
  | "listed"
  | "offered"
  | "reserved"
  | "picked_up"
  | "handed_off"
  | "returned"
  | "completed"
  | "consumed"
  | "expired"
  | "cancelled"
  | "disputed"
  | string;

export type GroceryItemForRules = {
  id: string;
  title: string;
  category: string;
  quantity: number;
  itemState: ItemState;
  storageState: GroceryStorageState | null;
  safetyStatus: SafetyStatus | null;
  expiresAt?: string | Date | null;
  useByDate?: string | Date | null;
  bestBeforeDate?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

export type FoodShareEligibility = {
  eligible: boolean;
  reasons: string[];
  explanation: string;
};

export type ExpiryBand =
  | "expired"
  | "today"
  | "soon"
  | "this_week"
  | "later"
  | "unknown";

export type ActionCardDraft = {
  type: "use_first" | "freeze_or_plan" | "share_with_neighbours" | "check_label";
  priority: number;
  title: string;
  body: string;
  rationale: string;
  metadata: Record<string, unknown>;
};

const NON_ACTIVE_ITEM_STATES = new Set([
  "reserved",
  "picked_up",
  "handed_off",
  "returned",
  "completed",
  "consumed",
  "expired",
  "cancelled",
  "disputed",
]);

const SHARE_SAFE_STORAGE_STATES = new Set(["sealed", "cupboard", "fridge", "freezer"]);
const OPEN_OR_HIGH_RISK_STORAGE_STATES = new Set(["opened", "cooked"]);

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function earliestExpiryDate(item: GroceryItemForRules): Date | null {
  const candidates = [item.expiresAt, item.useByDate, item.bestBeforeDate]
    .map(asDate)
    .filter((value): value is Date => Boolean(value));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, candidate) =>
    candidate.getTime() < earliest.getTime() ? candidate : earliest,
  );
}

export function daysUntilExpiry(
  item: GroceryItemForRules,
  now = new Date(),
): number | null {
  const expiry = earliestExpiryDate(item);
  if (!expiry) {
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expiryDay = Date.UTC(
    expiry.getUTCFullYear(),
    expiry.getUTCMonth(),
    expiry.getUTCDate(),
  );

  return Math.floor((expiryDay - today) / 86_400_000);
}

export function expiryBand(item: GroceryItemForRules, now = new Date()): ExpiryBand {
  const days = daysUntilExpiry(item, now);
  if (days === null) {
    return "unknown";
  }

  if (days < 0) {
    return "expired";
  }

  if (days === 0) {
    return "today";
  }

  if (days <= 2) {
    return "soon";
  }

  if (days <= 7) {
    return "this_week";
  }

  return "later";
}

export function isFoodShareEligible(
  item: GroceryItemForRules,
  now = new Date(),
): FoodShareEligibility {
  const reasons: string[] = [];
  const storageState = item.storageState ?? "unknown";
  const safetyStatus = item.safetyStatus ?? "unknown";
  const band = expiryBand(item, now);

  if (item.category !== "grocery") {
    reasons.push("Only grocery items are considered for food sharing.");
  }

  if (item.quantity <= 0) {
    reasons.push("Quantity is not available.");
  }

  if (NON_ACTIVE_ITEM_STATES.has(item.itemState)) {
    reasons.push(`Item state is ${item.itemState}.`);
  }

  if (safetyStatus !== "eligible") {
    reasons.push(`Safety status is ${safetyStatus}.`);
  }

  if (!SHARE_SAFE_STORAGE_STATES.has(storageState)) {
    reasons.push(`Storage state is ${storageState}.`);
  }

  if (OPEN_OR_HIGH_RISK_STORAGE_STATES.has(storageState)) {
    reasons.push("Opened, cooked, or otherwise high-risk food is private planning only.");
  }

  if (band === "expired") {
    reasons.push("Item is past its recorded expiry date.");
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    reasons,
    explanation: eligible
      ? "Eligible for neighbour matching because it is grocery inventory with eligible safety status, package-safe storage state, available quantity, and no expired date."
      : reasons.join(" "),
  };
}

export function actionCardsForItem(
  item: GroceryItemForRules,
  now = new Date(),
): ActionCardDraft[] {
  if (item.category !== "grocery" || item.quantity <= 0) {
    return [];
  }

  const band = expiryBand(item, now);
  const shareEligibility = isFoodShareEligible(item, now);
  const estimatedBand = String(item.metadata?.estimatedUseByBand ?? "");
  const cards: ActionCardDraft[] = [];

  if (band === "expired") {
    cards.push({
      type: "use_first",
      priority: 100,
      title: `Review ${item.title}`,
      body: "This item is past its recorded date. Keep it out of neighbour sharing.",
      rationale: "Expired grocery rows are private planning only and are never shareable.",
      metadata: { expiryBand: band, shareEligible: false },
    });
    return cards;
  }

  if (band === "today" || band === "soon" || estimatedBand === "use_first") {
    cards.push({
      type: "use_first",
      priority: band === "today" ? 95 : 85,
      title: `Use ${item.title} first`,
      body: "Plan this into the next meal before lower-risk pantry items.",
      rationale: `Deterministic expiry band is ${band}; storage and label observations make this a use-first item.`,
      metadata: { expiryBand: band, estimatedUseByBand: estimatedBand || null },
    });
  } else if (
    band === "this_week" ||
    estimatedBand === "probably_this_week" ||
    estimatedBand === "freeze_share_soon"
  ) {
    cards.push({
      type: "freeze_or_plan",
      priority: 70,
      title: `Plan ${item.title} this week`,
      body: "Use, freeze where appropriate, or keep it visible in the household shelf.",
      rationale: "The live item row is not urgent today but should be planned before it drifts into waste.",
      metadata: { expiryBand: band, estimatedUseByBand: estimatedBand || null },
    });
  }

  if (shareEligibility.eligible) {
    cards.push({
      type: "share_with_neighbours",
      priority: band === "today" || band === "soon" ? 90 : 65,
      title: `Offer sealed ${item.title}`,
      body: "Safe-to-list packaged food can be matched with nearby open needs.",
      rationale: shareEligibility.explanation,
      metadata: { expiryBand: band, shareEligible: true },
    });
  } else if (
    item.safetyStatus === "unknown" ||
    band === "unknown" ||
    estimatedBand === "uncertain_scan_label"
  ) {
    cards.push({
      type: "check_label",
      priority: 55,
      title: `Check the label on ${item.title}`,
      body: "Add a clear date and package state before the app suggests any neighbour sharing.",
      rationale: `Food sharing is blocked until safety, packaging, and date confidence are explicit. ${shareEligibility.explanation}`,
      metadata: {
        expiryBand: band,
        shareEligible: false,
        blockedReasons: shareEligibility.reasons,
      },
    });
  }

  return cards;
}
