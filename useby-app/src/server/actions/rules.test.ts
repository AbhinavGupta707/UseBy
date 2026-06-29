import { describe, expect, it } from "vitest";
import {
  actionCardsForItem,
  expiryBand,
  isFoodShareEligible,
  type GroceryItemForRules,
} from "./rules";

const now = new Date("2026-06-29T12:00:00.000Z");

function item(overrides: Partial<GroceryItemForRules> = {}): GroceryItemForRules {
  return {
    id: "item-wraps",
    title: "Unopened tortilla wraps",
    category: "grocery",
    quantity: 1,
    itemState: "use_soon",
    storageState: "sealed",
    safetyStatus: "eligible",
    useByDate: "2026-07-01",
    metadata: {},
    ...overrides,
  };
}

describe("grocery action rules", () => {
  it("allows neighbour sharing only for eligible package-safe groceries", () => {
    const eligibility = isFoodShareEligible(item(), now);

    expect(eligibility.eligible).toBe(true);
    expect(eligibility.explanation).toContain("eligible safety status");
  });

  it("blocks opened, restricted, unknown, and expired groceries from sharing", () => {
    const blocked = [
      item({ storageState: "opened" }),
      item({ safetyStatus: "restricted" }),
      item({ safetyStatus: "unknown" }),
      item({ useByDate: "2026-06-28" }),
    ];

    expect(blocked.map((candidate) => isFoodShareEligible(candidate, now).eligible)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("keeps expired food as private planning rather than share cards", () => {
    const cards = actionCardsForItem(item({ useByDate: "2026-06-28" }), now);

    expect(expiryBand(item({ useByDate: "2026-06-28" }), now)).toBe("expired");
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe("use_first");
    expect(cards.some((card) => card.type === "share_with_neighbours")).toBe(false);
  });

  it("creates a share card for eligible sealed food and check-label card for uncertainty", () => {
    const shareCards = actionCardsForItem(item(), now);
    const uncertainCards = actionCardsForItem(
      item({
        safetyStatus: "unknown",
        useByDate: null,
        metadata: { estimatedUseByBand: "uncertain_scan_label" },
      }),
      now,
    );

    expect(shareCards.some((card) => card.type === "share_with_neighbours")).toBe(true);
    expect(uncertainCards.some((card) => card.type === "check_label")).toBe(true);
    expect(uncertainCards.some((card) => card.type === "share_with_neighbours")).toBe(false);
  });
});
