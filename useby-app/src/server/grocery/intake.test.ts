import { describe, expect, it } from "vitest";

import { groceryFileIntakeSchema } from "./intake";

describe("grocery file intake contract", () => {
  it("accepts receipt intake with raw text dry-run parsing", () => {
    const parsed = groceryFileIntakeSchema.parse({
      kind: "receipt",
      rawText: "BABY SPINACH 200G £1.80",
      apply: false,
    });

    expect(parsed).toMatchObject({
      kind: "receipt",
      parse: true,
      apply: false,
      allowFixture: true,
      contentType: "text/plain",
    });
  });

  it("requires an item id before applying an expiry label observation", () => {
    const parsed = groceryFileIntakeSchema.safeParse({
      kind: "expiry_label",
      rawText: "USE BY 02 JUL 2026",
      apply: true,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.flatten().fieldErrors.itemId?.[0]).toContain("itemId");
  });

  it("requires either upload bytes or raw text", () => {
    const parsed = groceryFileIntakeSchema.safeParse({
      kind: "receipt",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.flatten().fieldErrors.contentBase64?.[0]).toContain(
      "contentBase64 or rawText",
    );
  });
});
