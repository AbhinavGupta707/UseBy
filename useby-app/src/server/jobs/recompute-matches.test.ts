import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRecomputeMatchesJob } from "./recompute-matches";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

describe("recompute matches job", () => {
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

  it("does not fake success when Aurora env is missing", async () => {
    const result = await runRecomputeMatchesJob({
      source: "test",
      neighbourhoodId: "00000000-0000-5000-8000-000000000001",
      now: new Date("2026-06-29T12:15:00.000Z"),
    });

    expect(result.status).toBe("unavailable");
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("Aurora env missing");
  });

  it("uses stable hourly idempotency keys for cron windows", async () => {
    const result = await runRecomputeMatchesJob({
      source: "test",
      neighbourhoodId: "00000000-0000-5000-8000-000000000001",
      now: new Date("2026-06-29T12:45:00.000Z"),
    });

    expect(result.idempotencyKey).toBe(
      "recompute-matches:00000000-0000-5000-8000-000000000001:2026-06-29T12:00:00.000Z",
    );
  });

  it("targets the partial job_runs idempotency index on upsert", () => {
    const source = readFileSync(
      join(process.cwd(), "src/server/jobs/recompute-matches.ts"),
      "utf8",
    );

    expect(source).toContain(
      "on conflict (idempotency_key) where idempotency_key is not null do update",
    );
  });
});
