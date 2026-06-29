import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runPickupReminderJob } from "./pickup-reminders";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "RESEND_API_KEY",
] as const;

describe("pickup reminder job", () => {
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

  it("reports unavailable honestly when Aurora env is missing", async () => {
    const result = await runPickupReminderJob({
      source: "/api/jobs/pickup-reminders:test",
      now: new Date("2026-06-29T10:15:00.000Z"),
    });

    expect(result.status).toBe("unavailable");
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("Aurora env missing");
    expect(result.jobType).toBe("pickup-reminders");
    expect(result.idempotencyKey).toContain("pickup-reminders:system:2026-06-29T10:00:00.000Z");
  });
});
