import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSystemState } from "./service";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
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
    expect(JSON.stringify(state)).not.toContain("secret-value");
  });
});
