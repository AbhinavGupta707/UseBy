import { describe, expect, it } from "vitest";

import {
  evaluateBookingPolicy,
  type BookingPolicyItem,
} from "../bookings/policy";
import {
  evaluateLendingPolicy,
  type LendingPolicyItem,
} from "./policy";

const requesterHouseholdId = "00000000-0000-5000-8000-000000000020";
const ownerHouseholdId = "00000000-0000-5000-8000-000000000010";

function lendingItem(overrides: Partial<LendingPolicyItem> = {}): LendingPolicyItem {
  return {
    id: "00000000-0000-5000-8000-000000000030",
    ownerHouseholdId,
    title: "Black midi dress",
    category: "fashion",
    quantity: 1,
    itemState: "listed",
    metadata: {
      size: "UK 10",
      condition: "excellent",
      availabilityNote: "Available weekends.",
      lendingTerms: "Deposit preferred.",
    },
    ...overrides,
  };
}

function groceryItem(overrides: Partial<BookingPolicyItem> = {}): BookingPolicyItem {
  return {
    id: "00000000-0000-5000-8000-000000000001",
    ownerHouseholdId,
    title: "Sealed pasta",
    category: "grocery",
    quantity: 1,
    itemState: "listed",
    storageState: "sealed",
    safetyStatus: "eligible",
    useByDate: "2026-07-01",
    metadata: {},
    ...overrides,
  };
}

function lendingDecision(overrides: Partial<Parameters<typeof evaluateLendingPolicy>[0]> = {}) {
  return evaluateLendingPolicy({
    action: "request",
    item: lendingItem(),
    requesterHouseholdId,
    ownerHouseholdId,
    relationshipBlocked: false,
    ...overrides,
  });
}

describe("lending policy guard", () => {
  it("allows fashion and household lending without food acknowledgement", () => {
    const fashion = lendingDecision();
    const household = lendingDecision({
      item: lendingItem({
        category: "household",
        title: "Cordless drill",
        metadata: { condition: "good", lendingTerms: "Return with bit set." },
      }),
    });

    expect(fashion.allowed).toBe(true);
    expect(household.allowed).toBe(true);
    expect(fashion.rationale).not.toContain("food handoff acknowledgement");
    expect(household.rationale).not.toContain("food handoff acknowledgement");
  });

  it("rejects grocery through lending APIs so grocery stays on the food policy path", () => {
    const result = lendingDecision({
      item: lendingItem({
        category: "grocery",
        title: "Sealed pasta",
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.rationale).toContain("Grocery items must use the food-sharing booking policy");
  });

  it("preserves grocery booking acknowledgement policy", () => {
    const result = evaluateBookingPolicy({
      action: "request",
      item: groceryItem(),
      requesterHouseholdId,
      ownerHouseholdId,
      safetyAcknowledged: false,
      relationshipBlocked: false,
      now: new Date("2026-06-29T12:00:00.000Z"),
    });

    expect(result.allowed).toBe(false);
    expect(result.rationale).toContain("food handoff acknowledgement");
  });

  it("rejects private items, self lending, blocked relationships, and unavailable windows", () => {
    const privateItem = lendingDecision({ item: lendingItem({ itemState: "private" }) });
    const self = lendingDecision({ requesterHouseholdId: ownerHouseholdId });
    const blocked = lendingDecision({ relationshipBlocked: true });
    const unavailable = lendingDecision({
      availability: {
        available: false,
        code: "window_conflict",
        reasons: ["Requested window overlaps an active lending booking or unresolved hold."],
        windowStart: "2026-07-03T10:00:00.000Z",
        windowEnd: "2026-07-04T10:00:00.000Z",
        conflicts: [],
      },
    });

    expect(privateItem.allowed).toBe(false);
    expect(privateItem.rationale).toContain("requires a listed item");
    expect(self.allowed).toBe(false);
    expect(self.rationale).toContain("must be different");
    expect(blocked.allowed).toBe(false);
    expect(blocked.rationale).toContain("block exists");
    expect(unavailable.allowed).toBe(false);
    expect(unavailable.rationale).toContain("overlaps an active lending booking");
  });

  it("keeps deposit preferences as deferred owner notes", () => {
    const result = lendingDecision();

    expect(result.allowed).toBe(true);
    expect(result.paymentDeferred).toBe(true);
    expect(result.terms.depositPreference).toContain("Deposit preferred");
    expect(result.terms.paymentDisclosure).toContain("does not capture payment");
    expect(result.terms.paymentDisclosure).toContain("Stripe/payment ledger support is deferred");
  });
});
