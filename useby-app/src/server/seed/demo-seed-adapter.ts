import {
  createHash,
  randomUUID,
} from "node:crypto";

import { publicErrorMessage } from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import {
  DEMO_SCOPE,
  RIVERSIDE_QUARTER_DEMO_WORLD,
  type DemoWorldFixture,
  summarizeDemoWorld,
} from "../fixtures/demo-world";
import {
  DEMO_RESET_DELETE_ORDER,
  DEMO_SCHEMA_ASSUMPTIONS,
  DEMO_SCHEMA_CONTRACT_VERSION,
  DEMO_SCOPE_FILTER,
  DEMO_SEED_INSERT_ORDER,
  FINAL_OUTPUT_TABLES_NOT_SEEDED,
} from "./schema-contract";

export type DemoSeedOperation = "seed" | "reset";
export type DemoSeedStatus = "applied" | "dry_run" | "unavailable";

export interface DemoSeedExecutionContext {
  operation: DemoSeedOperation;
  requestedAt: string;
  requestedBy: "demo_route" | "test" | "integration";
  idempotencyKey: string;
}

export interface DemoSeedPlan {
  operation: DemoSeedOperation;
  schemaContractVersion: typeof DEMO_SCHEMA_CONTRACT_VERSION;
  demoScopeFilter: typeof DEMO_SCOPE_FILTER;
  deleteOrder: readonly string[];
  insertOrder: typeof DEMO_SEED_INSERT_ORDER;
  finalOutputTablesNotSeeded: typeof FINAL_OUTPUT_TABLES_NOT_SEEDED;
  assumptions: typeof DEMO_SCHEMA_ASSUMPTIONS;
}

export interface DemoSeedMutationResult {
  status: DemoSeedStatus;
  applied: boolean;
  message: string;
  seedBatchId: string;
  mutationTimestamp: string;
  idempotencyKey: string;
  summary: ReturnType<typeof summarizeDemoWorld>;
  plan: DemoSeedPlan;
  integrationRequired?: string[];
}

export interface DemoSeedAdapter {
  readonly name: string;
  readonly live: boolean;
  seed(world: DemoWorldFixture, context: DemoSeedExecutionContext): Promise<DemoSeedMutationResult>;
  reset(world: DemoWorldFixture, context: DemoSeedExecutionContext): Promise<DemoSeedMutationResult>;
}

type IdMap = Map<string, string>;

const pointSql = "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography";

export function buildDemoSeedPlan(operation: DemoSeedOperation): DemoSeedPlan {
  return {
    operation,
    schemaContractVersion: DEMO_SCHEMA_CONTRACT_VERSION,
    demoScopeFilter: DEMO_SCOPE_FILTER,
    deleteOrder: DEMO_RESET_DELETE_ORDER,
    insertOrder: DEMO_SEED_INSERT_ORDER,
    finalOutputTablesNotSeeded: FINAL_OUTPUT_TABLES_NOT_SEEDED,
    assumptions: DEMO_SCHEMA_ASSUMPTIONS,
  };
}

export function buildDemoSeedContext(
  operation: DemoSeedOperation,
  requestedAt = new Date().toISOString(),
): DemoSeedExecutionContext {
  return {
    operation,
    requestedAt,
    requestedBy: "demo_route",
    idempotencyKey: `${DEMO_SCOPE}:${operation}:${RIVERSIDE_QUARTER_DEMO_WORLD.metadata.seedVersion}`,
  };
}

export function demoUuidFor(demoId: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`useby:${DEMO_SCOPE}:${demoId}`).digest("hex"),
    "hex",
  ).subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function seedFingerprint(world: DemoWorldFixture): string {
  return createHash("sha256")
    .update(JSON.stringify(summarizeDemoWorld(world)))
    .digest("hex");
}

