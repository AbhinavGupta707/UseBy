import {
  loadRuntimeEnv,
  sanitizeRuntimeEnv,
} from "../../server/db/env";
import { cp8UnavailableState, getCp8SystemState } from "./cp8";
import {
  getTableAvailability,
  publicErrorMessage,
} from "../../server/db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_COUNT_TABLES,
  SYSTEM_TABLES,
  quoteIdentifier,
} from "../../server/db/schema-contract";
import { executeSql } from "../../server/db/sql";
import type {
  AvailabilityStatus,
  DbProofResponse,
  ExtensionProof,
  LatestAuditEvent,
  LatestJobRun,
  SystemCount,
  SystemStateResponse,
} from "./types";

type CountContract = (typeof SYSTEM_COUNT_TABLES)[number] | {
  key: string;
  label: string;
  table: string;
  where?: string;
  requiredColumns?: readonly string[];
};

const CHECKPOINT_3_COUNT_TABLES = [
  {
    key: "handoffs",
    label: "Handoffs",
    table: "handoffs",
  },
  {
    key: "safetyAcknowledgements",
    label: "Safety acknowledgements",
    table: "safety_acknowledgements",
  },
  {
    key: "trustEvents",
    label: "Trust events",
    table: "trust_events",
  },
  {
    key: "reviews",
    label: "Reviews",
    table: "reviews",
  },
  {
    key: "reports",
    label: "Reports",
    table: "reports",
  },
  {
    key: "blocks",
    label: "Blocks",
    table: "blocks",
  },
] satisfies CountContract[];

const CHECKPOINT_4_COUNT_TABLES = [
  {
    key: "cp4ListedLendingItems",
    label: "CP4 listed fashion/household items",
    table: "item_instances",
    where: "category in ('fashion', 'household') and item_state = 'listed'",
    requiredColumns: ["category", "item_state"],
  },
  {
    key: "cp4OpenLendingNeeds",
    label: "CP4 open fashion/household needs",
    table: "needs",
    where: "category in ('fashion', 'household') and status = 'open'",
    requiredColumns: ["category", "status"],
  },
  {
    key: "cp4ActiveLendingBookings",
    label: "CP4 active lending bookings",
    table: "bookings",
    where:
      "status in ('requested', 'accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned') and item_instance_id in (select id from item_instances where category in ('fashion', 'household'))",
    requiredColumns: ["status", "item_instance_id"],
  },
  {
    key: "cp4LendingHandoffs",
    label: "CP4 lending handoffs",
    table: "handoffs",
    where:
      "booking_id in (select b.id from bookings b join item_instances i on i.id = b.item_instance_id where i.category in ('fashion', 'household'))",
    requiredColumns: ["booking_id"],
  },
  {
    key: "cp4LendingTrustEvents",
    label: "CP4 lending trust events",
    table: "trust_events",
    where:
      "booking_id in (select b.id from bookings b join item_instances i on i.id = b.item_instance_id where i.category in ('fashion', 'household'))",
    requiredColumns: ["booking_id"],
  },
  {
    key: "cp4LendingReviews",
    label: "CP4 lending reviews",
    table: "reviews",
    where:
      "booking_id in (select b.id from bookings b join item_instances i on i.id = b.item_instance_id where i.category in ('fashion', 'household'))",
    requiredColumns: ["booking_id"],
  },
  {
    key: "cp4LendingAvailabilityWindows",
    label: "CP4 lending availability windows",
    table: "lending_availability_windows",
  },
  {
    key: "cp4LendingReservations",
    label: "CP4 lending reservations",
    table: "lending_reservations",
  },
  {
    key: "cp4LendingConditionEvents",
    label: "CP4 lending condition events",
    table: "lending_condition_events",
  },
] satisfies CountContract[];

