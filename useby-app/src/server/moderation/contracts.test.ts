import { describe, expect, it } from "vitest";

import { blockCreateSchema, reportCreateSchema } from "./contracts";

describe("moderation contracts", () => {
  it("validates reports with safe target ids", () => {
    const parsed = reportCreateSchema.parse({
      category: "safety",
      reason: "Shared item looked different from the listing",
      targetHouseholdId: "00000000-0000-5000-8000-000000000010",
      bookingId: "00000000-0000-5000-8000-000000000020",
    });

    expect(parsed).toMatchObject({
      category: "safety",
      targetHouseholdId: "00000000-0000-5000-8000-000000000010",
    });
  });

  it("rejects reports without actionable reason text", () => {
    const parsed = reportCreateSchema.safeParse({
      category: "other",
      reason: "bad",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts household block payloads", () => {
    const parsed = blockCreateSchema.parse({
      blockedHouseholdId: "00000000-0000-5000-8000-000000000010",
      reason: "No further handoffs",
    });

    expect(parsed.blockedHouseholdId).toBe(
      "00000000-0000-5000-8000-000000000010",
    );
  });
});
