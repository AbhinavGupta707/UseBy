import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseExpiryDate,
  parseGroceryDocument,
  parseReceiptText,
} from "./grocery-parser";

const ENV_NAMES = ["AWS_REGION", "AWS_S3_BUCKET"] as const;

describe("grocery Textract parser", () => {
  const previousEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      previousEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      const value = previousEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("parses common expiry label date formats", () => {
    expect(parseExpiryDate("USE BY 02 JUL 2026")).toEqual({
      useByDate: "2026-07-02",
      bestBeforeDate: null,
    });
    expect(parseExpiryDate("BEST BEFORE 2026-08-15")).toEqual({
      useByDate: null,
      bestBeforeDate: "2026-08-15",
    });
  });

  it("turns receipt OCR lines into grocery import lines", () => {
    const lines = parseReceiptText("BABY SPINACH 200G £1.80\nTOTAL £1.80");

    expect(lines).toEqual([
      expect.objectContaining({
        title: "BABY SPINACH 200G",
        priceCents: 180,
        quantity: 1,
      }),
    ]);
  });

  it("labels fixture parse mode when live Textract cannot run", async () => {
    const parsed = await parseGroceryDocument({
      kind: "expiry_label",
      rawText: "USE BY 02 JUL 2026",
    });

    expect(parsed.status).toBe("parsed");
    expect(parsed.mode).toBe("fixture");
    expect(parsed.fixture).toBe(true);
    expect(parsed.reason).toContain("Live Textract unavailable");
    expect(parsed.lines[0]).toMatchObject({
      useByDate: "2026-07-02",
      labelRawText: "USE BY 02 JUL 2026",
    });
  });
});