const CHECKPOINT_6_COUNT_TABLES = [
  {
    key: "cp6ActiveDemandPools",
    label: "CP6 active demand pools",
    table: "demand_pools",
    where: "status in ('gathering', 'threshold_met', 'bidding')",
    requiredColumns: ["status"],
  },
  {
    key: "cp6LiveCommitments",
    label: "CP6 live commitments",
    table: "demand_pool_commitments",
    where: "status = 'active'",
    requiredColumns: ["status"],
  },
  {
    key: "cp6MerchantBids",
    label: "CP6 merchant bids",
    table: "merchant_bids",
  },
  {
    key: "cp6AwardedPools",
    label: "CP6 awarded pools",
    table: "demand_pools",
    where: "status in ('awarded', 'ready_for_pickup', 'fulfilled') or awarded_bid_id is not null",
    requiredColumns: ["status", "awarded_bid_id"],
  },
  {
    key: "cp6PoolOrders",
    label: "CP6 pool orders",
    table: "pool_orders",
  },
  {
    key: "cp6PickupTasks",
    label: "CP6 pickup tasks",
    table: "pickup_tasks",
  },
  {
    key: "cp6ClosePoolJobRuns",
    label: "CP6 close-pool job runs",
    table: "job_runs",
    where: "job_type = 'close-demand-pools'",
    requiredColumns: ["job_type"],
  },
  {
    key: "cp6AuditEvents",
    label: "CP6 audit events",
    table: "audit_events",
    where:
      "entity_type in ('demand_pool', 'demand_pool_commitment', 'merchant_bid', 'pool_order', 'pickup_task') or action like 'demand_pool.%' or action like 'merchant_bid.%' or action like 'pool_order.%' or action like 'pickup.%'",
    requiredColumns: ["entity_type", "action"],
  },
] satisfies CountContract[];

const CHECKPOINT_7_COUNT_TABLES = [
  {
    key: "cp7PublishedDrops",
    label: "CP7 published surplus drops",
    table: "store_drops",
    where: "status = 'published'",
    requiredColumns: ["status"],
  },
  {
    key: "cp7ActiveDropReservations",
    label: "CP7 active drop reservations",
    table: "store_drop_reservations",
    where: "status = 'active'",
    requiredColumns: ["status"],
  },
  {
    key: "cp7ClosedOrSoldOutDrops",
    label: "CP7 closed or sold-out drops",
    table: "store_drops",
    where:
      "status in ('closed', 'expired') or (status = 'published' and quantity_total <= coalesce((select sum(r.quantity) from store_drop_reservations r where r.store_drop_id = store_drops.id and r.status = 'active'), 0))",
    requiredColumns: ["id", "status", "quantity_total"],
  },
  {
    key: "cp7HeatmapCells",
    label: "CP7 heatmap source needs",
    table: "needs",
    where: "status = 'open' and location is not null",
    requiredColumns: ["status", "location"],
  },
  {
    key: "cp7ExpireDropJobRuns",
    label: "CP7 expire-drop job runs",
    table: "job_runs",
    where: "job_type = 'expire-store-drops'",
    requiredColumns: ["job_type"],
  },
  {
    key: "cp7AuditEvents",
    label: "CP7 audit events",
    table: "audit_events",
    where:
      "entity_type in ('store_drop', 'store_drop_reservation') or action like 'store_drop.%' or action like 'store_drop_reservation.%' or action like 'merchant_heatmap.%'",
    requiredColumns: ["entity_type", "action"],
  },
] satisfies CountContract[];

const CHECKPOINT_8_COUNT_TABLES = [
  {
    key: "cp8PrivateFiles",
    label: "CP8 private file rows",
    table: "files",
    where: "deleted_at is null",
    requiredColumns: ["deleted_at", "bucket", "object_key", "role"],
  },
  {
    key: "cp8NotificationRows",
    label: "CP8 notification rows",
    table: "notifications",
  },
  {
    key: "cp8PickupReminderJobs",
    label: "CP8 pickup reminder jobs",
    table: "job_runs",
    where: "job_type = 'pickup-reminders'",
    requiredColumns: ["job_type"],
  },
  {
    key: "cp8AiAuditEvents",
    label: "CP8 AI guardrail audit events",
    table: "audit_events",
    where:
      "action like 'ai.%' or metadata->>'aiGuardrail' = 'copy_only' or metadata->>'engine' = 'semantic-ranking'",
    requiredColumns: ["action", "metadata"],
  },
] satisfies CountContract[];

