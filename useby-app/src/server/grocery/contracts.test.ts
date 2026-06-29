import { describe, expect, it } from "vitest";

import {
  groceryImportSchema,
  groceryItemUpdateSchema,
} from "./contracts";

describe("grocery API contracts", () => {
  it("accepts manual grocery input with expiry evidence", () => {
    const parsed = groceryImportSchema.parse({
      idempotencyKey: "receipt-demo-001",
      source: "receipt",
      merchantName: "River Pantry",
      purchaseDate: "2026-06-29",
      lines: [
        {
          title: "Sealed Greek yoghurt",
          quantity: 2,
          unit: "pot",
          priceCents: 220,
          storageState: "fridge",
          safetyStatus: "eligible",
          useByDate: "2026-07-02",
          expiryConfidence: "confirmed",
          labelRawText: "USE BY 02 JUL 2026",
        },
      ],
    });

    expect(parsed.lines[0]).toMatchObject({
      title: "Sealed Greek yoghurt",
      storageState: "fridge",
      safetyStatus: "eligible",
      useByDate: "2026-07-02",
    });
  });

  it("rejects empty receipt/manual inputs", () => {
    const parsed = groceryImportSchema.safeParse({
      source: "manual",
      lines: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts label and storage updates without requiring exact coordinates", () => {
    const parsed = groceryItemUpdateSchema.parse({
      idempotencyKey: "label-update-001",
      storageState: "fridge",
      useByDate: "2026-07-03",
      expirySource: "label",
      expiryConfidence: "high",
      labelRawText: "USE BY 03 JUL",
    });

    expect(parsed).toMatchObject({
      storageState: "fridge",
      useByDate: "2026-07-03",
      expirySource: "label",
    });
  });
});
