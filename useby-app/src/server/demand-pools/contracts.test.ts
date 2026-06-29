import { describe, expect, it } from "vitest";

import {
  CP6_DEMAND_POOL_TABLE_CONTRACTS,
  DEMAND_POOL_PAYMENT_NOTICE,
  assertDemandPoolDtoIsPrivacySafe,
  demandPoolCommitSchema,
  demandPoolCreateSchema,
  nextPoolStatusAfterRecompute,
  type DemandPoolDto,
} from "./contracts";

describe("DemandPool contracts", () => {
  it("declares CP6 input and output table availability requirements", () => {
    expect(CP6_DEMAND_POOL_TABLE_CONTRACTS.map((contract) => contract.table)).toEqual([
      "demand_pools",
      "demand_pool_commitments",
      "merchant_bids",
      "pool_orders",
      "pickup_tasks",
    ]);
  });

  it("moves gathering pools across threshold from recomputed live counts", () => {
    expect(
      nextPoolStatusAfterRecompute({
        currentStatus: "gathering",
        committedQuantity: 3,
        committedHouseholds: 2,
        thresholdQuantity: 4,
        thresholdHouseholds: 3,
      }),
    ).toBe("gathering");

    expect(
      nextPoolStatusAfterRecompute({
        currentStatus: "gathering",
        committedQuantity: 4,
        committedHouseholds: 2,
        thresholdQuantity: 4,
        thresholdHouseholds: 3,
      }),
    ).toBe("threshold_met");

    expect(
      nextPoolStatusAfterRecompute({
        currentStatus: "threshold_met",
        committedQuantity: 2,
        committedHouseholds: 1,
        thresholdQuantity: 4,
        thresholdHouseholds: 3,
      }),
    ).toBe("gathering");
  });

  it("validates create and commit payloads as unpaid demo intent", () => {
    const createParsed = demandPoolCreateSchema.parse({
      title: "Neighbourhood rice bag",
      requestedItems: ["10kg rice bag"],
      closesAt: "2099-06-29T12:00:00.000Z",
      thresholdHouseholds: 3,
      cardNumber: "4111111111111111",
    });
    const commitParsed = demandPoolCommitSchema.parse({
      quantity: 1,
      maxPricePence: 1200,
      authorizationAmount: 1200,
    });

    expect(createParsed).not.toHaveProperty("cardNumber");
    expect(commitParsed).not.toHaveProperty("authorizationAmount");
    expect(DEMAND_POOL_PAYMENT_NOTICE).toContain("Unpaid demo intent only");
    expect(DEMAND_POOL_PAYMENT_NOTICE).toContain("No card");
  });

  it("keeps public DTOs free of exact coordinates and direct contact fields", () => {
    const dto: DemandPoolDto = {
      id: "pool_1",
      title: "Neighbourhood rice bag",
      description: null,
      status: "gathering",
      unit: "bundle",
      requestedItems: ["10kg rice bag"],
      pickupAreaLabel: "Riverside Quarter",
      pickupRadiusMeters: 1500,
      threshold: {
        quantity: "3.000",
        households: 3,
      },
      committed: {
        quantity: "2.000",
        households: 2,
      },
      progress: {
        quantityPercent: 67,
        householdsPercent: 67,
        thresholdMet: false,
      },
      currentHouseholdCommitment: null,
      bidSummary: {
        submitted: 0,
        winningBidId: null,
      },
      bids: [],
      awardedBidId: null,
      timeline: {
        opensAt: "2026-06-29T10:00:00.000Z",
        closesAt: "2026-06-30T10:00:00.000Z",
        biddingOpensAt: null,
        awardedAt: null,
        updatedAt: "2026-06-29T10:00:00.000Z",
      },
      paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
    };

    expect(assertDemandPoolDtoIsPrivacySafe(dto)).toEqual([]);
  });
});
