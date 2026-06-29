import { describe, expect, it } from "vitest";

import {
  actionCardStatusValues,
  agentRunStatusValues,
  bidStatusValues,
  bookingStatusValues,
  checkpoint8IntegrationTables,
  checkpoint9AgentTables,
  checkpoint6DemandPoolOutputTables,
  checkpoint7StoreDropTables,
  checkpoint4LendingTables,
  checkpoint3BookingTables,
  checkpoint1Tables,
  checkpoint2GroceryTables,
  expiryConfidenceValues,
  expiryObservationSourceValues,
  fileIntakeKindValues,
  fileIntakeStatusValues,
  itemCategoryValues,
  itemStateValues,
  matchStatusValues,
  needStatusValues,
  notificationStatusValues,
  poolStatusValues,
  providerRunModeValues,
  receiptImportStatusValues,
  safetyStatusValues,
  storageStateValues,
  lendingAvailabilityStatusValues,
  lendingConditionEventTypeValues,
  lendingReservationStatusValues,
  pickupTaskStatusValues,
  poolOrderStatusValues,
  storeDropReservationStatusValues,
  storeDropStatusValues,
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
    expect(poolOrderStatusValues).toEqual(["pending", "ready", "collected", "fulfilled", "cancelled"]);
    expect(pickupTaskStatusValues).toEqual(["pending", "ready", "collected", "cancelled"]);
    expect(storeDropStatusValues).toEqual(["draft", "published", "paused", "closed", "expired"]);
    expect(storeDropReservationStatusValues).toEqual(["active", "cancelled", "expired", "picked_up"]);
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
    expect(fileIntakeKindValues).toEqual(["receipt", "expiry_label"]);
    expect(fileIntakeStatusValues).toContain("parse_unavailable");
    expect(providerRunModeValues).toEqual(["live", "fixture", "dry_run", "unavailable"]);
    expect(notificationStatusValues).toEqual(["unread", "read", "archived", "queued", "failed"]);
    expect(agentRunStatusValues).toEqual([
      "started",
      "succeeded",
      "failed",
      "fallback",
      "unavailable",
    ]);
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

  it("exports checkpoint 6 DemandPool output tables separately from seed input tables", () => {
    expect(Object.keys(checkpoint6DemandPoolOutputTables).sort()).toEqual(
      [
        "pickupTasks",
        "poolOrders",
      ].sort(),
    );
    expect(Object.keys(checkpoint1Tables)).not.toContain("poolOrders");
    expect(Object.keys(checkpoint1Tables)).not.toContain("pickupTasks");
  });

  it("exports checkpoint 7 store drop runtime tables separately", () => {
    expect(Object.keys(checkpoint7StoreDropTables).sort()).toEqual(
      [
        "storeDropReservations",
        "storeDrops",
      ].sort(),
    );
    expect(Object.keys(checkpoint1Tables)).not.toContain("storeDrops");
    expect(Object.keys(checkpoint1Tables)).not.toContain("storeDropReservations");
  });

  it("exports checkpoint 8 integration primitives separately", () => {
    expect(Object.keys(checkpoint8IntegrationTables).sort()).toEqual(
      [
        "fileIntakes",
        "notifications",
      ].sort(),
    );
  });

  it("exports checkpoint 9 agent persistence tables separately", () => {
    expect(Object.keys(checkpoint9AgentTables).sort()).toEqual(
      [
        "agentArtifacts",
        "agentRuns",
        "agentToolCalls",
      ].sort(),
    );
  });
});
