import { describe, expect, it } from "vitest";

import { heatmapPrivacyKeys } from "./merchant";

describe("merchant heatmap privacy contract", () => {
  it("returns aggregate cell keys instead of household coordinates or contact fields", () => {
    const keys = heatmapPrivacyKeys();

    expect(keys).toContain("cellId");
    expect(keys).toContain("distinctHouseholds");
    expect(keys).not.toContain("latitude");
    expect(keys).not.toContain("longitude");
    expect(keys).not.toContain("homeLocation");
    expect(keys).not.toContain("unitLabel");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("address");
  });
});
