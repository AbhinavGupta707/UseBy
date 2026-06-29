import { randomUUID } from "node:crypto";

import {
  CP6_BASE_TABLE_CONTRACTS,
  CP6_OUTPUT_TABLE_CONTRACTS,
  checkCp6Contracts,
  unavailableCp6Reason,
  type MerchantBidInput,
  type MerchantBidWithdrawInput,
  type PickupTransitionInput,
} from "../demand-pools/contracts";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import type { MerchantActorContext } from "./context";

export type MerchantRuntimeStatus = "ok" | "unavailable" | "error";

export class MerchantRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MerchantRuntimeError";
    this.status = status;
  }
}

export function isMerchantRuntimeError(error: unknown): error is MerchantRuntimeError {
  return error instanceof MerchantRuntimeError;
}

type PoolRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  threshold_quantity: string;
  committed_quantity: string;
  threshold_households: number;
  committed_households: number;
  unit: string;
  closes_at: string;
  bidding_opens_at: string | null;
  awarded_bid_id: string | null;
  metadata: unknown;
  distance_meters: number | null;
  submitted_bid_count: number;
  merchant_bid_id: string | null;
  merchant_bid_status: string | null;
};

type BidRow = {
  id: string;
  demand_pool_id: string;
  pool_title: string;
  pool_status: string;
  merchant_location_id: string | null;
  location_name: string | null;
  status: string;
  price_cents: number;
  currency: string;
  min_quantity: string;
  available_quantity: string;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  score: string | null;
  terms: string | null;
  submitted_at: string;
  awarded_at: string | null;
  metadata: unknown;
};