function rowMetadata(
  demoId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    demoId,
    demoScope: DEMO_SCOPE,
    checkpoint: 1,
    ...extra,
  };
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function resolveDemoStoreDropPickupWindow(
  pickupWindow: string,
  requestedAt: string,
  order = 0,
): [string, string] {
  const [rawStart, rawEnd] = pickupWindow.split("/");
  const originalStart = Date.parse(rawStart ?? "");
  const originalEnd = Date.parse(rawEnd ?? "");
  const requestedTime = Date.parse(requestedAt);

  if (
    Number.isNaN(originalStart) ||
    Number.isNaN(originalEnd) ||
    Number.isNaN(requestedTime) ||
    originalEnd <= originalStart
  ) {
    return [rawStart ?? "", rawEnd ?? ""];
  }

  const duration = Math.max(FIFTEEN_MINUTES_MS * 2, originalEnd - originalStart);
  const roundedRequest = Math.ceil(requestedTime / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS;
  const rollingStart = new Date(roundedRequest + ONE_HOUR_MS + order * 45 * 60 * 1000);
  const rollingEnd = new Date(rollingStart.getTime() + duration);

  return [rollingStart.toISOString(), rollingEnd.toISOString()];
}

function tableIds(world: DemoWorldFixture): IdMap {
  return new Map<string, string>([
    [world.neighbourhood.demoId, demoUuidFor(world.neighbourhood.demoId)],
    ...world.households.flatMap((household) => [
      [household.demoId, demoUuidFor(household.demoId)] as const,
      [`user:${household.demoId}`, demoUuidFor(`user:${household.demoId}`)] as const,
    ]),
    ...world.merchants.flatMap((merchant) => [
      [merchant.demoId, demoUuidFor(merchant.demoId)] as const,
      [`location:${merchant.demoId}`, demoUuidFor(`location:${merchant.demoId}`)] as const,
    ]),
    ...world.catalogItems.map((item) => [item.demoId, demoUuidFor(item.demoId)] as const),
    ...world.itemInstances.map((item) => [item.demoId, demoUuidFor(item.demoId)] as const),
    ...world.needs.map((need) => [need.demoId, demoUuidFor(need.demoId)] as const),
    ...world.demandPools.map((pool) => [pool.demoId, demoUuidFor(pool.demoId)] as const),
    ...world.demandPoolCommitments.map((commitment) => [
      commitment.demoId,
      demoUuidFor(commitment.demoId),
    ] as const),
    ...world.merchantBids.map((bid) => [bid.demoId, demoUuidFor(bid.demoId)] as const),
    ...world.storeDrops.map((drop) => [drop.demoId, demoUuidFor(drop.demoId)] as const),
    [world.metadata.seedBatchId, demoUuidFor(world.metadata.seedBatchId)],
  ]);
}

function mustGet(ids: IdMap, demoId: string): string {
  const id = ids.get(demoId);
  if (!id) {
    throw new Error(`Missing deterministic seed id for ${demoId}`);
  }

  return id;
}

async function execTx(
  context: TransactionContext,
  sql: string,
  parameters: Array<ReturnType<typeof sqlParam>> = [],
) {
  return executeSql({
    sql,
    parameters,
    transactionId: context.transactionId,
    config: context.config,
    client: context.client,
  });
}

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function householdUserEmail(householdDemoId: string): string {
  return `${householdDemoId.replaceAll("_", "-")}@demo.useby.local`;
}

async function resetDemoRows(context: TransactionContext) {
  const scoped = params({ demoScope: DEMO_SCOPE });
  const statements = [
    "delete from pickup_tasks where demo_scope_id = :demoScope or demand_pool_id in (select id from demand_pools where demo_scope_id = :demoScope) or household_id in (select id from households where demo_scope_id = :demoScope) or pool_order_id in (select id from pool_orders where demo_scope_id = :demoScope)",
    "delete from pool_orders where demo_scope_id = :demoScope or demand_pool_id in (select id from demand_pools where demo_scope_id = :demoScope) or household_id in (select id from households where demo_scope_id = :demoScope) or commitment_id in (select id from demand_pool_commitments where demo_scope_id = :demoScope)",
    "delete from notifications where demo_scope_id = :demoScope or recipient_household_id in (select id from households where demo_scope_id = :demoScope) or recipient_user_id in (select id from users where demo_scope_id = :demoScope) or recipient_merchant_id in (select id from merchants where demo_scope_id = :demoScope)",
    "delete from file_intakes where demo_scope_id = :demoScope or owner_household_id in (select id from households where demo_scope_id = :demoScope) or file_id in (select id from files where demo_scope_id = :demoScope)",
    "delete from store_drop_reservations where demo_scope_id = :demoScope or store_drop_id in (select id from store_drops where demo_scope_id = :demoScope) or household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from lending_condition_events where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or booking_id in (select id from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope) or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope)",
    "delete from lending_reservations where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or booking_id in (select id from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope) or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from lending_availability_windows where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from handoffs where demo_scope_id = :demoScope or booking_id in (select id from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope))",
    "delete from reviews where demo_scope_id = :demoScope or booking_id in (select id from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)) or reviewer_household_id in (select id from households where demo_scope_id = :demoScope) or reviewee_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from trust_events where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or booking_id in (select id from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)) or household_id in (select id from households where demo_scope_id = :demoScope) or actor_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from safety_acknowledgements where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or household_id in (select id from households where demo_scope_id = :demoScope) or actor_user_id in (select id from users where demo_scope_id = :demoScope) or neighbourhood_id in (select id from neighbourhoods where demo_scope_id = :demoScope)",
    "delete from bookings where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or match_id in (select id from matches where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope) or need_id in (select id from needs where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from action_cards where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or household_id in (select id from households where demo_scope_id = :demoScope) or neighbourhood_id in (select id from neighbourhoods where demo_scope_id = :demoScope) or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or need_id in (select id from needs where demo_scope_id = :demoScope) or match_id in (select id from matches where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope)",
    "delete from matches where demo_scope_id = :demoScope or metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope) or need_id in (select id from needs where demo_scope_id = :demoScope) or requester_household_id in (select id from households where demo_scope_id = :demoScope) or owner_household_id in (select id from households where demo_scope_id = :demoScope)",
    "delete from inventory_events where metadata->>'demoScope' = :demoScope or item_instance_id in (select id from item_instances where demo_scope_id = :demoScope)",
    "delete from demand_pool_commitments where demo_scope_id = :demoScope or demand_pool_id in (select id from demand_pools where demo_scope_id = :demoScope)",
    "delete from merchant_bids where demo_scope_id = :demoScope or demand_pool_id in (select id from demand_pools where demo_scope_id = :demoScope)",
    "delete from store_drops where demo_scope_id = :demoScope or merchant_id in (select id from merchants where demo_scope_id = :demoScope)",
    "delete from item_instances where demo_scope_id = :demoScope",
    "delete from needs where demo_scope_id = :demoScope",
    "delete from demand_pools where demo_scope_id = :demoScope",
    "delete from merchant_users where merchant_id in (select id from merchants where demo_scope_id = :demoScope)",
    "delete from merchant_locations where demo_scope_id = :demoScope",
    "delete from merchants where demo_scope_id = :demoScope",
    "delete from household_members where household_id in (select id from households where demo_scope_id = :demoScope) or user_id in (select id from users where demo_scope_id = :demoScope)",
    "delete from households where demo_scope_id = :demoScope",
    "delete from users where demo_scope_id = :demoScope",
    "delete from item_catalog where demo_scope_id = :demoScope",
    "delete from files where demo_scope_id = :demoScope",
    "delete from audit_events where demo_scope_id = :demoScope",
    "delete from job_runs where demo_scope_id = :demoScope",
    "delete from seed_batches where demo_scope_id = :demoScope",
    "delete from neighbourhoods where demo_scope_id = :demoScope",
  ];

  for (const statement of statements) {
    await execTx(context, statement, scoped);
  }
}

async function insertNeighbourhood(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
) {
  await execTx(
    context,
    `
      insert into neighbourhoods (
        id, slug, name, city, country_code, timezone, center_location,
        service_radius_meters, demo_scope_id, is_demo
      )
      values (
        :id::uuid, :slug, :name, 'London', 'GB', 'Europe/London',
        ${pointSql}, :radiusMeters, :demoScope, true
      )
    `,
    params({
      id: mustGet(ids, world.neighbourhood.demoId),
      slug: world.neighbourhood.slug,
      name: world.neighbourhood.name,
      lng: world.neighbourhood.center.lng,
      lat: world.neighbourhood.center.lat,
      radiusMeters: world.neighbourhood.radiusMeters,
      demoScope: DEMO_SCOPE,
    }),
  );
}

async function insertHouseholds(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const household of world.households) {
    const householdId = mustGet(ids, household.demoId);
    const userId = mustGet(ids, `user:${household.demoId}`);

    await execTx(
      context,
      `
        insert into users (
          id, email, display_name, auth_subject, demo_scope_id, is_demo
        )
        values (:id::uuid, :email, :displayName, :authSubject, :demoScope, true)
      `,
      params({
        id: userId,
        email: householdUserEmail(household.demoId),
        displayName: `${household.displayName} lead`,
        authSubject: `demo:${household.demoId}`,
        demoScope: DEMO_SCOPE,
      }),
    );

    await execTx(
      context,
      `
        insert into households (
          id, neighbourhood_id, display_name, public_label, home_location,
          coarse_location_label, trust_score, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :neighbourhoodId::uuid, :displayName, :publicLabel,
          ${pointSql}, :coarseLocationLabel, 0, :demoScope, true
        )
      `,
      params({
        id: householdId,
        neighbourhoodId,
        displayName: household.displayName,
        publicLabel: `${household.building} ${household.unitLabel}`,
        lng: household.location.lng,
        lat: household.location.lat,
        coarseLocationLabel: household.building,
        demoScope: DEMO_SCOPE,
      }),
    );

    await execTx(
      context,
      `
        insert into household_members (
          id, household_id, user_id, role, status
        )
        values (:id::uuid, :householdId::uuid, :userId::uuid, 'owner', 'active')
      `,
      params({
        id: randomUUID(),
        householdId,
        userId,
      }),
    );
  }
}

