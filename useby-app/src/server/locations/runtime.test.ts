import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { locationRuntimeUnavailableReason } from "./runtime";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_APP_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
  "MAPBOX_ACCESS_TOKEN",
] as const;

describe("location runtime", () => {
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

  it("does not pretend household geography updates can run without Aurora env", async () => {
    await expect(locationRuntimeUnavailableReason()).resolves.toContain("Aurora env missing");
  });
});
