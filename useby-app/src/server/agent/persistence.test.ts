import { describe, expect, it } from "vitest";

import { fingerprintAgentRequest } from "./persistence";

describe("agent persistence helpers", () => {
  it("fingerprints request summaries without depending on object key order", () => {
    expect(
      fingerprintAgentRequest({
        itemTitle: "Spinach",
        deterministicFactCount: 2,
        nested: { b: true, a: "safe" },
      }),
    ).toBe(
      fingerprintAgentRequest({
        nested: { a: "safe", b: true },
        deterministicFactCount: 2,
        itemTitle: "Spinach",
      }),
    );
  });
});
