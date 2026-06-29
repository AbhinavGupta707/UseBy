import { describe, expect, it } from "vitest";

import {
  DEMO_SCOPE,
  FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS,
  RIVERSIDE_QUARTER_DEMO_WORLD,
  RIVERSIDE_QUARTER_EXPECTED_COUNTS,
  listSeededFinalOutputViolations,
  summarizeDemoWorld,
} from "../fixtures/demo-world";
import {
  buildDemoSeedPlan,
  createDryRunDemoSeedAdapter,
  createLiveDemoSeedAdapter,
  demoUuidFor,
  runDemoSeedOperation,
  type DemoSeedAdapter,
} from "./demo-seed-adapter";
import { FINAL_OUTPUT_TABLES_NOT_SEEDED } from "./schema-contract";

describe("Riverside Quarter demo world", () => {
  it("contains the checkpoint seed world counts", () => {
    const summary = summarizeDemoWorld();

    expect(summary.households).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.households);
    expect(summary.merchants).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.merchants);
    expect(summary.groceryItemInstances).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.groceryItemInstances);
    expect(summary.fashionItemInstances).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.fashionItemInstances);
    expect(summary.householdItemInstances).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.householdItemInstances);
    expect(summary.needs).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.needs);
    expect(summary.demandPools).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.demandPools);
    expect(summary.storeDrops).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.storeDrops);
    expect(summary.receiptImports).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.receiptImports);
    expect(summary.expiryLabels).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.expiryLabels);
    expect(summary.gs1DigitalLinks).toBe(RIVERSIDE_QUARTER_EXPECTED_COUNTS.gs1DigitalLinks);
  });

  it("does not include seeded final output collections", () => {
    expect(listSeededFinalOutputViolations(RIVERSIDE_QUARTER_DEMO_WORLD)).toEqual([]);
    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toContain("actionCards");
    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toContain("matches");
    expect(FORBIDDEN_SEEDED_OUTPUT_COLLECTIONS).toContain("poolOrders");
  });

  it("keeps demand pools below threshold so no transition is precomputed", () => {
    for (const pool of RIVERSIDE_QUARTER_DEMO_WORLD.demandPools) {
      const householdCommitments = new Set(
        RIVERSIDE_QUARTER_DEMO_WORLD.demandPoolCommitments
          .filter((commitment) => commitment.poolId === pool.demoId)
          .map((commitment) => commitment.householdId),
      );

      expect(pool.status).toBe("gathering");
      expect(householdCommitments.size).toBeLessThan(pool.thresholdHouseholds);
    }
  });

  it("scopes every seeded row to the demo world", () => {
    const scopedCollections = [
      RIVERSIDE_QUARTER_DEMO_WORLD.households,
      RIVERSIDE_QUARTER_DEMO_WORLD.merchants,
      RIVERSIDE_QUARTER_DEMO_WORLD.catalogItems,
      RIVERSIDE_QUARTER_DEMO_WORLD.itemInstances,
      RIVERSIDE_QUARTER_DEMO_WORLD.needs,
      RIVERSIDE_QUARTER_DEMO_WORLD.demandPools,
      RIVERSIDE_QUARTER_DEMO_WORLD.demandPoolCommitments,
      RIVERSIDE_QUARTER_DEMO_WORLD.merchantBids,
      RIVERSIDE_QUARTER_DEMO_WORLD.storeDrops,
      RIVERSIDE_QUARTER_DEMO_WORLD.receiptImports,
      RIVERSIDE_QUARTER_DEMO_WORLD.receiptLineItems,
      RIVERSIDE_QUARTER_DEMO_WORLD.expiryLabels,
    ];

    expect(RIVERSIDE_QUARTER_DEMO_WORLD.neighbourhood.demoScope).toBe(DEMO_SCOPE);
    expect(RIVERSIDE_QUARTER_DEMO_WORLD.gs1DigitalLinks.every((link) => link.demoScope === DEMO_SCOPE)).toBe(true);
    expect(scopedCollections.flat().every((row) => row.demoScope === DEMO_SCOPE)).toBe(true);
  });
});

describe("demo seed/reset plan", () => {
  it("clears derived rows during reset but never seeds final output tables", () => {
    const resetPlan = buildDemoSeedPlan("reset");
    const seedPlan = buildDemoSeedPlan("seed");

    expect(resetPlan.deleteOrder).toContain("action_cards");
    expect(resetPlan.deleteOrder).toContain("matches");
    expect(resetPlan.deleteOrder).toContain("bookings");
    expect(resetPlan.deleteOrder.indexOf("pickup_tasks")).toBeLessThan(
      resetPlan.deleteOrder.indexOf("pool_orders"),
    );
    expect(resetPlan.deleteOrder.indexOf("pool_orders")).toBeLessThan(
      resetPlan.deleteOrder.indexOf("demand_pool_commitments"),
    );
    expect(resetPlan.deleteOrder.at(-1)).toBe("neighbourhoods");

    for (const finalOutputTable of FINAL_OUTPUT_TABLES_NOT_SEEDED) {
      expect(seedPlan.insertOrder).not.toContain(finalOutputTable);
      expect(resetPlan.insertOrder).not.toContain(finalOutputTable);
    }
  });

  it("is dry-run when Aurora env is unavailable", async () => {
    const result = await runDemoSeedOperation("reset", {
      adapter: createDryRunDemoSeedAdapter(),
      requestedAt: "2026-06-29T10:00:00.000Z",
      requestedBy: "test",
    });

    expect(result.status).toBe("dry_run");
    expect(result.applied).toBe(false);
    expect(result.mutationTimestamp).toBe("2026-06-29T10:00:00.000Z");
    expect(result.integrationRequired).toContain(
      "Apply the Checkpoint 1 Aurora migration before running live seed/reset.",
    );
  });

  it("exposes a live Aurora adapter and stable demo UUIDs", () => {
    const adapter = createLiveDemoSeedAdapter();

    expect(adapter.name).toBe("aurora-demo-seed-adapter");
    expect(adapter.live).toBe(true);
    expect(demoUuidFor("hh-atrium-2a")).toBe(demoUuidFor("hh-atrium-2a"));
    expect(demoUuidFor("hh-atrium-2a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("runs through a live adapter contract without changing fixture shape", async () => {
    const liveAdapter: DemoSeedAdapter = {
      name: "test-live-adapter",
      live: true,
      seed: async (world, context) => ({
        status: "applied",
        applied: true,
        message: "seeded",
        seedBatchId: world.metadata.seedBatchId,
        mutationTimestamp: context.requestedAt,
        idempotencyKey: context.idempotencyKey,
        summary: summarizeDemoWorld(world),
        plan: buildDemoSeedPlan(context.operation),
      }),
      reset: async (world, context) => ({
        status: "applied",
        applied: true,
        message: "reset",
        seedBatchId: world.metadata.seedBatchId,
        mutationTimestamp: context.requestedAt,
        idempotencyKey: context.idempotencyKey,
        summary: summarizeDemoWorld(world),
        plan: buildDemoSeedPlan(context.operation),
      }),
    };

    const result = await runDemoSeedOperation("seed", {
      adapter: liveAdapter,
      requestedAt: "2026-06-29T10:05:00.000Z",
      requestedBy: "test",
    });

    expect(result.status).toBe("applied");
    expect(result.summary.itemInstances).toBe(36);
    expect(result.plan.insertOrder).toContain("audit_events");
  });
});
