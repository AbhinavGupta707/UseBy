import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSystemState } from "./service";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
  "AI_COPY_ENABLED",
  "AI_COPY_PROVIDER",
  "AI_COPY_MODEL",
  "AI_COPY_API_KEY",
  "OPENAI_API_KEY",
  "FIREWORKS_API_KEY",
  "FIREWORKS_BASE_URL",
  "FIREWORKS_CHAT_MODEL",
  "FIREWORKS_EMBEDDING_MODEL",
  "FIREWORKS_RERANKER_MODEL",
  "AI_SEMANTIC_RANKING_ENABLED",
  "AI_EMBEDDING_PROVIDER",
  "AI_EMBEDDING_MODEL",
  "AI_EMBEDDING_API_KEY",
  "LANGSMITH_TRACING",
  "LANGSMITH_ENDPOINT",
  "LANGSMITH_API_KEY",
  "LANGSMITH_PROJECT",
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_ENDPOINT",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_PROJECT",
  "MAPBOX_ACCESS_TOKEN",
  "RESEND_API_KEY",
] as const;

describe("system state service", () => {
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

  it("returns honest unavailable JSON when Aurora env is missing", async () => {
    const state = await getSystemState();

    expect(state.status).toBe("unavailable");
    expect(state.integrations.aurora.available).toBe(false);
    expect(state.counts.length).toBeGreaterThan(0);
    expect(state.counts.every((count) => count.available === false)).toBe(true);
    expect(state.counts.find((count) => count.key === "actionCards")).toMatchObject({
      table: "action_cards",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "matches")).toMatchObject({
      table: "matches",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "bookings")).toMatchObject({
      table: "bookings",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "handoffs")).toMatchObject({
      table: "handoffs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "safetyAcknowledgements")).toMatchObject({
      table: "safety_acknowledgements",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "trustEvents")).toMatchObject({
      table: "trust_events",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "reviews")).toMatchObject({
      table: "reviews",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "reports")).toMatchObject({
      table: "reports",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "blocks")).toMatchObject({
      table: "blocks",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4ListedLendingItems")).toMatchObject({
      table: "item_instances",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4OpenLendingNeeds")).toMatchObject({
      table: "needs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4ActiveLendingBookings")).toMatchObject({
      table: "bookings",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4LendingHandoffs")).toMatchObject({
      table: "handoffs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4LendingAvailabilityWindows")).toMatchObject({
      table: "lending_availability_windows",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4LendingReservations")).toMatchObject({
      table: "lending_reservations",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp4LendingConditionEvents")).toMatchObject({
      table: "lending_condition_events",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6ActiveDemandPools")).toMatchObject({
      table: "demand_pools",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6LiveCommitments")).toMatchObject({
      table: "demand_pool_commitments",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6MerchantBids")).toMatchObject({
      table: "merchant_bids",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6AwardedPools")).toMatchObject({
      table: "demand_pools",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6PoolOrders")).toMatchObject({
      table: "pool_orders",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6PickupTasks")).toMatchObject({
      table: "pickup_tasks",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6ClosePoolJobRuns")).toMatchObject({
      table: "job_runs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp6AuditEvents")).toMatchObject({
      table: "audit_events",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7PublishedDrops")).toMatchObject({
      table: "store_drops",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7ActiveDropReservations")).toMatchObject({
      table: "store_drop_reservations",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7ClosedOrSoldOutDrops")).toMatchObject({
      table: "store_drops",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7HeatmapCells")).toMatchObject({
      table: "needs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7ExpireDropJobRuns")).toMatchObject({
      table: "job_runs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp7AuditEvents")).toMatchObject({
      table: "audit_events",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8FileIntakes")).toMatchObject({
      table: "file_intakes",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8PrivateUploadedFiles")).toMatchObject({
      table: "files",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8FixtureParses")).toMatchObject({
      table: "file_intakes",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8Notifications")).toMatchObject({
      table: "notifications",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8StorageTextractAuditEvents")).toMatchObject({
      table: "audit_events",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8HouseholdGeographies")).toMatchObject({
      table: "households",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8MerchantGeographies")).toMatchObject({
      table: "merchant_locations",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8DropGeographies")).toMatchObject({
      table: "store_drops",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8DemandPoolGeographies")).toMatchObject({
      table: "demand_pools",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8PrivateFiles")).toMatchObject({
      table: "files",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8NotificationRows")).toMatchObject({
      table: "notifications",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8PickupReminderJobs")).toMatchObject({
      table: "job_runs",
      available: false,
      count: null,
    });
    expect(state.counts.find((count) => count.key === "cp8AiAuditEvents")).toMatchObject({
      table: "audit_events",
      available: false,
      count: null,
    });
    expect(state.integrations.s3).toMatchObject({
      configured: false,
      mode: "unavailable",
      privateAccess: "server_mediated",
    });
    expect(state.integrations.textract).toMatchObject({
      configured: false,
      mode: "unavailable",
      requiresPrivateS3Object: true,
    });
    expect(state.integrations.geocoding).toMatchObject({
      configured: false,
      mode: "unavailable",
      available: false,
      schemaAvailable: false,
      privacy: {
        exactCoordinatesPublic: false,
        rawAddressesPublic: false,
        directContactPublic: false,
      },
    });
    expect(state.cp8.providers.find((provider) => provider.key === "ai-copy")).toMatchObject({
      status: "disabled",
      noKey: true,
    });
    expect(state.cp8.aiGuardrails).toMatchObject({
      copyOnly: true,
      deterministicFirst: true,
      canSetEligibility: false,
      canSetTrust: false,
      canSetPayment: false,
      canSetSafety: false,
      canSetReservationCapacity: false,
      canSetVisibility: false,
    });
    expect(JSON.stringify(state)).not.toContain("secret-value");
  });
});
