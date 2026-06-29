import { describe, expect, it } from "vitest";

import {
  CP4_LENDING_TABLE_CONTRACTS,
  LENDING_ACTIVE_RESERVATION_STATUSES,
  LENDING_ELIGIBLE_CATEGORIES,
  LENDING_LISTABLE_ITEM_STATES,
  lendingRequestSchema,
  lendingSchedulePickupSchema,
} from "./contracts";

describe("lending contracts", () => {
  it("keeps CP4 lending scoped to fashion and household listed items", () => {
    expect(LENDING_ELIGIBLE_CATEGORIES).toEqual(["fashion", "household"]);
    expect(LENDING_LISTABLE_ITEM_STATES).toEqual(["listed"]);
    expect(LENDING_ACTIVE_RESERVATION_STATUSES).toEqual(["active"]);
  });

  it("requires CP3 lifecycle tables plus CP4 lending evidence tables", () => {
    expect(CP4_LENDING_TABLE_CONTRACTS.map((contract) => contract.table).sort()).toEqual(
      [
        "blocks",
        "bookings",
        "handoffs",
        "lending_availability_windows",
        "lending_condition_events",
        "lending_reservations",
        "reports",
        "reviews",
        "safety_acknowledgements",
        "trust_events",
      ].sort(),
    );
  });

  it("requires explicit borrow windows and terms acknowledgement for requests", () => {
    expect(
      lendingRequestSchema.safeParse({
        itemId: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c001",
        borrowWindowStart: "2026-07-04T10:00:00.000Z",
        borrowWindowEnd: "2026-07-05T10:00:00.000Z",
        termsAccepted: true,
      }).success,
    ).toBe(true);
    expect(
      lendingRequestSchema.safeParse({
        itemId: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c001",
        borrowWindowStart: "2026-07-05T10:00:00.000Z",
        borrowWindowEnd: "2026-07-04T10:00:00.000Z",
        termsAccepted: true,
      }).success,
    ).toBe(false);
    expect(
      lendingRequestSchema.safeParse({
        itemId: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c001",
        borrowWindowStart: "2026-07-04T10:00:00.000Z",
        borrowWindowEnd: "2026-07-05T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("validates pickup windows separately from borrow windows", () => {
    expect(
      lendingSchedulePickupSchema.safeParse({
        pickupWindowStart: "2026-07-04T09:00:00.000Z",
        pickupWindowEnd: "2026-07-04T09:30:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      lendingSchedulePickupSchema.safeParse({
        pickupWindowStart: "2026-07-04T09:30:00.000Z",
        pickupWindowEnd: "2026-07-04T09:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
