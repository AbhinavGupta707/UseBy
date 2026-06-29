import { describe, expect, it } from "vitest";

import {
  CP7_STORE_DROP_TABLE_CONTRACTS,
  STORE_DROP_PAYMENT_NOTICE,
  STORE_DROP_SAFETY_NOTICE,
  assertStoreDropDtoIsPrivacySafe,
  computeStoreDropAvailability,
  storeDropCancelReservationSchema,
  storeDropReserveSchema,
  type StoreDropDto,
} from "./contracts";

describe("store drop contracts", () => {
  it("declares CP7 store drop table availability requirements", () => {
    expect(CP7_STORE_DROP_TABLE_CONTRACTS.map((contract) => contract.table)).toEqual([
      "store_drops",
      "store_drop_reservations",
      "merchants",
      "merchant_locations",
      "idempotency_keys",
      "audit_events",
    ]);
  });

  it("computes live availability from reserved rows without going negative", () => {
    expect(
      computeStoreDropAvailability({
        quantityTotal: 10,
        quantityReserved: 3,
      }),
    ).toEqual({
      quantityTotal: 10,
      quantityReserved: 3,
      quantityRemaining: 7,
      soldOut: false,
    });

    expect(
      computeStoreDropAvailability({
        quantityTotal: 5,
        quantityReserved: 8,
      }),
    ).toMatchObject({
      quantityRemaining: 0,
      soldOut: true,
    });
  });

  it("validates reserve/cancel payloads as unpaid demo pickup intent", () => {
    const reserveParsed = storeDropReserveSchema.parse({
      quantity: 2,
      idempotencyKey: "reserve-key-1",
      cardNumber: "4111111111111111",
    });
    const cancelParsed = storeDropCancelReservationSchema.parse({
      reason: "Changed plans",
      authorizationAmount: 350,
    });

    expect(reserveParsed).not.toHaveProperty("cardNumber");
    expect(cancelParsed).not.toHaveProperty("authorizationAmount");
    expect(STORE_DROP_PAYMENT_NOTICE).toContain("Unpaid demo pickup intent only");
    expect(STORE_DROP_PAYMENT_NOTICE).toContain("No card");
  });

  it("keeps public DTOs free of household coordinates and direct contact fields", () => {
    const dto: StoreDropDto = {
      id: "drop_1",
      title: "Evening bakery surplus box",
      description: null,
      status: "published",
      merchant: {
        id: "merchant_1",
        displayName: "Courtyard Bakehouse",
        category: "bakery",
      },
      pickup: {
        areaLabel: "Courtyard Market Stall 3",
        publicAddress: "Courtyard Market Stall 3",
        windowStart: "2026-06-29T17:00:00.000Z",
        windowEnd: "2026-06-29T18:30:00.000Z",
        notes: "Daily 17:00-18:30",
      },
      quantity: {
        total: "12.000",
        reserved: "0.000",
        remaining: "12.000",
        unit: "box",
        soldOut: false,
      },
      price: {
        amountCents: 350,
        currency: "GBP",
        display: "£3.50",
      },
      safety: {
        notes: "Merchant-packed same-day baked goods.",
        notice: STORE_DROP_SAFETY_NOTICE,
      },
      currentHouseholdReservation: null,
      timeline: {
        createdAt: "2026-06-29T10:00:00.000Z",
        updatedAt: "2026-06-29T10:00:00.000Z",
      },
      paymentNotice: STORE_DROP_PAYMENT_NOTICE,
    };

    expect(assertStoreDropDtoIsPrivacySafe(dto)).toEqual([]);
  });
});
