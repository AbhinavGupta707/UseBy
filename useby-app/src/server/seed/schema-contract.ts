import { DEMO_SCOPE } from "../fixtures/demo-world";

export const DEMO_SCHEMA_CONTRACT_VERSION = "checkpoint-1-live-v1";

export const DEMO_SCOPE_FILTER = {
  column: "demo_scope_id",
  value: DEMO_SCOPE,
  fallbackJsonPath: "metadata.demoScope",
} as const;

export const DEMO_RESET_DELETE_ORDER = [
  "pickup_tasks",
  "pool_orders",
  "store_drop_reservations",
  "handoffs",
  "bookings",
  "condition_events",
  "rental_windows",
  "lending_requests",
  "lending_holds",
  "matches",
  "action_cards",
  "merchant_bids",
  "demand_pool_commitments",
  "demand_pools",
  "store_drops",
  "expiry_observations",
  "receipt_line_items",
  "receipt_imports",
  "inventory_events",
  "item_instances",
  "needs",
  "merchant_locations",
  "merchant_users",
  "merchants",
  "household_members",
  "households",
  "item_catalog",
  "audit_events",
  "seed_batches",
  "neighbourhoods",
] as const;

export const DEMO_SEED_INSERT_ORDER = [
  "neighbourhoods",
  "households",
  "household_members",
  "merchants",
  "merchant_locations",
  "item_catalog",
  "receipt_imports",
  "receipt_line_items",
  "item_instances",
  "expiry_observations",
  "needs",
  "demand_pools",
  "demand_pool_commitments",
  "merchant_bids",
  "store_drops",
  "seed_batches",
  "audit_events",
] as const;

export const FINAL_OUTPUT_TABLES_NOT_SEEDED = [
  "action_cards",
  "matches",
  "bookings",
  "handoffs",
  "inventory_events",
  "condition_events",
  "rental_windows",
  "lending_requests",
  "lending_holds",
  "pool_orders",
  "pickup_tasks",
  "store_drop_reservations",
  "trust_events",
  "reviews",
  "job_runs",
] as const;

export const DEMO_SCHEMA_ASSUMPTIONS = [
  "Every demo-owned row either has a demo_scope_id column or metadata JSON containing metadata.demoScope.",
  "Stable fixture demoId values map to canonical IDs or external IDs during insertion.",
  "Lane 1C will provide an RDS Data API executor that deletes by demo scope in dependency order.",
  "Seed inserts must write seed_batches and an audit_events mutation row after input rows are inserted.",
  "Reset may delete derived demo outputs, but seed must not insert action cards, matches, bookings, pool winners, trust changes, or job outputs.",
] as const;
