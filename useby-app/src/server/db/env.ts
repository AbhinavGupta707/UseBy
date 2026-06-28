export type RuntimeEnvName =
  | "AWS_REGION"
  | "AURORA_CLUSTER_ARN"
  | "AURORA_SECRET_ARN"
  | "AURORA_DATABASE"
  | "AWS_S3_BUCKET";

export type DatabaseRuntimeConfig = {
  region: string;
  clusterArn: string;
  secretArn: string;
  database: string;
};

export type StorageRuntimeConfig = {
  bucket: string;
};

export type RuntimeEnvStatus = {
  databaseConfigured: boolean;
  storageConfigured: boolean;
  configured: boolean;
  missing: RuntimeEnvName[];
  database?: DatabaseRuntimeConfig;
  storage?: StorageRuntimeConfig;
  secretEnvName?: "AURORA_SECRET_ARN" | "AURORA_APP_SECRET_ARN";
};

export type RuntimeEnvSource = Record<string, string | undefined>;

const DATABASE_ENV_NAMES: RuntimeEnvName[] = [
  "AWS_REGION",
  "AURORA_CLUSTER_ARN",
  "AURORA_SECRET_ARN",
  "AURORA_DATABASE",
];

const STORAGE_ENV_NAMES: RuntimeEnvName[] = ["AWS_S3_BUCKET"];

function read(source: RuntimeEnvSource, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

export function loadRuntimeEnv(
  source: RuntimeEnvSource = process.env,
): RuntimeEnvStatus {
  const secretArn = read(source, "AURORA_SECRET_ARN");
  const legacySecretArn = read(source, "AURORA_APP_SECRET_ARN");
  const missing = [...DATABASE_ENV_NAMES, ...STORAGE_ENV_NAMES].filter(
    (name) => {
      if (name === "AURORA_SECRET_ARN") {
        return !secretArn && !legacySecretArn;
      }

      return !read(source, name);
    },
  );

  const databaseConfigured = DATABASE_ENV_NAMES.every((name) => {
    if (name === "AURORA_SECRET_ARN") {
      return Boolean(secretArn || legacySecretArn);
    }

    return Boolean(read(source, name));
  });
  const storageConfigured = STORAGE_ENV_NAMES.every((name) =>
    Boolean(read(source, name)),
  );

  return {
    databaseConfigured,
    storageConfigured,
    configured: databaseConfigured && storageConfigured,
    missing,
    database: databaseConfigured
      ? {
          region: read(source, "AWS_REGION")!,
          clusterArn: read(source, "AURORA_CLUSTER_ARN")!,
          secretArn: (secretArn ?? legacySecretArn)!,
          database: read(source, "AURORA_DATABASE")!,
        }
      : undefined,
    storage: storageConfigured
      ? {
          bucket: read(source, "AWS_S3_BUCKET")!,
        }
      : undefined,
    secretEnvName: secretArn
      ? "AURORA_SECRET_ARN"
      : legacySecretArn
        ? "AURORA_APP_SECRET_ARN"
        : undefined,
  };
}

export function sanitizeRuntimeEnv(env = loadRuntimeEnv()) {
  return {
    configured: env.configured,
    databaseConfigured: env.databaseConfigured,
    storageConfigured: env.storageConfigured,
    missing: env.missing,
    region: env.database?.region ?? null,
    database: env.database?.database ?? null,
    clusterArnConfigured: Boolean(env.database?.clusterArn),
    secretArnConfigured: Boolean(env.database?.secretArn),
    secretEnvName: env.secretEnvName ?? null,
    bucketConfigured: Boolean(env.storage?.bucket),
    bucket: env.storage?.bucket ?? null,
  };
}