async function insertMerchants(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const merchant of world.merchants) {
    const merchantId = mustGet(ids, merchant.demoId);
    const locationId = mustGet(ids, `location:${merchant.demoId}`);

    await execTx(
      context,
      `
        insert into merchants (
          id, slug, name, category, demo_scope_id, is_demo
        )
        values (:id::uuid, :slug, :name, :category, :demoScope, true)
      `,
      params({
        id: merchantId,
        slug: merchant.demoId.replace("merchant-", ""),
        name: merchant.displayName,
        category: merchant.merchantType,
        demoScope: DEMO_SCOPE,
      }),
    );

    await execTx(
      context,
      `
        insert into merchant_locations (
          id, merchant_id, neighbourhood_id, name, public_address, location,
          pickup_notes, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :merchantId::uuid, :neighbourhoodId::uuid, :name,
          :publicAddress, ${pointSql}, :pickupNotes, :demoScope, true
        )
      `,
      params({
        id: locationId,
        merchantId,
        neighbourhoodId,
        name: merchant.locationName,
        publicAddress: merchant.locationName,
        lng: merchant.location.lng,
        lat: merchant.location.lat,
        pickupNotes: merchant.pickupWindow,
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertCatalog(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
) {
  for (const item of world.catalogItems) {
    await execTx(
      context,
      `
        insert into item_catalog (
          id, category, name, default_storage_state, default_safety_status,
          metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :category::item_category, :name,
          :defaultStorageState::storage_state,
          :defaultSafetyStatus::safety_status,
          :metadata::jsonb, :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, item.demoId),
        category: item.category,
        name: item.name,
        defaultStorageState: item.category === "grocery" ? "cupboard" : "sealed",
        defaultSafetyStatus: item.safetyShareableWhenSealed ? "eligible" : "unknown",
        metadata: rowMetadata(item.demoId, {
          unit: item.unit,
          tags: item.tags,
          baselineShelfLifeDays: item.baselineShelfLifeDays ?? null,
          safetyShareableWhenSealed: item.safetyShareableWhenSealed ?? null,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertItems(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
  seedContext: DemoSeedExecutionContext,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const item of world.itemInstances) {
    const household = world.households.find((candidate) => candidate.demoId === item.householdId);
    if (!household) {
      throw new Error(`Missing household for item ${item.demoId}`);
    }

    await execTx(
      context,
      `
        insert into item_instances (
          id, catalog_item_id, owner_household_id, neighbourhood_id, category,
          title, quantity, unit, item_state, storage_state, safety_status,
          use_by_date, best_before_date, location, source_type, source_ref,
          metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :catalogItemId::uuid, :householdId::uuid,
          :neighbourhoodId::uuid, :category::item_category, :title,
          :quantity, :unit, :itemState::item_state,
          :storageState::storage_state, :safetyStatus::safety_status,
          nullif(:useByDate, '')::date, nullif(:bestBeforeDate, '')::date,
          ${pointSql}, 'demo_seed', :sourceRef, :metadata::jsonb,
          :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, item.demoId),
        catalogItemId: mustGet(ids, item.catalogItemId),
        householdId: mustGet(ids, item.householdId),
        neighbourhoodId,
        category: item.category,
        title: item.displayName,
        quantity: item.quantity,
        unit: item.unit,
        itemState: item.state,
        storageState: item.storageState ?? "sealed",
        safetyStatus: item.safetyStatus,
        useByDate: item.labelUseByDate ?? "",
        bestBeforeDate: "",
        lng: household.location.lng,
        lat: household.location.lat,
        sourceRef: item.demoId,
        metadata: rowMetadata(item.demoId, {
          estimatedUseByBand: item.estimatedUseByBand ?? null,
          purchaseDate: item.purchaseDate ?? null,
          size: item.size ?? null,
          condition: item.condition ?? null,
          availabilityNote: item.availabilityNote ?? null,
          lendingTerms: item.lendingTerms ?? null,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );

    await execTx(
      context,
      `
        insert into inventory_events (
          id, item_instance_id, household_id, event_type, occurred_at,
          to_state, delta_quantity, metadata
        )
        values (
          :id::uuid, :itemId::uuid, :householdId::uuid, 'created',
          :occurredAt::timestamp with time zone, :toState::item_state,
          :quantity, :metadata::jsonb
        )
      `,
      params({
        id: demoUuidFor(`inventory-event:${item.demoId}`),
        itemId: mustGet(ids, item.demoId),
        householdId: mustGet(ids, item.householdId),
        occurredAt: seedContext.requestedAt,
        toState: item.state,
        quantity: item.quantity,
        metadata: rowMetadata(`inventory-event:${item.demoId}`),
      }),
    );
  }
}

async function insertNeeds(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const need of world.needs) {
    await execTx(
      context,
      `
        insert into needs (
          id, household_id, neighbourhood_id, category, title, description,
          quantity, unit, status, needed_by, location, metadata,
          demo_scope_id, is_demo
        )
        values (
          :id::uuid, :householdId::uuid, :neighbourhoodId::uuid,
          :category::item_category, :title, :description, 1, 'each',
          :status::need_status, :neededBy::timestamp with time zone,
          ${pointSql}, :metadata::jsonb, :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, need.demoId),
        householdId: mustGet(ids, need.householdId),
        neighbourhoodId,
        category: need.category,
        title: need.title,
        description: need.notes,
        status: need.status,
        neededBy: need.neededBy,
        lng: need.location.lng,
        lat: need.location.lat,
        metadata: rowMetadata(need.demoId, {
          requestedBy: need.requestedBy,
          radiusMeters: need.radiusMeters,
          maxPricePence: need.maxPricePence ?? null,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertDemandPools(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
  seedContext: DemoSeedExecutionContext,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const pool of world.demandPools) {
    const commitments = world.demandPoolCommitments.filter(
      (commitment) => commitment.poolId === pool.demoId,
    );
    const committedQuantity = commitments.reduce((total, commitment) => total + commitment.quantity, 0);
    const firstHousehold = world.households.find(
      (household) => household.demoId === commitments[0]?.householdId,
    ) ?? world.households[0];

    await execTx(
      context,
      `
        insert into demand_pools (
          id, neighbourhood_id, created_by_household_id, title, description,
          status, target_location, threshold_quantity, committed_quantity,
          threshold_households, committed_households, unit, opens_at,
          closes_at, metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :neighbourhoodId::uuid, :createdByHouseholdId::uuid,
          :title, :description, :status::pool_status, ${pointSql},
          :thresholdQuantity, :committedQuantity, :thresholdHouseholds,
          :committedHouseholds, 'bundle', :opensAt::timestamp with time zone,
          :closesAt::timestamp with time zone, :metadata::jsonb,
          :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, pool.demoId),
        neighbourhoodId,
        createdByHouseholdId: mustGet(ids, commitments[0]?.householdId ?? world.households[0].demoId),
        title: pool.title,
        description: pool.requestedItems.join(", "),
        status: pool.status,
        lng: firstHousehold.location.lng,
        lat: firstHousehold.location.lat,
        thresholdQuantity: pool.thresholdHouseholds,
        committedQuantity,
        thresholdHouseholds: pool.thresholdHouseholds,
        committedHouseholds: new Set(commitments.map((commitment) => commitment.householdId)).size,
        opensAt: seedContext.requestedAt,
        closesAt: pool.closesAt,
        metadata: rowMetadata(pool.demoId, {
          category: pool.category,
          maxPricePencePerHousehold: pool.maxPricePencePerHousehold,
          pickupRadiusMeters: pool.pickupRadiusMeters,
          requestedItems: pool.requestedItems,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertCommitmentsAndBids(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
  seedContext: DemoSeedExecutionContext,
) {
  for (const commitment of world.demandPoolCommitments) {
    await execTx(
      context,
      `
        insert into demand_pool_commitments (
          id, demand_pool_id, household_id, quantity, unit, status,
          idempotency_key, committed_at, metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :poolId::uuid, :householdId::uuid, :quantity,
          'bundle', 'active', :idempotencyKey,
          :committedAt::timestamp with time zone, :metadata::jsonb,
          :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, commitment.demoId),
        poolId: mustGet(ids, commitment.poolId),
        householdId: mustGet(ids, commitment.householdId),
        quantity: commitment.quantity,
        idempotencyKey: `${seedContext.idempotencyKey}:${commitment.demoId}`,
        committedAt: commitment.committedAt,
        metadata: rowMetadata(commitment.demoId, {
          maxPricePence: commitment.maxPricePence,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }

  for (const bid of world.merchantBids) {
    await execTx(
      context,
      `
        insert into merchant_bids (
          id, demand_pool_id, merchant_id, merchant_location_id, status,
          price_cents, currency, min_quantity, available_quantity, terms,
          metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :poolId::uuid, :merchantId::uuid,
          :merchantLocationId::uuid, :status::bid_status,
          :priceCents, 'GBP', 1, 999, :terms, :metadata::jsonb,
          :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, bid.demoId),
        poolId: mustGet(ids, bid.poolId),
        merchantId: mustGet(ids, bid.merchantId),
        merchantLocationId: mustGet(ids, `location:${bid.merchantId}`),
        status: bid.status,
        priceCents: bid.pricePencePerHousehold,
        terms: bid.fulfilmentNotes,
        metadata: rowMetadata(bid.demoId, {
          pickupWindow: bid.pickupWindow,
          substitutionPolicy: bid.substitutionPolicy,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertStoreDrops(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
  seedContext: DemoSeedExecutionContext,
) {
  const neighbourhoodId = mustGet(ids, world.neighbourhood.demoId);

  for (const [index, drop] of world.storeDrops.entries()) {
    const [pickupWindowStart, pickupWindowEnd] = resolveDemoStoreDropPickupWindow(
      drop.pickupWindow,
      seedContext.requestedAt,
      index,
    );
    const merchantLocationId = mustGet(ids, `location:${drop.merchantId}`);

    await execTx(
      context,
      `
        insert into store_drops (
          id, merchant_id, merchant_location_id, neighbourhood_id, title,
          description, status, quantity_total, unit, price_cents, currency,
          pickup_window_start, pickup_window_end, safety_notes,
          pickup_location, metadata, demo_scope_id, is_demo
        )
        values (
          :id::uuid, :merchantId::uuid, :merchantLocationId::uuid,
          :neighbourhoodId::uuid, :title, :description,
          :status::store_drop_status, :quantityTotal::numeric, 'box',
          :priceCents, 'GBP', :pickupWindowStart::timestamp with time zone,
          :pickupWindowEnd::timestamp with time zone, :safetyNotes,
          ${pointSql}, :metadata::jsonb, :demoScope, true
        )
      `,
      params({
        id: mustGet(ids, drop.demoId),
        merchantId: mustGet(ids, drop.merchantId),
        merchantLocationId,
        neighbourhoodId,
        title: drop.title,
        description: null,
        status: drop.status,
        quantityTotal: drop.quantityTotal,
        priceCents: drop.pricePence,
        pickupWindowStart,
        pickupWindowEnd,
        safetyNotes: drop.safetyNotes,
        lng: drop.location.lng,
        lat: drop.location.lat,
        metadata: rowMetadata(drop.demoId, {
          quantityReservedSeedInputIgnored: drop.quantityReserved,
          seededAsInputOnly: true,
        }),
        demoScope: DEMO_SCOPE,
      }),
    );
  }
}

async function insertSeedProofRows(
  context: TransactionContext,
  world: DemoWorldFixture,
  ids: IdMap,
  seedContext: DemoSeedExecutionContext,
) {
  const seedBatchId = mustGet(ids, world.metadata.seedBatchId);
  const summary = summarizeDemoWorld(world);

  await execTx(
    context,
    `
      insert into seed_batches (
        id, demo_scope_id, seed_version, status, input_fingerprint,
        started_at, finished_at, summary
      )
      values (
        :id::uuid, :demoScope, :seedVersion, 'applied', :inputFingerprint,
        :startedAt::timestamp with time zone, now(), :summary::jsonb
      )
    `,
    params({
      id: seedBatchId,
      demoScope: DEMO_SCOPE,
      seedVersion: world.metadata.seedVersion,
      inputFingerprint: seedFingerprint(world),
      startedAt: seedContext.requestedAt,
      summary: {
        ...summary,
        storeDropsStoredInSeedSummary: true,
        receiptInputsStoredInSeedSummary: true,
        gs1DigitalLinksStoredInSeedSummary: true,
      },
    }),
  );

  await execTx(
    context,
    `
      insert into audit_events (
        id, entity_type, entity_id, action, source, source_route,
        idempotency_key, after_state, metadata, demo_scope_id, is_demo
      )
      values (
        :id::uuid, 'seed_batch', :seedBatchId::uuid, :action,
        'demo_seed', :sourceRoute, :idempotencyKey, :afterState::jsonb,
        :metadata::jsonb, :demoScope, true
      )
    `,
    params({
      id: demoUuidFor(`audit:${seedContext.idempotencyKey}`),
      seedBatchId,
      action: world.metadata.auditEvent.eventType,
      sourceRoute: world.metadata.auditEvent.route,
      idempotencyKey: seedContext.idempotencyKey,
      afterState: summary,
      metadata: rowMetadata(`audit:${seedContext.idempotencyKey}`, {
        operation: seedContext.operation,
        requestedBy: seedContext.requestedBy,
      }),
      demoScope: DEMO_SCOPE,
    }),
  );
}

async function insertDemoWorld(
  context: TransactionContext,
  world: DemoWorldFixture,
  seedContext: DemoSeedExecutionContext,
) {
  const ids = tableIds(world);

  await insertNeighbourhood(context, world, ids);
  await insertHouseholds(context, world, ids);
  await insertMerchants(context, world, ids);
  await insertCatalog(context, world, ids);
  await insertItems(context, world, ids, seedContext);
  await insertNeeds(context, world, ids);
  await insertDemandPools(context, world, ids, seedContext);
  await insertCommitmentsAndBids(context, world, ids, seedContext);
  await insertStoreDrops(context, world, ids, seedContext);
  await insertSeedProofRows(context, world, ids, seedContext);
}

export function createDryRunDemoSeedAdapter(): DemoSeedAdapter {
  const dryRun = async (
    world: DemoWorldFixture,
    context: DemoSeedExecutionContext,
  ): Promise<DemoSeedMutationResult> => ({
    status: "dry_run",
    applied: false,
    message:
      "Aurora environment is not configured for this runtime, so the demo seed is reporting its exact mutation plan without pretending to write rows.",
    seedBatchId: world.metadata.seedBatchId,
    mutationTimestamp: context.requestedAt,
    idempotencyKey: context.idempotencyKey,
    summary: summarizeDemoWorld(world),
    plan: buildDemoSeedPlan(context.operation),
    integrationRequired: [
      "Set AWS_REGION, AURORA_CLUSTER_ARN, AURORA_SECRET_ARN, and AURORA_DATABASE for this runtime.",
      "Apply the Checkpoint 1 Aurora migration before running live seed/reset.",
      "Keep final output tables empty on seed; downstream jobs/routes should compute those from current rows.",
    ],
  });

  return {
    name: "dry-run-demo-seed-adapter",
    live: false,
    seed: dryRun,
    reset: dryRun,
  };
}

export function createLiveDemoSeedAdapter(): DemoSeedAdapter {
  const execute = async (
    world: DemoWorldFixture,
    context: DemoSeedExecutionContext,
  ): Promise<DemoSeedMutationResult> => {
    try {
      await withTransaction(async (transaction) => {
        await resetDemoRows(transaction);
        await insertDemoWorld(transaction, world, context);
      });

      return {
        status: "applied",
        applied: true,
        message: `Demo ${context.operation} applied to Aurora using deterministic input-world rows.`,
        seedBatchId: world.metadata.seedBatchId,
        mutationTimestamp: context.requestedAt,
        idempotencyKey: context.idempotencyKey,
        summary: summarizeDemoWorld(world),
        plan: buildDemoSeedPlan(context.operation),
      };
    } catch (error) {
      return {
        status: "unavailable",
        applied: false,
        message: publicErrorMessage(error),
        seedBatchId: world.metadata.seedBatchId,
        mutationTimestamp: context.requestedAt,
        idempotencyKey: context.idempotencyKey,
        summary: summarizeDemoWorld(world),
        plan: buildDemoSeedPlan(context.operation),
        integrationRequired: [
          "Confirm Checkpoint 1 migration has been applied to Aurora.",
          "Confirm AURORA_CLUSTER_ARN, AURORA_SECRET_ARN, AURORA_DATABASE, and AWS_REGION are set for this runtime.",
        ],
      };
    }
  };

  return {
    name: "aurora-demo-seed-adapter",
    live: true,
    seed: execute,
    reset: execute,
  };
}

export function resolveDemoSeedAdapter(): DemoSeedAdapter {
  if (
    process.env.AWS_REGION &&
    process.env.AURORA_CLUSTER_ARN &&
    (process.env.AURORA_SECRET_ARN || process.env.AURORA_APP_SECRET_ARN) &&
    process.env.AURORA_DATABASE
  ) {
    return createLiveDemoSeedAdapter();
  }

  return createDryRunDemoSeedAdapter();
}

export async function runDemoSeedOperation(
  operation: DemoSeedOperation,
  options: {
    adapter?: DemoSeedAdapter;
    requestedAt?: string;
    requestedBy?: DemoSeedExecutionContext["requestedBy"];
    world?: DemoWorldFixture;
  } = {},
): Promise<DemoSeedMutationResult> {
  const world = options.world ?? RIVERSIDE_QUARTER_DEMO_WORLD;
  const context = {
    ...buildDemoSeedContext(operation, options.requestedAt),
    requestedBy: options.requestedBy ?? "demo_route",
  };
  const adapter = options.adapter ?? resolveDemoSeedAdapter();

  if (operation === "reset") {
    return adapter.reset(world, context);
  }

  return adapter.seed(world, context);
}
