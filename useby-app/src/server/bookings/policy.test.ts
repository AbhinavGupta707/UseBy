import { describe, expect, it } from "vitest";

import {
  evaluateBookingPolicy,
  type BookingPolicyItem,
} from "./policy";

const now = new Date("2026-06-29T12:00:00.000Z");

function item(overrides: Partial<BookingPolicyItem> = {}): BookingPolicyItem {
  return {
    id: "00000000-0000-5000-8000-000000000001",
    ownerHouseholdId: "00000000-0000-5000-8000-000000000010",
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

function decision(overrides: Partial<Parameters<typeof evaluateBookingPolicy>[0]> = {}) {
  return evaluateBookingPolicy({
    action: "request",
    item: item(),
    requesterHouseholdId: "00000000-0000-5000-8000-000000000020",
    ownerHouseholdId: "00000000-0000-5000-8000-000000000010",
    safetyAcknowledged: true,
    relationshipBlocked: false,
    now,
    ...overrides,
  });
}

describe("booking policy guard", () => {
  it("allows eligible acknowledged food between unblocked households", () => {
    expect(decision()).toMatchObject({
      allowed: true,
      code: "allowed",
      reasons: [],
    });
  });

  it("rejects missing safety acknowledgement", () => {
    const result = decision({ safetyAcknowledged: false });

    expect(result.allowed).toBe(false);
    expect(result.rationale).toContain("food handoff acknowledgement");
  });

  it("rejects unsafe status, opened or cooked storage, and expired food", () => {
    const rejected = [
      decision({ item: item({ safetyStatus: "restricted" }) }),
      decision({ item: item({ storageState: "opened" }) }),
      decision({ item: item({ storageState: "cooked" }) }),
      decision({ item: item({ useByDate: "2026-06-28" }) }),
    ];

    expect(rejected.every((result) => !result.allowed)).toBe(true);
    expect(rejected.map((result) => result.rationale).join(" ")).toContain(
      "private planning only",
    );
    expect(rejected.map((result) => result.rationale).join(" ")).toContain(
      "past its recorded expiry",
    );
  });

  it("rejects blocked relationships and self-booking", () => {
    const blocked = decision({ relationshipBlocked: true });
    const self = decision({
      requesterHouseholdId: "00000000-0000-5000-8000-000000000010",
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.rationale).toContain("block exists");
    expect(self.allowed).toBe(false);
    expect(self.rationale).toContain("must be different");
  });
});
