import { describe, expect, it } from "vitest";
import { scoreFoodMatchCandidate, type FoodMatchCandidate } from "./food";

const now = new Date("2026-06-29T12:00:00.000Z");

function candidate(
  overrides: Partial<FoodMatchCandidate> = {},
): FoodMatchCandidate {
  return {
    need: {
      id: "need-wraps",
      title: "Wraps for dinner",
      quantity: 1,
      unit: "pack",
      neededBy: "2026-06-29T19:00:00.000Z",
    },
    item: {
      id: "item-wraps",
      title: "Unopened tortilla wraps",
      category: "grocery",
      quantity: 2,
      itemState: "listed",
      storageState: "sealed",
      safetyStatus: "eligible",
      useByDate: "2026-07-01",
      metadata: {},
    },
    distanceMeters: 120,
    textSimilarity: 0.86,
    ...overrides,
  };
}

describe("food match scoring", () => {
  it("scores eligible nearby package-safe food with rationale", () => {
    const score = scoreFoodMatchCandidate(candidate(), now);

    expect(score.eligible).toBe(true);
    expect(score.score).toBeGreaterThan(70);
    expect(score.rationale).toContain("120m away");
  });

  it("blocks unsafe food before score is considered", () => {
    const score = scoreFoodMatchCandidate(
      candidate({
        textSimilarity: 1,
        distanceMeters: 10,
        item: {
          ...candidate().item,
          storageState: "opened",
          safetyStatus: "eligible",
        },
      }),
      now,
    );

    expect(score.eligible).toBe(false);
    expect(score.score).toBe(0);
    expect(score.blockedReasons.join(" ")).toContain("Storage state is opened");
  });

  it("rewards closer and more text-relevant candidates", () => {
    const close = scoreFoodMatchCandidate(candidate(), now);
    const distant = scoreFoodMatchCandidate(
      candidate({ distanceMeters: 1_400, textSimilarity: 0.3 }),
      now,
    );

    expect(close.score).toBeGreaterThan(distant.score);
  });
});