type PickupRow = {
  order_id: string;
  pickup_task_id: string | null;
  demand_pool_id: string;
  pool_title: string;
  household_id?: string;
  household_public_label: string;
  household_coarse_location_label: string;
  merchant_location_id?: string | null;
  status: string;
  quantity: string;
  unit: string;
  price_cents: number;
  currency: string;
  coarse_pickup_label: string | null;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  ready_at: string | null;
  collected_at: string | null;
  metadata: unknown;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

async function execTx<Row extends QueryRow = QueryRow>(
  context: TransactionContext,
  sql: string,
  values: Record<string, SqlValue> = {},
) {
  return executeSql<Row>({
    sql,
    parameters: params(values),
    transactionId: context.transactionId,
    config: context.config,
    client: context.client,
  });
}

function jsonField(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function metadataObject(value: unknown): Record<string, unknown> {
  const parsed = jsonField(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function numberFrom(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listFromMetadata(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function poolDto(row: PoolRow) {
  const metadata = metadataObject(row.metadata);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    unit: row.unit,
    thresholdQuantity: numberFrom(row.threshold_quantity),
    committedQuantity: numberFrom(row.committed_quantity),
    thresholdHouseholds: row.threshold_households,
    committedHouseholds: row.committed_households,
    closesAt: row.closes_at,
    biddingOpensAt: row.bidding_opens_at,
    awardedBidId: row.awarded_bid_id,
    requestedItems: listFromMetadata(metadata.requestedItems),
    category: typeof metadata.category === "string" ? metadata.category : null,
    maxPriceCentsPerHousehold: numberFrom(metadata.maxPricePencePerHousehold, 0),
    pickupRadiusMeters: numberFrom(metadata.pickupRadiusMeters, 0),
    distanceMeters: row.distance_meters,
    submittedBidCount: row.submitted_bid_count,
    merchantBid: row.merchant_bid_id
      ? {
          id: row.merchant_bid_id,
          status: row.merchant_bid_status,
        }
      : null,
    privacy: {
      householdLocations: "coarse aggregate only",
      directContact: false,
    },
  };
}

function bidDto(row: BidRow) {
  const metadata = metadataObject(row.metadata);
  return {
    id: row.id,
    demandPoolId: row.demand_pool_id,
    poolTitle: row.pool_title,
    poolStatus: row.pool_status,
    merchantLocationId: row.merchant_location_id,
    locationName: row.location_name,
    status: row.status,
    priceCents: row.price_cents,
    currency: row.currency,
    minQuantity: numberFrom(row.min_quantity),
    availableQuantity: numberFrom(row.available_quantity),
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    score: row.score === null ? null : numberFrom(row.score),
    terms: row.terms,
    submittedAt: row.submitted_at,
    awardedAt: row.awarded_at,
    substitutionPolicy:
      typeof metadata.substitutionPolicy === "string"
        ? metadata.substitutionPolicy
        : null,
    fulfilmentNotes:
      typeof metadata.fulfilmentNotes === "string"
        ? metadata.fulfilmentNotes
        : null,
    scoring: metadata.scoring ?? null,
  };
}

function pickupDto(row: PickupRow) {
  return {
    orderId: row.order_id,
    pickupTaskId: row.pickup_task_id,
    demandPoolId: row.demand_pool_id,
    poolTitle: row.pool_title,
    household: {
      publicLabel: row.household_public_label,
      coarseLocationLabel: row.household_coarse_location_label,
    },
    status: row.status,
    quantity: numberFrom(row.quantity),
    unit: row.unit,
    priceCents: row.price_cents,
    currency: row.currency,
    coarsePickupLabel: row.coarse_pickup_label,
    coarsePickupHint: row.coarse_pickup_label,
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    readyAt: row.ready_at,
    collectedAt: row.collected_at,
    privacy: {
      exactHouseholdCoordinates: false,
      directContact: false,
    },
  };
}

async function ensureMerchantRuntimeAvailable(outputTables = false) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new MerchantRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  const contracts = await checkCp6Contracts(
    outputTables
      ? [...CP6_BASE_TABLE_CONTRACTS, ...CP6_OUTPUT_TABLE_CONTRACTS]
      : CP6_BASE_TABLE_CONTRACTS,
  );
  if (!contracts.available) {
    throw new MerchantRuntimeError(503, unavailableCp6Reason(contracts));
  }
}

export async function listMerchantDemandPools(context: MerchantActorContext) {
  await ensureMerchantRuntimeAvailable();

  try {
    const result = await executeSql<PoolRow>({
      sql: `
        select
          p.id::text,
          p.title,
          p.description,
          p.status::text,
          p.threshold_quantity::text,
          p.committed_quantity::text,
          p.threshold_households,
          p.committed_households,
          p.unit,
          p.closes_at::text,
          p.bidding_opens_at::text,
          p.awarded_bid_id::text,
          p.metadata,
          ST_Distance(ml.location, p.target_location)::float as distance_meters,
          count(distinct submitted.id)::int as submitted_bid_count,
          own.id::text as merchant_bid_id,
          own.status::text as merchant_bid_status
        from demand_pools p
        join merchant_locations ml
          on ml.id = :merchantLocationId::uuid
          and ml.is_active = true
          and ml.deleted_at is null
        left join merchant_bids submitted
          on submitted.demand_pool_id = p.id
          and submitted.status in ('submitted', 'winning')
          and submitted.deleted_at is null
        left join merchant_bids own
          on own.demand_pool_id = p.id
          and own.merchant_id = :merchantId::uuid
          and own.deleted_at is null
        where p.deleted_at is null
          and p.status in ('gathering', 'threshold_met', 'bidding')
          and p.neighbourhood_id = coalesce(ml.neighbourhood_id, p.neighbourhood_id)
          and ST_DWithin(
            ml.location,
            p.target_location,
            coalesce((p.metadata->>'pickupRadiusMeters')::int, 1000)
          )
        group by p.id, ml.location, own.id, own.status
        order by
          case p.status when 'bidding' then 0 when 'threshold_met' then 1 else 2 end,
          p.closes_at asc,
          p.created_at asc
      `,
      parameters: params({
        merchantId: context.merchant.id,
        merchantLocationId: context.location.id,
      }),
    });

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      location: context.location,
      pools: result.rows.map(poolDto),
    };
  } catch (error) {
    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function getMerchantDemandPool(
  context: MerchantActorContext,
  poolId: string,
) {
  await ensureMerchantRuntimeAvailable();

  try {
    const result = await executeSql<PoolRow>({
      sql: `
        select
          p.id::text,
          p.title,
          p.description,
          p.status::text,
          p.threshold_quantity::text,
          p.committed_quantity::text,
          p.threshold_households,
          p.committed_households,
          p.unit,
          p.closes_at::text,
          p.bidding_opens_at::text,
          p.awarded_bid_id::text,
          p.metadata,
          ST_Distance(ml.location, p.target_location)::float as distance_meters,
          count(distinct submitted.id)::int as submitted_bid_count,
          own.id::text as merchant_bid_id,
          own.status::text as merchant_bid_status
        from demand_pools p
        join merchant_locations ml
          on ml.id = :merchantLocationId::uuid
          and ml.is_active = true
          and ml.deleted_at is null
        left join merchant_bids submitted
          on submitted.demand_pool_id = p.id
          and submitted.status in ('submitted', 'winning')
          and submitted.deleted_at is null
        left join merchant_bids own
          on own.demand_pool_id = p.id
          and own.merchant_id = :merchantId::uuid
          and own.deleted_at is null
        where p.id = :poolId::uuid
          and p.deleted_at is null
          and p.neighbourhood_id = coalesce(ml.neighbourhood_id, p.neighbourhood_id)
          and ST_DWithin(
            ml.location,
            p.target_location,
            coalesce((p.metadata->>'pickupRadiusMeters')::int, 1000)
          )
        group by p.id, ml.location, own.id, own.status
        limit 1
      `,
      parameters: params({
        merchantId: context.merchant.id,
        merchantLocationId: context.location.id,
        poolId,
      }),
    });

    const pool = result.rows[0];
    if (!pool) {
      throw new MerchantRuntimeError(404, "Demand pool is not available for this merchant location.");
    }

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      location: context.location,
      pool: poolDto(pool),
    };
  } catch (error) {
    if (isMerchantRuntimeError(error)) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function listMerchantBids(context: MerchantActorContext) {
  await ensureMerchantRuntimeAvailable();

  try {
    const result = await executeSql<BidRow>({
      sql: `
        select
          b.id::text,
          b.demand_pool_id::text,
          p.title as pool_title,
          p.status::text as pool_status,
          b.merchant_location_id::text,
          ml.name as location_name,
          b.status::text,
          b.price_cents,
          b.currency,
          b.min_quantity::text,
          b.available_quantity::text,
          b.pickup_window_start::text,
          b.pickup_window_end::text,
          b.score::text,
          b.terms,
          b.submitted_at::text,
          b.awarded_at::text,
          b.metadata
        from merchant_bids b
        join demand_pools p on p.id = b.demand_pool_id
        left join merchant_locations ml on ml.id = b.merchant_location_id
        where b.merchant_id = :merchantId::uuid
          and b.deleted_at is null
          and p.deleted_at is null
        order by b.submitted_at desc
      `,
      parameters: params({ merchantId: context.merchant.id }),
    });

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      bids: result.rows.map(bidDto),
    };
  } catch (error) {
    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function submitMerchantBid(
  context: MerchantActorContext,
  input: MerchantBidInput,
) {
  await ensureMerchantRuntimeAvailable();

  const locationId = input.merchantLocationId ?? context.location.id;
  try {
    return await withTransaction(async (transaction) => {
      const policy = await execTx<{
        pool_id: string;
        pool_status: string;
        committed_quantity: string;
        committed_households: number;
        location_id: string;
        serviceable: boolean;
      }>(
        transaction,
        `
          select
            p.id::text as pool_id,
            p.status::text as pool_status,
            p.committed_quantity::text,
            p.committed_households,
            ml.id::text as location_id,
            ST_DWithin(
              ml.location,
              p.target_location,
              coalesce((p.metadata->>'pickupRadiusMeters')::int, 1000)
            ) as serviceable
          from demand_pools p
          join merchant_locations ml
            on ml.id = :locationId::uuid
            and ml.merchant_id = :merchantId::uuid
            and ml.is_active = true
            and ml.deleted_at is null
          where p.id = :demandPoolId::uuid
            and p.deleted_at is null
          for update of p
        `,
        {
          locationId,
          merchantId: context.merchant.id,
          demandPoolId: input.demandPoolId,
        },
      );

      const pool = policy.rows[0];
      if (!pool) {
        throw new MerchantRuntimeError(404, "Demand pool or merchant location is not available.");
      }
      if (!["threshold_met", "bidding"].includes(pool.pool_status)) {
        throw new MerchantRuntimeError(409, `Pool is ${pool.pool_status}, not open for bids.`);
      }
      if (!pool.serviceable) {
        throw new MerchantRuntimeError(403, "Merchant location is outside the pool pickup radius.");
      }
      if (input.availableQuantity < numberFrom(pool.committed_quantity)) {
        throw new MerchantRuntimeError(409, "Available quantity is below current committed demand.");
      }

      const result = await execTx<BidRow>(
        transaction,
        `
          insert into merchant_bids (
            demand_pool_id, merchant_id, merchant_location_id, status,
            price_cents, currency, min_quantity, available_quantity,
            pickup_window_start, pickup_window_end, terms, metadata,
            demo_scope_id, is_demo
          )
          values (
            :demandPoolId::uuid, :merchantId::uuid, :locationId::uuid,
            'submitted', :priceCents, :currency, :minQuantity,
            :availableQuantity, :pickupWindowStart::timestamp with time zone,
            :pickupWindowEnd::timestamp with time zone, nullif(:terms, ''),
            :metadata::jsonb, :demoScope, true
          )
          returning
            id::text,
            demand_pool_id::text,
            (select title from demand_pools where id = :demandPoolId::uuid) as pool_title,
            (select status::text from demand_pools where id = :demandPoolId::uuid) as pool_status,
            merchant_location_id::text,
            (select name from merchant_locations where id = :locationId::uuid) as location_name,
            status::text,
            price_cents,
            currency,
            min_quantity::text,
            available_quantity::text,
            pickup_window_start::text,
            pickup_window_end::text,
            score::text,
            terms,
            submitted_at::text,
            awarded_at::text,
            metadata
        `,
        {
          demandPoolId: input.demandPoolId,
          merchantId: context.merchant.id,
          locationId,
          priceCents: input.priceCents,
          currency: input.currency.toUpperCase(),
          minQuantity: input.minQuantity,
          availableQuantity: input.availableQuantity,
          pickupWindowStart: input.pickupWindowStart ?? null,
          pickupWindowEnd: input.pickupWindowEnd ?? null,
          terms: input.terms ?? input.fulfilmentNotes ?? "",
          metadata: {
            ...input.metadata,
            substitutionPolicy: input.substitutionPolicy ?? null,
            fulfilmentNotes: input.fulfilmentNotes ?? null,
            reliabilityEvidence: input.reliabilityEvidence ?? null,
            payment: "deferred_demo_no_charge",
          },
          demoScope: context.demoScope,
        },
      );

      const bid = result.rows[0];
      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'merchant_bid', :bidId::uuid,
            'merchant.bid.submitted', 'api', '/api/merchant/bids',
            :afterState::jsonb, :metadata::jsonb, :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          bidId: bid.id,
          afterState: { status: "submitted", demandPoolId: input.demandPoolId },
          metadata: { payment: "deferred_demo_no_charge" },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        bid: bidDto(bid),
      };
    });
  } catch (error) {
    if (isMerchantRuntimeError(error)) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function withdrawMerchantBid(
  context: MerchantActorContext,
  bidId: string,
  input: MerchantBidWithdrawInput,
) {
  await ensureMerchantRuntimeAvailable();

  try {
    return await withTransaction(async (transaction) => {
      const result = await execTx<BidRow>(
        transaction,
        `
          update merchant_bids b
          set
            status = 'withdrawn',
            metadata = coalesce(b.metadata, '{}'::jsonb) || :metadata::jsonb,
            updated_at = now()
          from demand_pools p
          where b.id = :bidId::uuid
            and b.demand_pool_id = p.id
            and b.merchant_id = :merchantId::uuid
            and b.status = 'submitted'
            and p.status in ('threshold_met', 'bidding')
            and b.deleted_at is null
          returning
            b.id::text,
            b.demand_pool_id::text,
            p.title as pool_title,
            p.status::text as pool_status,
            b.merchant_location_id::text,
            null::text as location_name,
            b.status::text,
            b.price_cents,
            b.currency,
            b.min_quantity::text,
            b.available_quantity::text,
            b.pickup_window_start::text,
            b.pickup_window_end::text,
            b.score::text,
            b.terms,
            b.submitted_at::text,
            b.awarded_at::text,
            b.metadata
        `,
        {
          bidId,
          merchantId: context.merchant.id,
          metadata: {
            withdrawReason: input.reason ?? null,
            withdrawnAt: new Date().toISOString(),
            ...input.metadata,
          },
        },
      );

      const bid = result.rows[0];
      if (!bid) {
        throw new MerchantRuntimeError(404, "Submitted bid is not withdrawable for this merchant.");
      }

      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'merchant_bid', :bidId::uuid,
            'merchant.bid.withdrawn', 'api', '/api/merchant/bids/:bidId/withdraw',
            :afterState::jsonb, :metadata::jsonb, :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          bidId,
          afterState: { status: "withdrawn" },
          metadata: { reason: input.reason ?? null },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        bid: bidDto(bid),
      };
    });
  } catch (error) {
    if (isMerchantRuntimeError(error)) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function listMerchantPickups(context: MerchantActorContext) {
  await ensureMerchantRuntimeAvailable(true);

  try {
    const result = await executeSql<PickupRow>({
      sql: `
        select
          po.id::text as order_id,
          pt.id::text as pickup_task_id,
          po.demand_pool_id::text,
          p.title as pool_title,
          h.public_label as household_public_label,
          h.coarse_location_label as household_coarse_location_label,
          po.status::text,
          po.quantity::text,
          po.unit,
          po.price_cents,
          po.currency,
          coalesce(pt.coarse_pickup_label, ml.public_address) as coarse_pickup_label,
          coalesce(pt.pickup_window_start, po.pickup_window_start)::text as pickup_window_start,
          coalesce(pt.pickup_window_end, po.pickup_window_end)::text as pickup_window_end,
          coalesce(pt.ready_at, po.ready_at)::text as ready_at,
          coalesce(pt.collected_at, po.collected_at)::text as collected_at,
          po.metadata
        from pool_orders po
        join demand_pools p on p.id = po.demand_pool_id
        join households h on h.id = po.household_id
        left join pickup_tasks pt on pt.pool_order_id = po.id
        left join merchant_locations ml on ml.id = coalesce(pt.merchant_location_id, po.merchant_location_id)
        where po.merchant_id = :merchantId::uuid
          and p.deleted_at is null
        order by p.awarded_at desc nulls last, po.created_at asc
      `,
      parameters: params({ merchantId: context.merchant.id }),
    });

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      pickups: result.rows.map(pickupDto),
    };
  } catch (error) {
    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function transitionPickup(
  context: MerchantActorContext,
  orderId: string,
  transition: "ready" | "collected",
  input: PickupTransitionInput,
) {
  await ensureMerchantRuntimeAvailable(true);

  try {
    return await withTransaction(async (transaction) => {
      const now = new Date().toISOString();
      const status = transition === "ready" ? "ready" : "collected";
      const timestampColumn = transition === "ready" ? "ready_at" : "collected_at";
      const taskId = randomUUID();

      const order = await execTx<PickupRow>(
        transaction,
        `
          update pool_orders
          set
            status = :status::pool_order_status,
            ${timestampColumn} = coalesce(${timestampColumn}, now()),
            status_evidence = coalesce(status_evidence, '{}'::jsonb) || :metadata::jsonb,
            metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb,
            updated_at = now()
          where id = :orderId::uuid
            and merchant_id = :merchantId::uuid
            and status in ('pending', 'ready')
          returning
            id::text as order_id,
            null::text as pickup_task_id,
            demand_pool_id::text,
            household_id::text,
            (select title from demand_pools where id = pool_orders.demand_pool_id) as pool_title,
            (select public_label from households where id = pool_orders.household_id) as household_public_label,
            (select coarse_location_label from households where id = pool_orders.household_id) as household_coarse_location_label,
            merchant_location_id::text,
            status::text,
            quantity::text,
            unit,
            price_cents,
            currency,
            (select coarse_pickup_label from pickup_tasks where pool_order_id = pool_orders.id limit 1) as coarse_pickup_label,
            pickup_window_start::text,
            pickup_window_end::text,
            ready_at::text,
            collected_at::text,
            metadata
        `,
        {
          orderId,
          merchantId: context.merchant.id,
          status,
          metadata: {
            ...input.metadata,
            [`${transition}Note`]: input.note ?? null,
            [`${transition}At`]: now,
          },
        },
      );

      const row = order.rows[0];
      if (!row) {
        throw new MerchantRuntimeError(404, "Pickup order is not available for this merchant transition.");
      }

      const existingTask = await execTx<{ id: string }>(
        transaction,
        `
          update pickup_tasks
          set
            status = :status::pickup_task_status,
            ready_at = coalesce(ready_at, :readyAt::timestamp with time zone),
            collected_at = coalesce(collected_at, :collectedAt::timestamp with time zone),
            metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb,
            updated_at = now()
          where pool_order_id = :orderId::uuid
          returning id::text as id
        `,
        {
          orderId,
          status,
          readyAt: transition === "ready" ? now : null,
          collectedAt: transition === "collected" ? now : null,
          metadata: { source: "merchant_api", transition, note: input.note ?? null },
        },
      );

      if (!existingTask.rows[0]) {
        await execTx(
          transaction,
          `
            insert into pickup_tasks (
              id, pool_order_id, demand_pool_id, household_id, merchant_id,
              merchant_location_id, status, coarse_pickup_label,
              pickup_window_start, pickup_window_end, ready_at, collected_at,
              evidence, metadata, demo_scope_id, is_demo
            )
            values (
              :taskId::uuid, :orderId::uuid, :demandPoolId::uuid,
              :householdId::uuid, :merchantId::uuid, :merchantLocationId::uuid,
              :status::pickup_task_status, :coarsePickupLabel,
              :pickupWindowStart::timestamp with time zone,
              :pickupWindowEnd::timestamp with time zone,
              :readyAt::timestamp with time zone,
              :collectedAt::timestamp with time zone, :metadata::jsonb,
              :metadata::jsonb, :demoScope, true
            )
          `,
          {
            taskId,
            orderId,
            demandPoolId: row.demand_pool_id,
            householdId: row.household_id ?? "",
            merchantId: context.merchant.id,
            merchantLocationId: row.merchant_location_id ?? context.location.id,
            status,
            coarsePickupLabel: row.coarse_pickup_label ?? context.location.publicAddress,
            pickupWindowStart: row.pickup_window_start,
            pickupWindowEnd: row.pickup_window_end,
            readyAt: transition === "ready" ? now : null,
            collectedAt: transition === "collected" ? now : null,
            metadata: { source: "merchant_api", transition, note: input.note ?? null },
            demoScope: context.demoScope,
          },
        );
      }

      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'pool_order', :orderId::uuid,
            :action, 'api', :route, :afterState::jsonb, :metadata::jsonb,
            :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          orderId,
          action: `merchant.pickup.${transition}`,
          route: `/api/merchant/pickups/:orderId/${transition}`,
          afterState: { status },
          metadata: { note: input.note ?? null },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        pickup: pickupDto(row),
      };
    });
  } catch (error) {
    if (isMerchantRuntimeError(error)) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}
