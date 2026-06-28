import type {
  ArchitectureNode,
  DemoControlProof,
  EndpointEnvelope,
  ExtensionProof,
  IntegrationProof,
  JobRunProof,
  ProofSnapshot,
  ProofStatus,
  RowCountProof,
  TimelineEventProof,
} from "./contracts";

const CHECKPOINT_TABLES: RowCountProof[] = [
  { key: "neighbourhoods", label: "Neighbourhoods", count: null },
  { key: "households", label: "Households", count: null },
  { key: "users", label: "Users", count: null },
  { key: "merchants", label: "Merchants", count: null },
  { key: "item_catalog", label: "Catalog Items", count: null },
  { key: "item_instances", label: "Item Instances", count: null },
  { key: "needs", label: "Needs", count: null },
  { key: "demand_pools", label: "Demand Pools", count: null },
  { key: "audit_events", label: "Audit Events", count: null },
  { key: "job_runs", label: "Job Runs", count: null },
];

export const CHECKPOINT_DEMO_CONTROLS: DemoControlProof[] = [
  {
    key: "reset",
    label: "Reset neighbourhood",
    method: "POST",
    endpoint: "/api/demo/reset",
    detail: "Clears demo-scoped rows and reseeds input world state.",
  },
  {
    key: "seed",
    label: "Seed input world",
    method: "POST",
    endpoint: "/api/demo/seed",
    detail: "Creates Riverside Quarter households, merchants, inventory, needs, and pools.",
  },
  {
    key: "receipt",
    label: "Import demo receipt",
    method: "POST",
    endpoint: "/api/demo/receipt",
    detail: "Writes receipt-derived grocery rows when the route is installed.",
  },
  {
    key: "need",
    label: "Add neighbour need",
    method: "POST",
    endpoint: "/api/demo/need",
    detail: "Inserts a live need row for recomputation.",
  },
  {
    key: "matching",
    label: "Run matching",
    method: "GET",
    endpoint: "/api/jobs/recompute-matches",
    detail: "Runs the Checkpoint job route and records job/audit output.",
  },
  {
    key: "booking",
    label: "Accept booking",
    method: "POST",
    endpoint: "/api/demo/booking/accept",
    detail: "Executes the demo booking transition when later lanes expose it.",
  },
  {
    key: "pool",
    label: "Join DemandPool",
    method: "POST",
    endpoint: "/api/demo/demand-pool/join",
    detail: "Adds a live pool commitment and checks threshold state.",
  },
  {
    key: "bid",
    label: "Submit merchant bid",
    method: "POST",
    endpoint: "/api/demo/merchant-bid",
    detail: "Persists a merchant bundle bid for scoring.",
  },
  {
    key: "award",
    label: "Award pool",
    method: "GET",
    endpoint: "/api/jobs/close-demand-pools",
    detail: "Runs the DemandPool close/award job when present.",
  },
];

const EXPECTED_EXTENSIONS = ["postgis", "pgcrypto", "pg_trgm", "vector"];

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json" | "text">>;

