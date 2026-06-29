import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storeDropDtoFromRow, storeDropRuntimeUnavailableReason } from "./runtime";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

describe("store drop runtime", () => {
  const previousEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      previousEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const value = previousEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("does not pretend store drops can run without Aurora env", async () => {
    await expect(storeDropRuntimeUnavailableReason()).resolves.toContain(
      "Aurora env missing",
    );
  });

  it("maps rows into privacy-safe DTOs with recomputed remaining quantity", () => {
    const dto = storeDropDtoFromRow({
      id: "drop_1",
      title: "Evening bakery surplus box",
      description: null,
      status: "published",
      merchant_id: "merchant_1",
      merchant_name: "Courtyard Bakehouse",
      merchant_category: "bakery",
      location_name: "Courtyard Market Stall 3",
      public_address: "Courtyard Market Stall 3",
      pickup_notes: "Daily 17:00-18:30",
      quantity_total: "12.000",
      unit: "box",
      price_cents: 350,
      currency: "GBP",
      pickup_window_start: "2026-06-29T17:00:00.000Z",
      pickup_window_end: "2026-06-29T18:30:00.000Z",
      safety_notes: "Merchant-packed same-day baked goods.",
      reserved_quantity: "5.000",
      reservation_id: "reservation_1",
      reservation_status: "active",
      reservation_quantity: "2.000",
      reservation_reserved_at: "2026-06-29T12:00:00.000Z",
      reservation_cancelled_at: null,
      reservation_expires_at: "2026-06-29T18:30:00.000Z",
      reservation_updated_at: "2026-06-29T12:00:00.000Z",
      created_at: "2026-06-29T10:00:00.000Z",
      updated_at: "2026-06-29T12:00:00.000Z",
    });

    expect(dto.quantity).toMatchObject({
      total: "12.000",
      reserved: "5.000",
      remaining: "7.000",
      soldOut: false,
    });
    expect(dto.currentHouseholdReservation?.quantity).toBe("2.000");
    expect(dto.pickup.publicAddress).toBeNull();
    expect(JSON.stringify(dto)).not.toContain("home_location");
    expect(JSON.stringify(dto)).not.toContain("unit_label");
    expect(JSON.stringify(dto)).not.toContain("Courtyard Market Stall 3");
    expect(JSON.stringify(dto)).not.toContain("lat");
  });
});
