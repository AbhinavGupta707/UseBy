import { describe, expect, it } from "vitest";

import { calculateTrustScore, type TrustSignal } from "./runtime";

describe("trust score calculation", () => {
  it("returns a neutral new score without seeded final outputs", () => {
    expect(calculateTrustScore([])).toMatchObject({
      score: 50,
      label: "new",
      eventCount: 0,
    });
  });

  it("adds completed bookings deterministically", () => {
    const trust = calculateTrustScore([
      { type: "booking_completed" },
      { type: "booking_completed" },
      { type: "positive_review" },
    ]);

    expect(trust.score).toBe(70);
    expect(trust.label).toBe("steady");
    expect(trust.positiveCount).toBe(3);
  });

  it("subtracts negative moderation events with a rationale", () => {
    const signals: TrustSignal[] = [
      { type: "booking_completed" },
      { type: "report_submitted" },
      { type: "block_received" },
    ];
    const trust = calculateTrustScore(signals);

    expect(trust.score).toBe(28);
    expect(trust.label).toBe("watch");
    expect(trust.rationale.join(" ")).toContain("negative trust events");
  });

  it("clamps scores to the public 0-100 range", () => {
    expect(
      calculateTrustScore([{ type: "dispute_opened", scoreDelta: -200 }]).score,
    ).toBe(0);
    expect(
      calculateTrustScore([{ type: "booking_completed", scoreDelta: 200 }]).score,
    ).toBe(100);
  });
});
