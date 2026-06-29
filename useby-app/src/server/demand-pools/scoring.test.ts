import { describe, expect, it } from "vitest";

import {
  scoreMerchantBids,
  type AwardBidInput,
  type AwardPoolInput,
} from "./scoring";

const pool: AwardPoolInput = {
  id: "pool-1",
  committedQuantity: 10,
  committedHouseholds: 10,
  thresholdQuantity: 10,
  thresholdHouseholds: 6,
  maxPriceCents: 1200,
  pickupRadiusMeters: 800,
  closesAt: "2026-07-01T12:00:00.000Z",
};

const baseBid: AwardBidInput = {
  id: "bid-a",
  merchantId: "merchant-a",
  priceCents: 1000,
  minQuantity: 1,
  availableQuantity: 10,
  pickupWindowStart: "2026-07-01T16:00:00.000Z",
  pickupWindowEnd: "2026-07-01T19:00:00.000Z",
  distanceMeters: 250,
  reliabilityScore: 0.72,
  terms: "Equivalent substitution allowed.",
  submittedAt: "2026-06-29T09:00:00.000Z",
};

describe("DemandPool bid scoring", () => {
  it("scores and ranks bids deterministically", () => {
    const bids = scoreMerchantBids(pool, [
      baseBid,
      {
        ...baseBid,
        id: "bid-b",
        merchantId: "merchant-b",
        priceCents: 1050,
        submittedAt: "2026-06-29T09:01:00.000Z",
      },
    ]);

    expect(bids.map((bid) => bid.id)).toEqual(["bid-a", "bid-b"]);
    expect(bids[0].rank).toBe(1);
    expect(bids[0].components.price).toBeGreaterThan(bids[1].components.price);
  });

  it("can change the winner when pickup window and distance materially improve", () => {
    const cheapButAwkward: AwardBidInput = {
      ...baseBid,
      id: "cheap",
      priceCents: 940,
      pickupWindowStart: "2026-07-04T20:00:00.000Z",
      pickupWindowEnd: "2026-07-04T20:30:00.000Z",
      distanceMeters: 900,
      terms: "No substitutions.",
    };
    const serviceable: AwardBidInput = {
      ...baseBid,
      id: "serviceable",
      priceCents: 990,
      pickupWindowStart: "2026-07-01T14:00:00.000Z",
      pickupWindowEnd: "2026-07-01T18:00:00.000Z",
      distanceMeters: 120,
      reliabilityScore: 0.9,
      terms: "Seasonal equivalent substitutions allowed.",
    };

    const [winner] = scoreMerchantBids(pool, [cheapButAwkward, serviceable]);

    expect(winner.id).toBe("serviceable");
    expect(winner.components.pickupWindow).toBeGreaterThan(
      scoreMerchantBids(pool, [cheapButAwkward])[0].components.pickupWindow,
    );
    expect(winner.components.distance).toBeGreaterThan(
      scoreMerchantBids(pool, [cheapButAwkward])[0].components.distance,
    );
  });

  it("can change the winner when available quantity drops below committed demand", () => {
    const underfilled: AwardBidInput = {
      ...baseBid,
      id: "underfilled",
      priceCents: 850,
      availableQuantity: 4,
    };
    const complete: AwardBidInput = {
      ...baseBid,
      id: "complete",
      priceCents: 930,
      availableQuantity: 10,
    };

    const [winner] = scoreMerchantBids(pool, [underfilled, complete]);

    expect(winner.id).toBe("complete");
    expect(winner.components.availableQuantity).toBe(1);
  });
});