export async function fetchEndpoint(
  fetcher: Fetcher,
  endpoint: string,
): Promise<EndpointEnvelope> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetcher(endpoint, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    let data: unknown = null;
    let parseError: string | null = null;

    try {
      data = await response.json();
    } catch {
      try {
        const text = await response.text();
        parseError = text ? text.slice(0, 160) : "Response was not JSON.";
      } catch {
        parseError = "Response was not readable.";
      }
    }

    const payloadStatus = statusFromRecord(asRecord(data));
    const unavailablePayload = payloadStatus === "unavailable" || payloadStatus === "warning";

    return {
      endpoint,
      status: response.ok
        ? payloadStatus === "unknown"
          ? "ok"
          : payloadStatus
        : response.status === 404 || unavailablePayload
          ? "unavailable"
          : "error",
      httpStatus: response.status,
      checkedAt,
      data,
      error: response.ok ? parseError : parseError ?? `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      endpoint,
      status: "error",
      httpStatus: null,
      checkedAt,
      data: null,
      error: error instanceof Error ? error.message : "Endpoint request failed.",
    };
  }
}

export async function loadProofSnapshot(fetcher: Fetcher = fetch): Promise<ProofSnapshot> {
  const [stateEndpoint, dbProofEndpoint] = await Promise.all([
    fetchEndpoint(fetcher, "/api/system/state"),
    fetchEndpoint(fetcher, "/api/system/db-proof"),
  ]);

  return normalizeProofSnapshot(stateEndpoint, dbProofEndpoint);
}

export function normalizeProofSnapshot(
  stateEndpoint: EndpointEnvelope,
  dbProofEndpoint: EndpointEnvelope,
): ProofSnapshot {
  const state = asRecord(stateEndpoint.data);
  const dbProof = asRecord(dbProofEndpoint.data);
  const checkedAt = newestIso(stateEndpoint.checkedAt, dbProofEndpoint.checkedAt);
  const extensions = normalizeExtensions(dbProof);
  const rowCounts = normalizeRowCounts(state, dbProof);
  const integrations = normalizeIntegrations(stateEndpoint, dbProofEndpoint, state, dbProof, extensions);

  return {
    checkedAt,
    overallStatus: deriveOverallStatus(stateEndpoint, dbProofEndpoint),
    stateEndpoint,
    dbProofEndpoint,
    architecture: normalizeArchitecture(integrations),
    integrations,
    rowCounts,
    extensions,
    auditEvents: normalizeAuditEvents(state),
    jobRuns: normalizeJobRuns(state),
    demoControls: CHECKPOINT_DEMO_CONTROLS,
  };
}

function deriveOverallStatus(
  stateEndpoint: EndpointEnvelope,
  dbProofEndpoint: EndpointEnvelope,
): ProofStatus {
  if (stateEndpoint.status === "ok" && dbProofEndpoint.status === "ok") {
    return "ok";
  }

  if (stateEndpoint.status === "unavailable" || dbProofEndpoint.status === "unavailable") {
    return "unavailable";
  }

  if (stateEndpoint.status === "error" || dbProofEndpoint.status === "error") {
    return "error";
  }

  return "unknown";
}

function normalizeIntegrations(
  stateEndpoint: EndpointEnvelope,
  dbProofEndpoint: EndpointEnvelope,
  state: Record<string, unknown> | null,
  dbProof: Record<string, unknown> | null,
  extensions: ExtensionProof[],
): IntegrationProof[] {
  const sourceIntegrations = [
    ...toArray(getFirst(state, ["integrations", "integrationStatus", "services"])),
    ...toArray(getFirst(dbProof, ["integrations", "integrationStatus", "services"])),
  ];
  const stateIntegrations = asRecord(getFirst(state, ["integrations"]));

  const integrationLookup = new Map<string, Record<string, unknown>>();
  for (const entry of sourceIntegrations) {
    const record = asRecord(entry);
    const key = getString(record, ["key", "name", "service"]);
    if (key && record) {
      integrationLookup.set(slug(key), record);
    }
  }

  const postgis = extensions.find((extension) => extension.name === "postgis");

  return [
    {
      key: "aurora",
      label: "Aurora PostgreSQL",
      status: statusFromRecord(
        integrationLookup.get("aurora_postgresql") ?? integrationLookup.get("aurora") ?? dbProof,
        dbProofEndpoint.status === "ok" ? "ok" : dbProofEndpoint.status,
      ),
      detail:
        getString(dbProof, [
          "database.versionSummary",
          "database.currentDatabase",
          "database.engine",
          "engine",
          "databaseEngine",
        ]) ?? endpointDetail(dbProofEndpoint),
    },
    {
      key: "data-api",
      label: "RDS Data API",
      status: statusFromRecord(
        integrationLookup.get("rds_data_api") ?? integrationLookup.get("data_api") ?? state,
        stateEndpoint.status === "ok" ? "ok" : stateEndpoint.status,
      ),
      detail: getString(state, ["database.dataApi", "dataApi", "rdsDataApi"]) ?? endpointDetail(stateEndpoint),
    },
    {
      key: "postgis",
      label: "PostGIS",
      status: postgis?.status ?? "unknown",
      detail: postgis?.detail ?? "Extension proof not returned yet.",
    },
    {
      key: "s3",
      label: "S3 Storage",
      status: statusFromRecord(
        integrationLookup.get("s3") ?? integrationLookup.get("s3_storage") ?? asRecord(stateIntegrations?.s3),
        getBoolean(asRecord(stateIntegrations?.s3), ["configured"]) === true ? "ok" : "unavailable",
      ),
      detail:
        getString(integrationLookup.get("s3") ?? integrationLookup.get("s3_storage") ?? asRecord(stateIntegrations?.s3), [
          "detail",
          "message",
          "bucket",
        ]) ??
        "Storage status must come from the system endpoint.",
    },
    {
      key: "vercel",
      label: "Vercel Runtime",
      status: statusFromRecord(integrationLookup.get("vercel") ?? integrationLookup.get("vercel_runtime")),
      detail:
        getString(integrationLookup.get("vercel") ?? integrationLookup.get("vercel_runtime"), [
          "detail",
          "message",
          "environment",
        ]) ?? "Runtime/deployment status must come from the system endpoint.",
    },
  ];
}

function normalizeArchitecture(integrations: IntegrationProof[]): ArchitectureNode[] {
  const byKey = new Map(integrations.map((integration) => [integration.key, integration]));

  return [
    {
      label: "Next.js App Router",
      detail: "Home, proof, route handlers, and job triggers on Vercel.",
      status: byKey.get("vercel")?.status ?? "unknown",
    },
    {
      label: "System APIs",
      detail: "/api/system/state and /api/system/db-proof sanitize live database evidence.",
      status: byKey.get("data-api")?.status ?? "unknown",
    },
    {
      label: "Aurora PostgreSQL",
      detail: "Primary state store for households, inventory, pools, jobs, and audits.",
      status: byKey.get("aurora")?.status ?? "unknown",
    },
    {
      label: "PostGIS + Extensions",
      detail: "Location matching support and extension proof for the H0 database requirement.",
      status: byKey.get("postgis")?.status ?? "unknown",
    },
    {
      label: "S3 Assets",
      detail: "Receipt, item, and label file storage when credentials are configured.",
      status: byKey.get("s3")?.status ?? "unknown",
    },
  ];
}

function normalizeRowCounts(
  state: Record<string, unknown> | null,
  dbProof: Record<string, unknown> | null,
): RowCountProof[] {
  const counts = new Map<string, number>();
  collectCounts(counts, getFirst(state, ["counts", "rowCounts", "tables", "tableCounts"]));
  collectCounts(counts, getFirst(dbProof, ["counts", "rowCounts", "tables", "tableCounts"]));

  return CHECKPOINT_TABLES.map((table) => ({
    ...table,
    count: counts.get(table.key) ?? counts.get(slug(table.label)) ?? null,
  }));
}

function collectCounts(counts: Map<string, number>, value: unknown) {
  const record = asRecord(value);
  if (record) {
    for (const [key, rawCount] of Object.entries(record)) {
      const count = toNumber(rawCount);
      if (count !== null) {
        counts.set(slug(key), count);
      }
    }
    return;
  }

  for (const entry of toArray(value)) {
    const row = asRecord(entry);
    if (!row) {
      continue;
    }

    const key = getString(row, ["key", "table", "tableName", "name", "label"]);
    const count = toNumber(getFirst(row, ["count", "rowCount", "rows", "total"]));
    if (key && count !== null) {
      counts.set(slug(key), count);
      for (const alias of ["table", "tableName", "name", "label"]) {
        const aliasKey = getString(row, [alias]);
        if (aliasKey) {
          counts.set(slug(aliasKey), count);
        }
      }
    }
  }
}

function normalizeExtensions(dbProof: Record<string, unknown> | null): ExtensionProof[] {
  const extensionRows = toArray(getFirst(dbProof, [
    "extensions.items",
    "extensions",
    "extensionStatus",
    "database.extensions",
  ]));
  const lookup = new Map<string, Record<string, unknown>>();

  for (const extension of extensionRows) {
    const record = asRecord(extension);
    const name = getString(record, ["name", "extension", "key"]);
    if (record && name) {
      lookup.set(slug(name), record);
    }
  }

  return EXPECTED_EXTENSIONS.map((name) => {
    const record = lookup.get(name);
    const installed = getBoolean(record, ["installed", "enabled", "available"]);
    const status = installed === true ? "ok" : installed === false ? "unavailable" : statusFromRecord(record);

    return {
      name,
      status,
      version: getString(record, ["version", "defaultVersion", "installedVersion"]),
      detail:
        getString(record, ["detail", "message", "comment"]) ??
        (record ? "Extension status returned without detail." : "Extension status not returned yet."),
    };
  });
}

function normalizeAuditEvents(state: Record<string, unknown> | null): TimelineEventProof[] {
  const events = toArray(getFirst(state, [
    "latestAuditEvents.events",
    "latestAuditEvents",
    "auditEvents",
    "audit.latest",
    "audit",
  ]));

  return events.slice(0, 6).map((event, index) => {
    const record = asRecord(event);
    const title =
      getString(record, ["action", "eventType", "type", "name", "title"]) ?? `Audit event ${index + 1}`;

    return {
      id: getString(record, ["id", "auditEventId"]) ?? `audit-${index}`,
      title,
      detail:
        getString(record, ["summary", "detail", "message", "entityType"]) ??
        "Audit row returned by the live state endpoint.",
      occurredAt: getString(record, ["createdAt", "occurredAt", "timestamp"]),
      status: statusFromRecord(record, "ok"),
    };
  });
}

function normalizeJobRuns(state: Record<string, unknown> | null): JobRunProof[] {
  const runs = toArray(getFirst(state, [
    "latestJobRuns.runs",
    "latestJobRuns",
    "jobRuns",
    "jobs.latest",
    "jobs",
  ]));

  return runs.slice(0, 6).map((run, index) => {
    const record = asRecord(run);
    const status = statusFromRecord(record, "unknown");

    return {
      id: getString(record, ["id", "jobRunId"]) ?? `job-${index}`,
      name: getString(record, ["name", "jobName", "jobType", "type"]) ?? `Job run ${index + 1}`,
      status,
      detail:
        getString(record, ["summary", "detail", "message", "error"]) ??
        "Job run returned by the live state endpoint.",
      ranAt: getString(record, ["createdAt", "startedAt", "finishedAt", "ranAt", "timestamp"]),
    };
  });
}

function endpointDetail(endpoint: EndpointEnvelope): string {
  if (endpoint.status === "ok") {
    return `${endpoint.endpoint} returned live data.`;
  }

  if (endpoint.status === "unavailable") {
    return `${endpoint.endpoint} is not installed yet.`;
  }

  return endpoint.error ?? `${endpoint.endpoint} did not return live data.`;
}

function statusFromRecord(
  record: Record<string, unknown> | null | undefined,
  fallback: ProofStatus = "unknown",
): ProofStatus {
  const raw = getString(record ?? null, ["status", "state", "health"]);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if ([
    "ok",
    "ready",
    "connected",
    "available",
    "enabled",
    "success",
    "succeeded",
    "completed",
    "healthy",
    "live",
  ].includes(normalized)) {
    return "ok";
  }

  if (["warning", "degraded", "partial", "resuming"].includes(normalized)) {
    return "warning";
  }

  if (["missing", "unavailable", "not_configured", "disabled", "pending", "not-installed"].includes(normalized)) {
    return "unavailable";
  }

  if (["error", "failed", "failure", "down"].includes(normalized)) {
    return "error";
  }

  return fallback;
}

function newestIso(left: string, right: string): string {
  return new Date(Math.max(Date.parse(left), Date.parse(right))).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getFirst(record: Record<string, unknown> | null | undefined, paths: string[]): unknown {
  if (!record) {
    return undefined;
  }

  for (const path of paths) {
    const value = getPath(record, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    const currentRecord = asRecord(current);
    return currentRecord ? currentRecord[key] : undefined;
  }, record);
}

function getString(record: Record<string, unknown> | null | undefined, paths: string[]): string | null {
  const value = getFirst(record ?? null, paths);
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function getBoolean(record: Record<string, unknown> | null | undefined, paths: string[]): boolean | null {
  const value = getFirst(record ?? null, paths);
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "yes", "enabled", "available", "installed"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "disabled", "unavailable", "missing"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
