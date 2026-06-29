import { describe, expect, it } from "vitest";

import { safetyAcknowledgementCreateSchema } from "./contracts";

describe("safety acknowledgement contract", () => {
  it("requires explicit food handoff acknowledgement", () => {
    const rejected = safetyAcknowledgementCreateSchema.safeParse({
      acknowledgedNotice: false,
    });

    expect(rejected.success).toBe(false);
  });

  it("accepts scoped acknowledgement payloads without contact or coordinate data", () => {
    const parsed = safetyAcknowledgementCreateSchema.parse({
      acknowledgedNotice: true,
      itemId: "00000000-0000-5000-8000-000000000001",
      bookingId: "00000000-0000-5000-8000-000000000002",
      idempotencyKey: "ack-food-001",
    });

    expect(parsed).toMatchObject({
      acknowledgementType: "food_handoff",
      itemId: "00000000-0000-5000-8000-000000000001",
      bookingId: "00000000-0000-5000-8000-000000000002",
    });
  });
});
