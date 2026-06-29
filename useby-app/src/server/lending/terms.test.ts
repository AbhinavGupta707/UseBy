import { describe, expect, it } from "vitest";

import {
  normalizeLendingTerms,
  sanitizePublicLendingNote,
} from "./terms";

describe("lending terms normalization", () => {
  it("normalizes public condition, availability, return, cleaning, and deposit terms", () => {
    const terms = normalizeLendingTerms({
      category: "fashion",
      metadata: {
        size: "UK 10",
        condition: "Excellent",
        availabilityNote: "Available Friday to Sunday.",
        lendingTerms: "Dry clean or pay cleaning fee. Deposit preferred.",
      },
    });

    expect(terms).toMatchObject({
      size: "UK 10",
      condition: "excellent",
      availabilityNote: "Available Friday to Sunday.",
      cleaningTerms: "Dry clean or pay cleaning fee. Deposit preferred.",
      returnTerms: "Dry clean or pay cleaning fee. Deposit preferred.",
      depositPreference: "Dry clean or pay cleaning fee. Deposit preferred.",
    });
    expect(terms.paymentDisclosure).toContain("does not capture payment");
    expect(terms.paymentDisclosure).toContain("Stripe/payment ledger support is deferred");
  });

  it("redacts direct contact details and exact coordinate-shaped notes", () => {
    expect(
      sanitizePublicLendingNote(
        "Message me at owner@example.com or +44 7700 900123 near 51.5010,-0.1416",
      ),
    ).toBe("Message me at [redacted] or [redacted] near [redacted]");
  });

  it("adds safe defaults when optional metadata is missing", () => {
    const terms = normalizeLendingTerms({
      category: "household",
      metadata: {},
    });

    expect(terms.condition).toBe("condition not specified");
    expect(terms.cleaningTerms).toContain("Return clean");
    expect(terms.returnTerms).toContain("Return the item");
    expect(terms.depositPreference).toBeNull();
    expect(terms.publicNotes.at(-1)).toContain("does not capture payment");
  });
});
