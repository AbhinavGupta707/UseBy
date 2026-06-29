import { describe, expect, it } from "vitest";
import { loadProofSnapshot, normalizeProofSnapshot } from "./adapters";
import type { EndpointEnvelope } from "./contracts";

function endpoint(
  endpointPath: string,
  status: EndpointEnvelope["status"],
  data: unknown,
): EndpointEnvelope {
  return {
    endpoint: endpointPath,
    status,
    httpStatus: status === "ok" ? 200 : 404,
    checkedAt: "2026-06-29T10:00:00.000Z",
    data,
    error: status === "ok" ? null : "HTTP 404",
  };
}

describe("proof UI adapters", () => {
  it("keeps missing system endpoints honest and unavailable", async () => {
    const fetcher = async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "Not found",
    });

    const snapshot = await loadProofSnapshot(fetcher);

    expect(snapshot.overallStatus).toBe("unavailable");
    expect(snapshot.stateEndpoint.status).toBe("unavailable");
    expect(snapshot.dbProofEndpoint.status).toBe("unavailable");
    expect(snapshot.rowCounts.every((row) => row.count === null)).toBe(true);
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/demo/reset");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/bookings/request");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/lending/listings");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/lending/:bookingId/complete");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/demand-pools/:poolId/commit");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/merchant/pickups/:orderId/ready");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/merchant/store-drops/:dropId/publish");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/store-drops/:dropId/reserve");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/store-drops/:dropId/cancel-reservation");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/jobs/expire-store-drops");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/merchant/heatmap");
    expect(snapshot.demoControls.map((control) => control.endpoint)).toContain("/api/system/state");
  });

  it("normalizes live counts, extensions, audit events, and jobs", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "available",
        integrations: {
          aurora: { configured: true, available: true, database: "useby" },
          s3: { configured: true, bucket: "private bucket configured" },
        },
        counts: [
          { key: "households", table: "households", count: 8 },
          { key: "itemInstances", table: "item_instances", count: 36 },
          { key: "needs", table: "needs", count: 5 },
          { key: "actionCards", table: "action_cards", count: 4, available: true },
          { key: "matches", table: "matches", count: 2, available: true },
          { key: "bookings", table: "bookings", count: 3, available: true },
          { key: "handoffs", table: "handoffs", count: 2, available: true },
          {
            key: "safetyAcknowledgements",
            table: "safety_acknowledgements",
            count: 5,
            available: true,
          },
          { key: "trustEvents", table: "trust_events", count: 2, available: true },
          { key: "reviews", table: "reviews", count: 1, available: true },
          { key: "reports", table: "reports", count: 1, available: true },
          { key: "blocks", table: "blocks", count: 1, available: true },
          { key: "cp4ListedLendingItems", table: "item_instances", count: 11, available: true },
          { key: "cp4OpenLendingNeeds", table: "needs", count: 3, available: true },
          { key: "cp4ActiveLendingBookings", table: "bookings", count: 2, available: true },
          { key: "cp4LendingHandoffs", table: "handoffs", count: 1, available: true },
          { key: "cp4LendingTrustEvents", table: "trust_events", count: 1, available: true },
          { key: "cp4LendingReviews", table: "reviews", count: 1, available: true },
          {
            key: "cp4LendingAvailabilityWindows",
            table: "lending_availability_windows",
            count: 2,
            available: true,
          },
          { key: "cp4LendingReservations", table: "lending_reservations", count: 3, available: true },
          {
            key: "cp4LendingConditionEvents",
            table: "lending_condition_events",
            count: 4,
            available: true,
          },
          { key: "demandPools", table: "demand_pools", count: 3 },
          { key: "demandPoolCommitments", table: "demand_pool_commitments", count: 5 },
          { key: "merchantBids", table: "merchant_bids", count: 4 },
          { key: "cp6ActiveDemandPools", table: "demand_pools", count: 2, available: true },
          { key: "cp6LiveCommitments", table: "demand_pool_commitments", count: 6, available: true },
          { key: "cp6MerchantBids", table: "merchant_bids", count: 4, available: true },
          { key: "cp6AwardedPools", table: "demand_pools", count: 1, available: true },
          { key: "cp6PoolOrders", table: "pool_orders", count: 6, available: true },
          { key: "cp6PickupTasks", table: "pickup_tasks", count: 6, available: true },
          { key: "cp6ClosePoolJobRuns", table: "job_runs", count: 1, available: true },
          { key: "cp6AuditEvents", table: "audit_events", count: 7, available: true },
          { key: "cp7PublishedDrops", table: "store_drops", count: 2, available: true },
          { key: "cp7ActiveDropReservations", table: "store_drop_reservations", count: 3, available: true },
          { key: "cp7ClosedOrSoldOutDrops", table: "store_drops", count: 1, available: true },
          { key: "cp7HeatmapCells", table: "needs", count: 4, available: true },
          { key: "cp7ExpireDropJobRuns", table: "job_runs", count: 1, available: true },
          { key: "cp7AuditEvents", table: "audit_events", count: 8, available: true },
          { key: "auditEvents", table: "audit_events", count: 12 },
          { key: "jobRuns", table: "job_runs", count: 2 },
        ],
        latestAuditEvents: {
          available: true,
          events: [
            {
              id: "audit_1",
              eventType: "demo.seeded",
              entityType: "seed_batch",
              createdAt: "2026-06-29T10:02:00.000Z",
            },
          ],
        },
        latestJobRuns: {
          available: true,
          runs: [
            {
              id: "job_1",
              jobType: "recompute-matches",
              status: "succeeded",
              finishedAt: "2026-06-29T10:03:00.000Z",
            },
          ],
        },
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: {
          available: true,
          items: [
            { name: "postgis", installed: true, installedVersion: "3.5.0" },
            { name: "pgcrypto", installed: true },
            { name: "pg_trgm", installed: true },
            { name: "vector", installed: false, detail: "Not enabled for Checkpoint 1" },
          ],
        },
      }),
    );

    expect(snapshot.overallStatus).toBe("ok");
    expect(snapshot.integrations.find((integration) => integration.key === "aurora")?.status).toBe("ok");
    expect(snapshot.rowCounts.find((row) => row.key === "households")?.count).toBe(8);
    expect(snapshot.rowCounts.find((row) => row.key === "action_cards")?.count).toBe(4);
    expect(snapshot.rowCounts.find((row) => row.key === "matches")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "bookings")?.count).toBe(3);
    expect(snapshot.rowCounts.find((row) => row.key === "handoffs")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "safety_acknowledgements")?.count).toBe(5);
    expect(snapshot.rowCounts.find((row) => row.key === "trust_events")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "reviews")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "reports")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "blocks")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4ListedLendingItems")?.count).toBe(11);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4OpenLendingNeeds")?.count).toBe(3);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4ActiveLendingBookings")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingHandoffs")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingTrustEvents")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingReviews")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingAvailabilityWindows")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingReservations")?.count).toBe(3);
    expect(snapshot.rowCounts.find((row) => row.key === "cp4LendingConditionEvents")?.count).toBe(4);
    expect(snapshot.rowCounts.find((row) => row.key === "demandPoolCommitments")?.count).toBe(5);
    expect(snapshot.rowCounts.find((row) => row.key === "merchantBids")?.count).toBe(4);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6ActiveDemandPools")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6LiveCommitments")?.count).toBe(6);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6AwardedPools")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6PoolOrders")?.count).toBe(6);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6PickupTasks")?.count).toBe(6);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6ClosePoolJobRuns")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp6AuditEvents")?.count).toBe(7);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7PublishedDrops")?.count).toBe(2);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7ActiveDropReservations")?.count).toBe(3);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7ClosedOrSoldOutDrops")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7HeatmapCells")?.count).toBe(4);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7ExpireDropJobRuns")?.count).toBe(1);
    expect(snapshot.rowCounts.find((row) => row.key === "cp7AuditEvents")?.count).toBe(8);
    expect(snapshot.extensions.find((extension) => extension.name === "postgis")?.status).toBe("ok");
    expect(snapshot.extensions.find((extension) => extension.name === "vector")?.status).toBe("unavailable");
    expect(snapshot.auditEvents[0]?.title).toBe("demo.seeded");
    expect(snapshot.jobRuns[0]?.name).toBe("recompute-matches");
  });

  it("keeps CP2 missing tables visible as unavailable proof rows", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "partial",
        counts: [
          {
            key: "actionCards",
            table: "action_cards",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "matches",
            table: "matches",
            available: false,
            count: null,
            reason: "status column is required for active count",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: { available: true, items: [] },
      }),
    );

    expect(snapshot.rowCounts.find((row) => row.key === "action_cards")).toMatchObject({
      count: null,
      available: false,
      reason: "table is not available",
    });
    expect(snapshot.rowCounts.find((row) => row.key === "matches")).toMatchObject({
      count: null,
      available: false,
      reason: "status column is required for active count",
    });
  });

  it("keeps CP3 missing tables visible as unavailable proof rows", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "partial",
        counts: [
          {
            key: "bookings",
            table: "bookings",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "handoffs",
            table: "handoffs",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "safetyAcknowledgements",
            table: "safety_acknowledgements",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "trustEvents",
            table: "trust_events",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "reviews",
            table: "reviews",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "reports",
            table: "reports",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "blocks",
            table: "blocks",
            available: false,
            count: null,
            reason: "table is not available",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: { available: true, items: [] },
      }),
    );

    for (const key of [
      "bookings",
      "handoffs",
      "safety_acknowledgements",
      "trust_events",
      "reviews",
      "reports",
      "blocks",
    ]) {
      expect(snapshot.rowCounts.find((row) => row.key === key)).toMatchObject({
        count: null,
        available: false,
        reason: "table is not available",
      });
    }
  });

  it("keeps CP4 missing tables and filtered counts visible as unavailable proof rows", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "partial",
        counts: [
          {
            key: "cp4ListedLendingItems",
            table: "item_instances",
            available: false,
            count: null,
            reason: "category, item_state columns are required for filtered count",
          },
          {
            key: "cp4ActiveLendingBookings",
            table: "bookings",
            available: false,
            count: null,
            reason: "item_instance_id column is required for filtered count",
          },
          {
            key: "cp4LendingAvailabilityWindows",
            table: "lending_availability_windows",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "cp4LendingReservations",
            table: "lending_reservations",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "cp4LendingConditionEvents",
            table: "lending_condition_events",
            available: false,
            count: null,
            reason: "table is not available",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: { available: true, items: [] },
      }),
    );

    for (const key of [
      "cp4ListedLendingItems",
      "cp4ActiveLendingBookings",
      "cp4LendingAvailabilityWindows",
      "cp4LendingReservations",
      "cp4LendingConditionEvents",
    ]) {
      expect(snapshot.rowCounts.find((row) => row.key === key)).toMatchObject({
        count: null,
        available: false,
      });
    }
  });

  it("keeps CP6 missing output tables and filtered counts visible as unavailable proof rows", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "partial",
        counts: [
          {
            key: "cp6ActiveDemandPools",
            table: "demand_pools",
            available: false,
            count: null,
            reason: "status column is required for filtered count",
          },
          {
            key: "cp6PoolOrders",
            table: "pool_orders",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "cp6PickupTasks",
            table: "pickup_tasks",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "cp6AuditEvents",
            table: "audit_events",
            available: false,
            count: null,
            reason: "entity_type, action columns are required for filtered count",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: { available: true, items: [] },
      }),
    );

    for (const key of ["cp6ActiveDemandPools", "cp6PoolOrders", "cp6PickupTasks", "cp6AuditEvents"]) {
      expect(snapshot.rowCounts.find((row) => row.key === key)).toMatchObject({
        count: null,
        available: false,
      });
    }
  });

  it("keeps CP7 missing output tables and filtered counts visible as unavailable proof rows", () => {
    const snapshot = normalizeProofSnapshot(
      endpoint("/api/system/state", "ok", {
        status: "partial",
        counts: [
          {
            key: "cp7PublishedDrops",
            table: "store_drops",
            available: false,
            count: null,
            reason: "status column is required for filtered count",
          },
          {
            key: "cp7ActiveDropReservations",
            table: "store_drop_reservations",
            available: false,
            count: null,
            reason: "table is not available",
          },
          {
            key: "cp7HeatmapCells",
            table: "needs",
            available: false,
            count: null,
            reason: "status, location columns are required for filtered count",
          },
          {
            key: "cp7ExpireDropJobRuns",
            table: "job_runs",
            available: false,
            count: null,
            reason: "job_type column is required for filtered count",
          },
          {
            key: "cp7AuditEvents",
            table: "audit_events",
            available: false,
            count: null,
            reason: "entity_type, action columns are required for filtered count",
          },
        ],
      }),
      endpoint("/api/system/db-proof", "ok", {
        status: "available",
        database: { available: true, currentDatabase: "useby", versionSummary: "PostgreSQL 17.7" },
        extensions: { available: true, items: [] },
      }),
    );

    for (const key of [
      "cp7PublishedDrops",
      "cp7ActiveDropReservations",
      "cp7HeatmapCells",
      "cp7ExpireDropJobRuns",
      "cp7AuditEvents",
    ]) {
      expect(snapshot.rowCounts.find((row) => row.key === key)).toMatchObject({
        count: null,
        available: false,
      });
    }
  });
});
