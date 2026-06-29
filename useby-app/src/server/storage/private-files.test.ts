import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPrivateStorageStatus } from "./private-files";

const ENV_NAMES = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
  "AWS_S3_BUCKET",
] as const;

describe("private file storage", () => {
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

  it("reports honest unavailable state when S3 env is missing", () => {
    const status = getPrivateStorageStatus();

    expect(status.available).toBe(false);
    expect(status.mode).toBe("unavailable");
    expect(status.reason).toContain("AWS_REGION");
    expect(status.reason).toContain("AWS_S3_BUCKET");
  });

  it("uses server-side private S3 when region and bucket are configured", () => {
    process.env.AWS_REGION = "eu-west-2";
    process.env.AWS_S3_BUCKET = "private-useby-bucket";

    const status = getPrivateStorageStatus();

    expect(status).toMatchObject({
      available: true,
      provider: "s3",
      bucket: "private-useby-bucket",
      mode: "live",
    });
  });
});
