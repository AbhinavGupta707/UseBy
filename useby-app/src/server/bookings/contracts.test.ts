import { describe, expect, it } from "vitest";

import {
  BOOKING_ACTIVE_RESERVATION_STATUSES,
  CP3_BOOKING_TABLE_CONTRACTS,
  bookingRequestSchema,
  bookingSchedulePickupSchema,
} from "./contracts";

describe("booking contracts", () => {
  it("tracks reservation statuses that must be mutually exclusive per item", () => {
    expect(BOOKING_ACTIVE_RESERVATION_STATUSES).toEqual([
      "accepted",
      "reserved",
      "pickup_scheduled",
      "picked_up",
      "returned",
      "disputed",
    ]);
  });

  it("requires all checkpoint 3 booking tables for live runtime availability", () => {
    expect(CP3_BOOKING_TABLE_CONTRACTS.map((contract) => contract.table).sort()).toEqual(
      [
        "blocks",
        "bookings",
        "handoffs",
        "reports",
        "reviews",
        "safety_acknowledgements",
        "trust_events",
      ].sort(),
    );
  });

  it("accepts match or item request inputs but rejects empty targets", () => {
    expect(
      bookingRequestSchema.safeParse({
        matchId: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c001",
      }).success,
    ).toBe(true);
    expect(
      bookingRequestSchema.safeParse({
        itemId: "6d4d1ad3-6c3e-4f18-a9c0-1249f5f0c002",
      }).success,
    ).toBe(true);
    expect(bookingRequestSchema.safeParse({}).success).toBe(false);
  });

  it("validates pickup windows before route handlers reach the transaction", () => {
    expect(
      bookingSchedulePickupSchema.safeParse({
        pickupWindowStart: "2026-06-29T10:00:00.000Z",
        pickupWindowEnd: "2026-06-29T10:30:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      bookingSchedulePickupSchema.safeParse({
        pickupWindowStart: "2026-06-29T10:30:00.000Z",
        pickupWindowEnd: "2026-06-29T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
