import { describe, expect, it } from "vitest";

import {
  actionCardStatusValues,
  bidStatusValues,
  bookingStatusValues,
  checkpoint4LendingTables,
  checkpoint3BookingTables,
  checkpoint1Tables,
  checkpoint2GroceryTables,
  expiryConfidenceValues,
  expiryObservationSourceValues,
  itemCategoryValues,
  itemStateValues,
  matchStatusValues,
  needStatusValues,
  poolStatusValues,
  receiptImportStatusValues,
  safetyStatusValues,
  storageStateValues,
  lendingAvailabilityStatusValues,
  lendingConditionEventTypeValues,
  lendingReservationStatusValues,
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

  it("exports the checkpoint 2 grocery runtime tables for API and recompute lanes", () => {
    expect(Object.keys(checkpoint2GroceryTables).sort()).toEqual(
      [
        "actionCards",
        "expiryObservations",
        "matches",
        "receiptImports",
        "receiptLineItems",
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
    expect(receiptImportStatusValues).toEqual(["started", "parsed", "applied", "failed"]);
    expect(expiryObservationSourceValues).toContain("label");
    expect(expiryConfidenceValues).toEqual(["low", "medium", "high", "confirmed"]);
    expect(matchStatusValues).toContain("active");
    expect(matchStatusValues).toContain("proposed");
    expect(actionCardStatusValues).toEqual([
      "active",
      "dismissed",
      "snoozed",
      "completed",
      "invalidated",
    ]);
    expect(bookingStatusValues).toEqual([
      "requested",
      "accepted",
      "reserved",
      "pickup_scheduled",
      "picked_up",
      "returned",
      "completed",
      "reviewed",
      "cancelled",
      "declined",
      "disputed",
    ]);
    expect(lendingAvailabilityStatusValues).toEqual(["available", "blocked", "paused"]);
    expect(lendingReservationStatusValues).toEqual(["requested", "active", "released", "cancelled"]);
    expect(lendingConditionEventTypeValues).toContain("return_evidence");
  });

  it("exports the checkpoint 3 booking lifecycle tables for booking and trust lanes", () => {
    expect(Object.keys(checkpoint3BookingTables).sort()).toEqual(
      [
        "blocks",
        "bookings",
        "handoffs",
        "reports",
        "reviews",
        "safetyAcknowledgements",
        "trustEvents",
      ].sort(),
    );
  });

  it("exports the checkpoint 4 lending evidence tables without replacing bookings", () => {
    expect(Object.keys(checkpoint4LendingTables).sort()).toEqual(
      [
        "lendingAvailabilityWindows",
        "lendingConditionEvents",
        "lendingReservations",
      ].sort(),
    );
  });
});
