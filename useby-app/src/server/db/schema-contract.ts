export const SYSTEM_TABLES = {
  auditEvents: "audit_events",
  jobRuns: "job_runs",
  idempotencyKeys: "idempotency_keys",
} as const;

export const SYSTEM_COUNT_TABLES = [
  {
    key: "households",
    label: "Households",
    table: "households",
  },
  {
    key: "users",
    label: "Users",
    table: "users",
  },
  {
    key: "merchants",
    label: "Merchants",
    table: "merchants",
  },
  {
    key: "itemInstances",
    label: "Item instances",
    table: "item_instances",
  },
  {
    key: "needs",
    label: "Open needs",
    table: "needs",
    where: "status = 'open'",
  },
  {
    key: "matches",
    label: "Active matches",
    table: "matches",
    where: "status in ('active', 'proposed')",
  },
  {
    key: "bookings",
    label: "Active bookings",
    table: "bookings",
    where: "status in ('requested', 'accepted', 'reserved', 'in_progress')",
  },
  {
    key: "demandPools",
    label: "Active demand pools",
    table: "demand_pools",
    where: "status in ('gathering', 'threshold_met', 'bidding', 'awarded')",
  },
  {
    key: "seedBatches",
    label: "Seed batches",
    table: "seed_batches",
  },
  {
    key: "auditEvents",
    label: "Audit events",
    table: SYSTEM_TABLES.auditEvents,
  },
  {
    key: "jobRuns",
    label: "Job runs",
    table: SYSTEM_TABLES.jobRuns,
  },
] as const;

export const ASSUMED_SYSTEM_COLUMNS = {
  auditEvents: [
    "id",
    "actor_user_id",
    "actor_household_id",
    "actor_merchant_id",
    "job_run_id",
    "entity_type",
    "entity_id",
    "action",
    "source",
    "idempotency_key",
    "metadata",
    "created_at",
  ],
  jobRuns: [
    "id",
    "job_type",
    "status",
    "neighbourhood_id",
    "idempotency_key",
    "window_start",
    "window_end",
    "attempt",
    "started_at",
    "finished_at",
    "summary",
    "error_message",
    "demo_scope_id",
    "is_demo",
    "created_at",
  ],
  idempotencyKeys: [
    "id",
    "key",
    "scope",
    "request_hash",
    "status",
    "response_json",
    "locked_at",
    "expires_at",
    "created_at",
    "updated_at",
  ],
} as const;

export function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}
