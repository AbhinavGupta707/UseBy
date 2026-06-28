export type AvailabilityStatus = "available" | "partial" | "unavailable";

export type SanitizedRuntimeEnv = {
  configured: boolean;
  databaseConfigured: boolean;
  storageConfigured: boolean;
  missing: string[];
  region: string | null;
  database: string | null;
  clusterArnConfigured: boolean;
  secretArnConfigured: boolean;
  secretEnvName: string | null;
  bucketConfigured: boolean;
  bucket: string | null;
};

export type IntegrationAvailability = {
  aurora: {
    configured: boolean;
    available: boolean;
    missingEnv: string[];
    region: string | null;
    database: string | null;
    error?: string;
  };
  s3: {
    configured: boolean;
    bucket: string | null;
  };
};

export type SystemCount = {
  key: string;
  label: string;
  table: string;
  available: boolean;
  count: number | null;
  reason?: string;
};

export type LatestAuditEvent = {
  id: string | null;
  eventType: string;
  actorType: string | null;
  source: string | null;
  entityType: string | null;
  entityId: string | null;
  idempotencyKey: string | null;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type LatestJobRun = {
  id: string | null;
  jobType: string;
  status: string;
  source: string | null;
  idempotencyKey: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type SystemStateResponse = {
  status: AvailabilityStatus;
  generatedAt: string;
  env: SanitizedRuntimeEnv;
  integrations: IntegrationAvailability;
  counts: SystemCount[];
  latestAuditEvents: {
    available: boolean;
    events: LatestAuditEvent[];
    reason?: string;
  };
  latestJobRuns: {
    available: boolean;
    runs: LatestJobRun[];
    reason?: string;
  };
};

export type ExtensionProof = {
  name: "postgis" | "vector" | "pgcrypto" | "pg_trgm";
  available: boolean;
  installed: boolean;
  defaultVersion: string | null;
  installedVersion: string | null;
};

export type DbProofResponse = {
  status: AvailabilityStatus;
  generatedAt: string;
  env: SanitizedRuntimeEnv;
  database: {
    available: boolean;
    currentDatabase: string | null;
    currentSchema: string | null;
    versionSummary: string | null;
    error?: string;
  };
  extensions: {
    available: boolean;
    items: ExtensionProof[];
    error?: string;
  };
};
