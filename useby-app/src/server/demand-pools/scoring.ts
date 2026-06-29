export type AwardPoolInput = {
  id: string;
  committedQuantity: number;
  committedHouseholds: number;
  thresholdQuantity: number;
  thresholdHouseholds: number;
  maxPriceCents?: number | null;
  pickupRadiusMeters?: number | null;
  closesAt?: string | null;
};

export type AwardBidInput = {
  id: string;
  merchantId: string;
  merchantLocationId?: string | null;
  priceCents: number;
  minQuantity: number;
  availableQuantity: number;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  distanceMeters?: number | null;
  reliabilityScore?: number | null;
  substitutionQuality?: number | null;
  terms?: string | null;
  submittedAt?: string | null;
};

export type BidScoreComponents = {
  price: number;
  pickupWindow: number;
  distance: number;
  availableQuantity: number;
  reliability: number;
  substitution: number;
};

export type ScoredBid = AwardBidInput & {
  score: number;
  components: BidScoreComponents;
  rank: number;
};

const WEIGHTS = {
  price: 0.3,
  pickupWindow: 0.18,
  distance: 0.14,
  availableQuantity: 0.13,
  reliability: 0.15,
  substitution: 0.1,
} as const;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function toTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function inferSubstitutionQuality(bid: AwardBidInput): number {
  if (typeof bid.substitutionQuality === "number") {
    return clampScore(bid.substitutionQuality);
  }

  const text = (bid.terms ?? "").toLowerCase();
  if (!text) {
    return 0.55;
  }

  if (text.includes("no substitution") || text.includes("no substitutions")) {
    return 0.35;
  }

  if (
    text.includes("equivalent") ||
    text.includes("seasonal") ||
    text.includes("like-for-like") ||
    text.includes("substitution allowed")
  ) {
    return 0.9;
  }

  if (text.includes("substitution") || text.includes("substitute")) {
    return 0.7;
  }

  return 0.55;
}

function scorePickupWindow(pool: AwardPoolInput, bid: AwardBidInput): number {
  const start = toTime(bid.pickupWindowStart);
  const end = toTime(bid.pickupWindowEnd);
  if (!start || !end || end <= start) {
    return 0.45;
  }

  const durationHours = (end - start) / 3_600_000;
  const durationScore = clampScore(durationHours / 3);
  const closeTime = toTime(pool.closesAt);
  if (!closeTime) {
    return durationScore;
  }

  const hoursAfterClose = Math.max(0, (start - closeTime) / 3_600_000);
  const freshnessScore = clampScore(1 - hoursAfterClose / 72);
  return clampScore(durationScore * 0.55 + freshnessScore * 0.45);
}

function scoreDistance(pool: AwardPoolInput, bid: AwardBidInput): number {
  const distance = bid.distanceMeters;
  if (distance === null || distance === undefined) {
    return 0.5;
  }

  const radius = pool.pickupRadiusMeters && pool.pickupRadiusMeters > 0
    ? pool.pickupRadiusMeters
    : 1000;

  return clampScore(1 - distance / Math.max(radius * 1.25, 1));
}

function scorePrice(pool: AwardPoolInput, bid: AwardBidInput, bids: AwardBidInput[]): number {
  if (pool.maxPriceCents && pool.maxPriceCents > 0) {
    return clampScore(1 - bid.priceCents / pool.maxPriceCents);
  }

  const prices = bids.map((candidate) => candidate.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) {
    return 0.8;
  }

  return clampScore(1 - (bid.priceCents - min) / (max - min));
}

export function scoreBid(
  pool: AwardPoolInput,
  bid: AwardBidInput,
  allBids: AwardBidInput[] = [bid],
): Omit<ScoredBid, "rank"> {
  const requiredQuantity = Math.max(pool.committedQuantity, pool.thresholdQuantity, 1);
  const quantityCoverage = bid.availableQuantity / requiredQuantity;
  const minQuantityPenalty =
    bid.minQuantity > pool.committedQuantity
      ? clampScore(1 - (bid.minQuantity - pool.committedQuantity) / requiredQuantity)
      : 1;
  const availableQuantity = clampScore(quantityCoverage) * minQuantityPenalty;
  const reliability = clampScore(bid.reliabilityScore ?? 0.72);
  const substitution = inferSubstitutionQuality(bid);

  const components: BidScoreComponents = {
    price: scorePrice(pool, bid, allBids),
    pickupWindow: scorePickupWindow(pool, bid),
    distance: scoreDistance(pool, bid),
    availableQuantity,
    reliability,
    substitution,
  };

  const score = roundScore(
    components.price * WEIGHTS.price +
      components.pickupWindow * WEIGHTS.pickupWindow +
      components.distance * WEIGHTS.distance +
      components.availableQuantity * WEIGHTS.availableQuantity +
      components.reliability * WEIGHTS.reliability +
      components.substitution * WEIGHTS.substitution,
  );

  return {
    ...bid,
    score,
    components,
  };
}

export function scoreMerchantBids(
  pool: AwardPoolInput,
  bids: AwardBidInput[],
): ScoredBid[] {
  return bids
    .map((bid) => scoreBid(pool, bid, bids))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.priceCents !== right.priceCents) {
        return left.priceCents - right.priceCents;
      }

      const leftStart = toTime(left.pickupWindowStart) ?? Number.MAX_SAFE_INTEGER;
      const rightStart = toTime(right.pickupWindowStart) ?? Number.MAX_SAFE_INTEGER;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }

      const leftSubmitted = toTime(left.submittedAt) ?? Number.MAX_SAFE_INTEGER;
      const rightSubmitted = toTime(right.submittedAt) ?? Number.MAX_SAFE_INTEGER;
      if (leftSubmitted !== rightSubmitted) {
        return leftSubmitted - rightSubmitted;
      }

      return left.id.localeCompare(right.id);
    })
    .map((bid, index) => ({
      ...bid,
      rank: index + 1,
    }));
}
