import { describe, expect, it } from "vitest";
import { loadRuntimeEnv, sanitizeRuntimeEnv } from "./env";

describe("runtime env", () => {
  it("loads the canonical Aurora Data API env without exposing secret values", () => {
    const env = loadRuntimeEnv({
      AWS_REGION: "eu-west-2",
      AURORA_CLUSTER_ARN: "cluster-arn",
      AURORA_SECRET_ARN: "secret-arn-value",
      AURORA_DATABASE: "useby",
      AWS_S3_BUCKET: "bucket-name",
    });

    expect(env.databaseConfigured).toBe(true);
    expect(env.storageConfigured).toBe(true);
    expect(env.secretEnvName).toBe("AURORA_SECRET_ARN");

    const sanitized = sanitizeRuntimeEnv(env);
    expect(sanitized.secretArnConfigured).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("secret-arn-value");
  });

  it("accepts the checkpoint-0 app secret alias while reporting canonical missing names", () => {
    const env = loadRuntimeEnv({
      AWS_REGION: "eu-west-2",
      AURORA_CLUSTER_ARN: "cluster-arn",
      AURORA_APP_SECRET_ARN: "legacy-secret-arn",
      AURORA_DATABASE: "useby",
      AWS_S3_BUCKET: "bucket-name",
    });

    expect(env.databaseConfigured).toBe(true);
    expect(env.missing).toEqual([]);
    expect(env.secretEnvName).toBe("AURORA_APP_SECRET_ARN");
  });
});