const SYSTEM_STATE_COUNT_TABLES: CountContract[] = [
  ...SYSTEM_COUNT_TABLES.map((contract) =>
    contract.key === "bookings"
      ? {
          ...contract,
          where:
            "status in ('requested', 'accepted', 'reserved', 'pickup_scheduled', 'picked_up')",
        }
      : contract,
  ),
  ...CHECKPOINT_3_COUNT_TABLES,
  ...CHECKPOINT_4_COUNT_TABLES,
  ...CHECKPOINT_6_COUNT_TABLES,
  ...CHECKPOINT_7_COUNT_TABLES,
  ...CHECKPOINT_8_COUNT_TABLES,
];

function safeJson(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function unavailableCounts(reason: string): SystemCount[] {
  return SYSTEM_STATE_COUNT_TABLES.map((contract) => ({
    key: contract.key,
    label: contract.label,
    table: contract.table,
    available: false,
    count: null,
    reason,
  }));
}

async function getCounts(): Promise<SystemCount[]> {
  const counts: SystemCount[] = [];

  for (const contract of SYSTEM_STATE_COUNT_TABLES) {
    try {
      const availability = await getTableAvailability(contract.table);
      if (!availability.exists) {
        counts.push({
          key: contract.key,
          label: contract.label,
          table: contract.table,
          available: false,
          count: null,
          reason: "table is not available",
        });
        continue;
      }

      const requiredColumns =
        "requiredColumns" in contract
          ? contract.requiredColumns ?? []
          : "where" in contract
            ? (["status"] as const)
            : [];
      const missingColumns = requiredColumns.filter(
        (column) => !availability.columns.has(column),
      );

      if (missingColumns.length > 0) {
        counts.push({
          key: contract.key,
          label: contract.label,
          table: contract.table,
          available: false,
          count: null,
          reason: `${missingColumns.join(", ")} column${missingColumns.length === 1 ? " is" : "s are"} required for filtered count`,
        });
        continue;
      }

      const table = quoteIdentifier(contract.table);
      const result = await executeSql<{ count: number }>({
        sql: `select count(*)::int8 as count from ${table} ${
          "where" in contract ? `where ${contract.where}` : ""
        }`,
      });

      counts.push({
        key: contract.key,
        label: contract.label,
        table: contract.table,
        available: true,
        count: Number(result.rows[0]?.count ?? 0),
      });
    } catch (error) {
      counts.push({
        key: contract.key,
        label: contract.label,
        table: contract.table,
        available: false,
        count: null,
        reason: publicErrorMessage(error),
      });
    }
  }

  return counts;
}

async function getLatestAuditEvents(): Promise<
  SystemStateResponse["latestAuditEvents"]
> {
  const availability = await getTableAvailability(SYSTEM_TABLES.auditEvents);
  const missing = ASSUMED_SYSTEM_COLUMNS.auditEvents.filter(
    (column) => !availability.columns.has(column),
  );

  if (!availability.exists || missing.length > 0) {
    return {
      available: false,
      events: [],
      reason: availability.exists
        ? `audit_events missing columns: ${missing.join(", ")}`
        : "audit_events table is not available",
    };
  }

  const result = await executeSql<{
    id: string | null;
    event_type: string;
    actor_type: string | null;
    source: string | null;
    entity_type: string | null;
    entity_id: string | null;
    idempotency_key: string | null;
    created_at: string | null;
    metadata: string | null;
  }>({
    sql: `
      select
        id::text as id,
        action as event_type,
        coalesce(
          metadata->>'actorType',
          case
            when actor_user_id is not null then 'user'
            when actor_household_id is not null then 'household'
            when actor_merchant_id is not null then 'merchant'
            when job_run_id is not null then 'job'
            else 'system'
          end
        ) as actor_type,
        source,
        entity_type,
        entity_id::text as entity_id,
        idempotency_key,
        created_at::text as created_at,
        metadata::text as metadata
      from audit_events
      order by created_at desc
      limit 8
    `,
  });

  return {
    available: true,
    events: result.rows.map<LatestAuditEvent>((row) => ({
      id: row.id,
      eventType: row.event_type,
      actorType: row.actor_type,
      source: row.source,
      entityType: row.entity_type,
      entityId: row.entity_id,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      metadata: safeJson(row.metadata),
    })),
  };
}

async function getLatestJobRuns(): Promise<SystemStateResponse["latestJobRuns"]> {
  const availability = await getTableAvailability(SYSTEM_TABLES.jobRuns);
  const missing = ASSUMED_SYSTEM_COLUMNS.jobRuns.filter(
    (column) => !availability.columns.has(column),
  );

  if (!availability.exists || missing.length > 0) {
    return {
      available: false,
      runs: [],
      reason: availability.exists
        ? `job_runs missing columns: ${missing.join(", ")}`
        : "job_runs table is not available",
    };
  }

  const result = await executeSql<{
    id: string | null;
    job_type: string;
    status: string;
    source: string | null;
    idempotency_key: string | null;
    started_at: string | null;
    completed_at: string | null;
    metadata: string | null;
  }>({
    sql: `
      select
        id::text as id,
        job_type,
        status,
        summary->>'source' as source,
        idempotency_key,
        started_at::text as started_at,
        finished_at::text as completed_at,
        summary::text as metadata
      from job_runs
      order by started_at desc
      limit 8
    `,
  });

  return {
    available: true,
    runs: result.rows.map<LatestJobRun>((row) => ({
      id: row.id,
      jobType: row.job_type,
      status: row.status,
      source: row.source,
      idempotencyKey: row.idempotency_key,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      metadata: safeJson(row.metadata),
    })),
  };
}

function computeStatus(parts: boolean[]): AvailabilityStatus {
  if (parts.every(Boolean)) {
    return "available";
  }

  return parts.some(Boolean) ? "partial" : "unavailable";
}

export async function getSystemState(): Promise<SystemStateResponse> {
  const env = loadRuntimeEnv();
  const sanitizedEnv = sanitizeRuntimeEnv(env);
  const generatedAt = new Date().toISOString();
  const cp8 = await getCp8SystemState({
    env: process.env,
    databaseConfigured: env.databaseConfigured,
  });

  if (!env.databaseConfigured) {
    const reason = `Aurora env missing: ${env.missing.join(", ")}`;
    return {
      status: "unavailable",
      generatedAt,
      env: sanitizedEnv,
      integrations: {
        aurora: {
          configured: false,
          available: false,
          missingEnv: env.missing,
          region: sanitizedEnv.region,
          database: sanitizedEnv.database,
          error: reason,
        },
        s3: {
          configured: env.storageConfigured,
          bucket: sanitizedEnv.bucket,
        },
      },
      counts: unavailableCounts(reason),
      latestAuditEvents: {
        available: false,
        events: [],
        reason,
      },
      latestJobRuns: {
        available: false,
        runs: [],
        reason,
      },
      cp8,
    };
  }

  try {
    const [counts, latestAuditEvents, latestJobRuns] = await Promise.all([
      getCounts(),
      getLatestAuditEvents(),
      getLatestJobRuns(),
    ]);
    const countAvailable = counts.some((count) => count.available);
    const status = computeStatus([
      countAvailable,
      latestAuditEvents.available,
      latestJobRuns.available,
    ]);

    return {
      status,
      generatedAt,
      env: sanitizedEnv,
      integrations: {
        aurora: {
          configured: true,
          available: status !== "unavailable",
          missingEnv: [],
          region: sanitizedEnv.region,
          database: sanitizedEnv.database,
        },
        s3: {
          configured: env.storageConfigured,
          bucket: sanitizedEnv.bucket,
        },
      },
      counts,
      latestAuditEvents,
      latestJobRuns,
      cp8,
    };
  } catch (error) {
    const reason = publicErrorMessage(error);
    return {
      status: "unavailable",
      generatedAt,
      env: sanitizedEnv,
      integrations: {
        aurora: {
          configured: true,
          available: false,
          missingEnv: [],
          region: sanitizedEnv.region,
          database: sanitizedEnv.database,
          error: reason,
        },
        s3: {
          configured: env.storageConfigured,
          bucket: sanitizedEnv.bucket,
        },
      },
      counts: unavailableCounts(reason),
      latestAuditEvents: {
        available: false,
        events: [],
        reason,
      },
      latestJobRuns: {
        available: false,
        runs: [],
        reason,
      },
      cp8: cp8UnavailableState(reason),
    };
  }
}

function summarizeVersion(version: unknown): string | null {
  if (typeof version !== "string") {
    return null;
  }

  const match = version.match(/^PostgreSQL\s+\S+/);
  return match?.[0] ?? "PostgreSQL";
}

const PROOF_EXTENSION_NAMES = [
  "postgis",
  "vector",
  "pgcrypto",
  "pg_trgm",
] as const;

export async function getDbProof(): Promise<DbProofResponse> {
  const env = loadRuntimeEnv();
  const sanitizedEnv = sanitizeRuntimeEnv(env);
  const generatedAt = new Date().toISOString();

  const unavailable: DbProofResponse = {
    status: "unavailable",
    generatedAt,
    env: sanitizedEnv,
    database: {
      available: false,
      currentDatabase: null,
      currentSchema: null,
      versionSummary: null,
      error: `Aurora env missing: ${env.missing.join(", ")}`,
    },
    extensions: {
      available: false,
      items: PROOF_EXTENSION_NAMES.map((name) => ({
        name,
        available: false,
        installed: false,
        defaultVersion: null,
        installedVersion: null,
      })),
      error: `Aurora env missing: ${env.missing.join(", ")}`,
    },
  };

  if (!env.databaseConfigured) {
    return unavailable;
  }

  try {
    const [metadata, extensions] = await Promise.all([
      executeSql<{
        current_database: string | null;
        current_schema: string | null;
        version: string | null;
      }>({
        sql: `
          select
            current_database() as current_database,
            current_schema() as current_schema,
            version() as version
        `,
      }),
      executeSql<{
        name: ExtensionProof["name"];
        default_version: string | null;
        installed_version: string | null;
      }>({
        sql: `
          select
            available.name,
            available.default_version,
            installed.extversion as installed_version
          from pg_available_extensions available
          left join pg_extension installed on installed.extname = available.name
          where available.name in ('postgis', 'vector', 'pgcrypto', 'pg_trgm')
        `,
      }),
    ]);

    const extensionRows = new Map(
      extensions.rows.map((row) => [row.name, row] as const),
    );
    const items: ExtensionProof[] = PROOF_EXTENSION_NAMES.map((name) => {
      const row = extensionRows.get(name);
      return {
        name,
        available: Boolean(row),
        installed: Boolean(row?.installed_version),
        defaultVersion: row?.default_version ?? null,
        installedVersion: row?.installed_version ?? null,
      };
    });
    const row = metadata.rows[0];

    return {
      status: "available",
      generatedAt,
      env: sanitizedEnv,
      database: {
        available: true,
        currentDatabase: row?.current_database ?? null,
        currentSchema: row?.current_schema ?? null,
        versionSummary: summarizeVersion(row?.version),
      },
      extensions: {
        available: true,
        items,
      },
    };
  } catch (error) {
    const reason = publicErrorMessage(error);
    return {
      status: "unavailable",
      generatedAt,
      env: sanitizedEnv,
      database: {
        available: false,
        currentDatabase: null,
        currentSchema: null,
        versionSummary: null,
        error: reason,
      },
      extensions: {
        available: false,
        items: unavailable.extensions.items,
        error: reason,
      },
    };
  }
}
