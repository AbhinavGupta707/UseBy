import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeJobIdempotencyKey, runSystemJobStub } from "./runs";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

describe("job run helpers", () => {
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

  it("uses the documented job idempotency key shape", () => {
    expect(
      makeJobIdempotencyKey(
        "expiry-decay",
        "riverside-quarter",
        "2026-06-29T08:00:00.000Z",
      ),
    ).toBe("expiry-decay:riverside-quarter:2026-06-29T08:00:00.000Z");
  });

  it("does not fake job success when database env is missing", async () => {
    const result = await runSystemJobStub(
      "pickup-reminders",
      "/api/jobs/pickup-reminders",
    );

    expect(result.status).toBe("unavailable");
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("Aurora env missing");
  });
});
