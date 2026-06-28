import { describe, expect, it } from "vitest";

import {
  bidStatusValues,
  checkpoint1Tables,
  itemCategoryValues,
  itemStateValues,
  needStatusValues,
  poolStatusValues,
  safetyStatusValues,
  storageStateValues,
} from "./schema";

describe("checkpoint 1 schema contract", () => {
  it("exports the core checkpoint 1 tables for runtime and seed lanes", () => {
    expect(Object.keys(checkpoint1Tables).sort()).toEqual(
      [
        "auditEvents",
        "demandPoolCommitments",
        "demandPools",
        "files",
        "householdMembers",
        "households",
        "idempotencyKeys",
        "inventoryEvents",
        "itemCatalog",
        "itemInstances",
        "jobRuns",
        "merchantBids",
        "merchantLocations",
        "merchantUsers",
        "merchants",
        "needs",
        "neighbourhoods",
        "seedBatches",
        "users",
      ].sort(),
    );
  });

  it("keeps orchestration enum values stable", () => {
    expect(itemCategoryValues).toEqual(["grocery", "fashion", "household"]);
    expect(itemStateValues).toContain("reserved");
    expect(itemStateValues).toContain("disputed");
    expect(storageStateValues).toContain("sealed");
    expect(safetyStatusValues).toEqual(["eligible", "restricted", "blocked", "unknown"]);
    expect(needStatusValues).toEqual(["open", "matched", "fulfilled", "expired", "cancelled"]);
    expect(poolStatusValues).toContain("threshold_met");
    expect(poolStatusValues).toContain("ready_for_pickup");
    expect(bidStatusValues).toContain("winning");
  });
});
