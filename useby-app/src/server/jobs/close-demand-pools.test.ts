import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCloseDemandPoolsJob } from "./close-demand-pools";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

describe("close DemandPools job", () => {
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

  it("reports unavailable instead of stub success when Aurora env is missing", async () => {
    const result = await runCloseDemandPoolsJob({
      source: "/api/jobs/close-demand-pools:test",
      now: new Date("2026-06-29T10:15:00.000Z"),
    });

    expect(result.status).toBe("unavailable");
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("Aurora env missing");
  });
});
