import { describe, expect, it } from "vitest";

import {
  BLOCKED_STORE_DROP_STATUSES,
  STORE_DROP_PAYMENT_NOTICE,
  blockedDropReason,
  isReservableDropStatus,
  merchantStoreDropCreateSchema,
} from "./contracts";

describe("store drop policy contracts", () => {
  it("only allows published drops to accept reservations", () => {
    expect(isReservableDropStatus("published")).toBe(true);
    for (const status of BLOCKED_STORE_DROP_STATUSES) {
      expect(isReservableDropStatus(status)).toBe(false);
      expect(
        blockedDropReason({
          status,
          remainingQuantity: 10,
        }),
      ).toContain("not open for reservations");
    }
  });

  it("blocks sold-out and expired pickup windows from reservation policy", () => {
    expect(
      blockedDropReason({
        status: "published",
        remainingQuantity: 0,
      }),
    ).toBe("Drop is sold out.");

    expect(
      blockedDropReason({
        status: "published",
        remainingQuantity: 1,
        pickupWindowEnd: "2026-06-29T10:00:00.000Z",
        now: new Date("2026-06-29T11:00:00.000Z"),
      }),
    ).toBe("Drop pickup window has expired.");
  });

  it("keeps merchant create input payment-deferred and validates pickup order", () => {
    expect(STORE_DROP_PAYMENT_NOTICE).toMatch(/No card/);
    expect(STORE_DROP_PAYMENT_NOTICE).toMatch(/captured charge/);

    const parsed = merchantStoreDropCreateSchema.safeParse({
      title: "Bakery surplus box",
      totalQuantity: 8,
      pickupWindowStart: "2026-06-29T12:00:00.000Z",
      pickupWindowEnd: "2026-06-29T11:00:00.000Z",
    });

    expect(parsed.success).toBe(false);
  });
});

