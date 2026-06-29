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
    privateAccess: "server_mediated";
    mode: "live" | "unavailable";
    reason?: string | null;
  };
  textract: {
    configured: boolean;
    provider: "textract";
    mode: "live" | "unavailable";
    requiresPrivateS3Object: boolean;
    reason?: string | null;
  };
  geocoding: {
    configured: boolean;
    provider: "mapbox" | "fixture" | "unavailable";
    mode: "live" | "fixture" | "unavailable";
    available: boolean;
    reason: string | null;
    schemaAvailable: boolean;
    privacy: {
      exactCoordinatesPublic: false;
      rawAddressesPublic: false;
      directContactPublic: false;
    };
  };
};

export type Cp8ReadinessStatus = "ready" | "configured" | "disabled" | "unavailable";

export type Cp8ProviderStatus = {
  key: string;
  label: string;
  status: Cp8ReadinessStatus;
  configured: boolean;
  noKey: boolean;
  detail: string;
};

export type Cp8EvidenceHook = {
  key: string;
  label: string;
  status: Cp8ReadinessStatus;
  detail: string;
};

export type Cp8SystemState = {
  providers: Cp8ProviderStatus[];
  privateFileEvidence: Cp8EvidenceHook;
  geocodingPrivacy: Cp8EvidenceHook;
  notificationJobs: Cp8EvidenceHook;
  aiGuardrails: {
    status: "ready";
    detail: string;
    allowedUses: readonly string[];
    forbiddenDecisions: readonly string[];
    copyOnly: true;
    deterministicFirst: true;
    canSetEligibility: false;
    canSetTrust: false;
    canSetPayment: false;
    canSetSafety: false;
    canSetReservationCapacity: false;
    canSetVisibility: false;
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
  cp8: Cp8SystemState;
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
