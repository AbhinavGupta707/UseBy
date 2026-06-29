import { describe, expect, it } from "vitest";

import { evaluateLendingAvailability } from "./availability";

describe("lending availability policy", () => {
  it("allows a valid listed item window with no live conflicts", () => {
    expect(
      evaluateLendingAvailability({
        windowStart: "2026-07-03T10:00:00.000Z",
        windowEnd: "2026-07-04T10:00:00.000Z",
        itemState: "listed",
      }),
    ).toMatchObject({
      available: true,
      code: "available",
      conflicts: [],
    });
  });

  it("rejects invalid windows and unavailable item states", () => {
    const decision = evaluateLendingAvailability({
      windowStart: "2026-07-04T10:00:00.000Z",
      windowEnd: "2026-07-03T10:00:00.000Z",
      itemState: "private",
    });

    expect(decision.available).toBe(false);
    expect(decision.reasons.join(" ")).toContain("end must be after start");
    expect(decision.reasons.join(" ")).toContain("requires a listed item");
  });

  it("rejects windows with active booking, handoff, or unresolved hold conflicts", () => {
    const decision = evaluateLendingAvailability({
      windowStart: "2026-07-03T10:00:00.000Z",
      windowEnd: "2026-07-04T10:00:00.000Z",
      itemState: "listed",
      conflicts: [
        {
          bookingId: "00000000-0000-5000-8000-000000000080",
          status: "requested",
          windowStart: null,
          windowEnd: null,
          source: "active_booking_without_window",
        },
      ],
    });

    expect(decision).toMatchObject({
      available: false,
      code: "window_conflict",
    });
    expect(decision.reasons.join(" ")).toContain("active lending booking");
  });
});
