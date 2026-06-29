import { createHash } from "node:crypto";

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
import type { DemoActorContext } from "../demo/context";
import {
  DEMAND_POOL_PAYMENT_NOTICE,
  checkDemandPoolContracts,
  nextPoolStatusAfterRecompute,
  unavailableDemandPoolReason,
  type DemandPoolCancelCommitmentInput,
  type DemandPoolBidSummaryDto,
  type DemandPoolCommitInput,
  type DemandPoolCommitmentDto,
  type DemandPoolCreateInput,
  type DemandPoolDto,
  type DemandPoolOrderDto,
  type PoolStatus,
} from "./contracts";

type IdempotencyRow = {
  status: string;
  request_hash: string;
  response_json: unknown | null;
};

type PoolRow = {
  id: string;
  title: string;
  description: string | null;
  status: PoolStatus;
  unit: string;
  requested_items: unknown;
  pickup_radius_meters: string | null;
  pickup_area_label: string;
  threshold_quantity: string;
  threshold_households: number;
  committed_quantity: string;
  committed_households: number;
  commitment_id: string | null;
  commitment_status: string | null;
  commitment_quantity: string | null;
  commitment_unit: string | null;
  commitment_max_price_pence: string | null;
  commitment_note: string | null;
  committed_at: string | null;
  commitment_cancelled_at: string | null;
  commitment_updated_at: string | null;
  bid_count: number;
  awarded_bid_id: string | null;
  opens_at: string;
  closes_at: string;
  bidding_opens_at: string | null;
  awarded_at: string | null;
  updated_at: string;
};

type BidRow = {
  id: string;
  status: string;
  merchant_name: string;
  price_cents: number;
  currency: string;
  available_quantity: string;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  terms: string | null;
  submitted_at: string;
};

type PoolLockRow = {
  id: string;
  status: PoolStatus;
  title: string;
  unit: string;
  threshold_quantity: string;
  threshold_households: number;
  closes_at: string;
};

type PoolAggregateRow = {
  committed_quantity: string;
  committed_households: number;
};

type CommitmentRow = {
  id: string;
  status: string;
};

type OrderRow = {
  id: string;
  pool_id: string;
  pool_title: string;
  status: string;
  quantity: string;
  unit: string;
  price_cents: number | null;
  currency: string;
  merchant_id: string | null;
  merchant_name: string | null;
  pickup_area_label: string | null;
  pickup_task_id: string | null;
  pickup_status: string | null;
  coarse_pickup_label: string | null;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  ready_at: string | null;
  collected_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type CreateDemandPoolResponse = {
  ok: true;
  idempotent: boolean;
  pool: DemandPoolDto;
};

type CommitDemandPoolResponse = {
  ok: true;
  idempotent: boolean;
  pool: DemandPoolDto;
  commitment: DemandPoolCommitmentDto | null;
  thresholdTransitioned: boolean;
};

type CancelDemandPoolCommitmentResponse = {
  ok: true;
  idempotent: boolean;
  pool: DemandPoolDto;
  commitment: null;
  thresholdTransitioned: boolean;
};

export class DemandPoolRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DemandPoolRuntimeError";
    this.status = status;
  }
}

export function isDemandPoolRuntimeError(error: unknown): error is DemandPoolRuntimeError {
  return error instanceof DemandPoolRuntimeError;
}

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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function namespaceKey(scope: string, rawKey: string): string {
  const trimmed = rawKey.trim();
  return trimmed.startsWith(`${scope}:`) ? trimmed : `${scope}:${trimmed}`;
}

function autoIdempotencyKey(scope: string, context: DemoActorContext, input: unknown): string {
  return `${scope}:auto:${requestHash({
    householdId: context.household.id,
    input,
  })}`;
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

function requestedItemsFromField(value: unknown): string[] {
  const parsed = jsonField(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function numberFromString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(numerator: string, denominator: string | number): number {
  const top = Number.parseFloat(numerator);
  const bottom = typeof denominator === "number" ? denominator : Number.parseFloat(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((top / bottom) * 100));
}

function commitmentDtoFromRow(row: PoolRow): DemandPoolCommitmentDto | null {
  if (!row.commitment_id || !row.commitment_status || !row.commitment_quantity || !row.commitment_unit) {
    return null;
  }

  return {
    id: row.commitment_id,
    status: row.commitment_status as DemandPoolCommitmentDto["status"],
    quantity: row.commitment_quantity,
    unit: row.commitment_unit,
    maxPricePence: numberFromString(row.commitment_max_price_pence),
    note: row.commitment_note,
    committedAt: row.committed_at ?? row.updated_at,
    cancelledAt: row.commitment_cancelled_at,
    updatedAt: row.commitment_updated_at ?? row.updated_at,
    paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
  };
}

export function demandPoolDtoFromRow(row: PoolRow, bids: BidRow[] = []): DemandPoolDto {
  const thresholdMet =
    Number.parseFloat(row.committed_quantity) >= Number.parseFloat(row.threshold_quantity) ||
    row.committed_households >= row.threshold_households;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    unit: row.unit,
    requestedItems: requestedItemsFromField(row.requested_items),
    pickupAreaLabel: row.pickup_area_label,
    pickupRadiusMeters: numberFromString(row.pickup_radius_meters),
    threshold: {
      quantity: row.threshold_quantity,
      households: row.threshold_households,
    },
    committed: {
      quantity: row.committed_quantity,
      households: row.committed_households,
    },
    progress: {
      quantityPercent: percentage(row.committed_quantity, row.threshold_quantity),
      householdsPercent: percentage(String(row.committed_households), row.threshold_households),
      thresholdMet,
    },
    currentHouseholdCommitment: commitmentDtoFromRow(row),
    bidSummary: {
      submitted: row.bid_count,
      winningBidId: row.awarded_bid_id,
    },
    bids: bids.map((bid) => ({
      id: bid.id,
      status: bid.status as DemandPoolBidSummaryDto["status"],
      merchantName: bid.merchant_name,
      priceCents: bid.price_cents,
      currency: bid.currency,
      availableQuantity: bid.available_quantity,
      pickupWindowStart: bid.pickup_window_start,
      pickupWindowEnd: bid.pickup_window_end,
      terms: bid.terms,
      submittedAt: bid.submitted_at,
    })),
    awardedBidId: row.awarded_bid_id,
    timeline: {
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      biddingOpensAt: row.bidding_opens_at,
      awardedAt: row.awarded_at,
      updatedAt: row.updated_at,
    },
    paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
  };
}

async function ensureDemandPoolRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new DemandPoolRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  try {
    const contracts = await checkDemandPoolContracts();
    if (!contracts.available) {
      throw new DemandPoolRuntimeError(503, unavailableDemandPoolReason(contracts));
    }
  } catch (error) {
    if (isDemandPoolRuntimeError(error)) {
      throw error;
    }

    throw new DemandPoolRuntimeError(503, publicErrorMessage(error));
  }
}

async function beginIdempotentMutation(
  context: TransactionContext,
  key: string,
  scope: string,
  hash: string,
): Promise<unknown | null> {
  const existing = await execTx<IdempotencyRow>(
    context,
    `
      select status, request_hash, response_json
      from idempotency_keys
      where key = :key
      for update
    `,
    { key },
  );

  const row = existing.rows[0];
  if (!row) {
    await execTx(
      context,
      `
        insert into idempotency_keys (
          key, scope, request_hash, status, locked_at, expires_at,
          created_at, updated_at
        )
        values (
          :key, :scope, :requestHash, 'started', now(),
          now() + interval '24 hours', now(), now()
        )
      `,
      { key, scope, requestHash: hash },
    );
    return null;
  }

  if (row.request_hash !== hash) {
    throw new DemandPoolRuntimeError(
      409,
      "Idempotency key already exists for a different demand pool request.",
    );
  }

  if (row.status === "completed" && row.response_json) {
    return jsonField(row.response_json);
  }

  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'started',
          locked_at = now(),
          expires_at = now() + interval '24 hours',
          updated_at = now()
      where key = :key
    `,
    { key },
  );

  return null;
}

async function completeIdempotentMutation(
  context: TransactionContext,
  key: string,
  response: unknown,
) {
  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'completed',
          response_json = :response::jsonb,
          locked_at = null,
          updated_at = now()
      where key = :key
    `,
    { response: response as Record<string, unknown>, key },
  );
}

function basePoolSelect(whereClause: string) {
  return `
    with active_commitments as (
      select
        demand_pool_id,
        coalesce(sum(quantity), 0)::text as committed_quantity,
        count(distinct household_id)::int as committed_households
      from demand_pool_commitments
      where status = 'active'
      group by demand_pool_id
    ),
    bid_counts as (
      select
        demand_pool_id,
        count(*) filter (where status in ('submitted', 'winning'))::int as bid_count
      from merchant_bids
      where deleted_at is null
      group by demand_pool_id
    )
    select
      p.id::text as id,
      p.title,
      p.description,
      p.status::text as status,
      p.unit,
      p.metadata->'requestedItems' as requested_items,
      p.metadata->>'pickupRadiusMeters' as pickup_radius_meters,
      n.name as pickup_area_label,
      p.threshold_quantity::text as threshold_quantity,
      p.threshold_households,
      coalesce(ac.committed_quantity, '0') as committed_quantity,
      coalesce(ac.committed_households, 0) as committed_households,
      c.id::text as commitment_id,
      c.status::text as commitment_status,
      c.quantity::text as commitment_quantity,
      c.unit as commitment_unit,
      c.metadata->>'maxPricePence' as commitment_max_price_pence,
      c.metadata->>'note' as commitment_note,
      c.committed_at::text as committed_at,
      c.cancelled_at::text as commitment_cancelled_at,
      c.updated_at::text as commitment_updated_at,
      coalesce(bc.bid_count, 0) as bid_count,
      p.awarded_bid_id::text as awarded_bid_id,
      p.opens_at::text as opens_at,
      p.closes_at::text as closes_at,
      p.bidding_opens_at::text as bidding_opens_at,
      p.awarded_at::text as awarded_at,
      p.updated_at::text as updated_at
    from demand_pools p
    join neighbourhoods n on n.id = p.neighbourhood_id
    left join active_commitments ac on ac.demand_pool_id = p.id
    left join demand_pool_commitments c
      on c.demand_pool_id = p.id
      and c.household_id = :householdId::uuid
      and c.status = 'active'
    left join bid_counts bc on bc.demand_pool_id = p.id
    ${whereClause}
  `;
}

async function loadPoolDetail(
  poolId: string,
  context: DemoActorContext,
  transaction?: TransactionContext,
): Promise<DemandPoolDto | null> {
  const sql = `${basePoolSelect(`
    where p.id = :poolId::uuid
      and p.neighbourhood_id = :neighbourhoodId::uuid
      and p.deleted_at is null
    limit 1
  `)}`;
  const values = {
    poolId,
    householdId: context.household.id,
    neighbourhoodId: context.neighbourhood.id,
  };
  const result = transaction
    ? await execTx<PoolRow>(transaction, sql, values)
    : await executeSql<PoolRow>({ sql, parameters: params(values) });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const bidsResult = transaction
    ? await execTx<BidRow>(
        transaction,
        `
          select
            b.id::text as id,
            b.status::text as status,
            m.name as merchant_name,
            b.price_cents,
            b.currency,
            b.available_quantity::text as available_quantity,
            b.pickup_window_start::text as pickup_window_start,
            b.pickup_window_end::text as pickup_window_end,
            b.terms,
            b.submitted_at::text as submitted_at
          from merchant_bids b
          join merchants m on m.id = b.merchant_id
          where b.demand_pool_id = :poolId::uuid
            and b.deleted_at is null
            and b.status in ('submitted', 'winning')
          order by b.price_cents asc, b.submitted_at asc
        `,
        { poolId },
      )
    : await executeSql<BidRow>({
        sql: `
          select
            b.id::text as id,
            b.status::text as status,
            m.name as merchant_name,
            b.price_cents,
            b.currency,
            b.available_quantity::text as available_quantity,
            b.pickup_window_start::text as pickup_window_start,
            b.pickup_window_end::text as pickup_window_end,
            b.terms,
            b.submitted_at::text as submitted_at
          from merchant_bids b
          join merchants m on m.id = b.merchant_id
          where b.demand_pool_id = :poolId::uuid
            and b.deleted_at is null
            and b.status in ('submitted', 'winning')
          order by b.price_cents asc, b.submitted_at asc
        `,
        parameters: params({ poolId }),
      });

  return demandPoolDtoFromRow(row, bidsResult.rows);
}

async function recomputePoolCounters(
  context: TransactionContext,
  pool: PoolLockRow,
) {
  const aggregate = await execTx<PoolAggregateRow>(
    context,
    `
      select
        coalesce(sum(quantity), 0)::text as committed_quantity,
        count(distinct household_id)::int as committed_households
      from demand_pool_commitments
      where demand_pool_id = :poolId::uuid
        and status = 'active'
    `,
    { poolId: pool.id },
  );
  const counts = aggregate.rows[0] ?? {
    committed_quantity: "0",
    committed_households: 0,
  };
  const nextStatus = nextPoolStatusAfterRecompute({
    currentStatus: pool.status,
    committedQuantity: Number.parseFloat(counts.committed_quantity),
    committedHouseholds: counts.committed_households,
    thresholdQuantity: Number.parseFloat(pool.threshold_quantity),
    thresholdHouseholds: pool.threshold_households,
  });

  await execTx(
    context,
    `
      update demand_pools
      set committed_quantity = :committedQuantity::numeric,
          committed_households = :committedHouseholds::int,
          status = :status::pool_status,
          bidding_opens_at = case
            when :status::pool_status in ('threshold_met', 'bidding') and bidding_opens_at is null
            then now()
            else bidding_opens_at
          end,
          updated_at = now()
      where id = :poolId::uuid
    `,
    {
      poolId: pool.id,
      committedQuantity: counts.committed_quantity,
      committedHouseholds: counts.committed_households,
      status: nextStatus,
    },
  );

  return {
    committedQuantity: counts.committed_quantity,
    committedHouseholds: counts.committed_households,
    status: nextStatus,
  };
}

async function lockPoolForMutation(
  context: TransactionContext,
  poolId: string,
  demoContext: DemoActorContext,
): Promise<PoolLockRow> {
  const result = await execTx<PoolLockRow>(
    context,
    `
      select
        id::text as id,
        status::text as status,
        title,
        unit,
        threshold_quantity::text as threshold_quantity,
        threshold_households,
        closes_at::text as closes_at
      from demand_pools
      where id = :poolId::uuid
        and neighbourhood_id = :neighbourhoodId::uuid
        and deleted_at is null
      for update
    `,
    { poolId, neighbourhoodId: demoContext.neighbourhood.id },
  );

  const pool = result.rows[0];
  if (!pool) {
    throw new DemandPoolRuntimeError(404, "DemandPool is not available.");
  }

  return pool;
}

async function writePoolAudit(
  context: TransactionContext,
  input: {
    actor: DemoActorContext;
    poolId: string;
    action: string;
    sourceRoute: string;
    idempotencyKey: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into audit_events (
        actor_user_id, actor_household_id, entity_type, entity_id, action,
        source, source_route, idempotency_key, before_state, after_state,
        metadata, demo_scope_id, is_demo
      )
      values (
        :actorUserId::uuid, :actorHouseholdId::uuid, 'demand_pool',
        :poolId::uuid, :action, 'api', :sourceRoute, :idempotencyKey,
        :beforeState::jsonb, :afterState::jsonb, :metadata::jsonb,
        :demoScope, true
      )
    `,
    {
      actorUserId: input.actor.user.id,
      actorHouseholdId: input.actor.household.id,
      poolId: input.poolId,
      action: input.action,
      sourceRoute: input.sourceRoute,
      idempotencyKey: input.idempotencyKey,
      beforeState: input.beforeState ?? {},
      afterState: input.afterState ?? {},
      metadata: input.metadata ?? {},
      demoScope: input.actor.demoScope,
    },
  );
}

export async function listDemandPools(context: DemoActorContext) {
  await ensureDemandPoolRuntimeAvailable();

  const result = await executeSql<PoolRow>({
    sql: `${basePoolSelect(`
      where p.neighbourhood_id = :neighbourhoodId::uuid
        and p.deleted_at is null
        and p.status in ('gathering', 'threshold_met', 'bidding', 'awarded', 'ready_for_pickup')
      order by
        case p.status
          when 'threshold_met' then 0
          when 'bidding' then 1
          when 'gathering' then 2
          else 3
        end,
        p.closes_at asc
    `)}`,
    parameters: params({
      householdId: context.household.id,
      neighbourhoodId: context.neighbourhood.id,
    }),
  });

  return {
    ok: true as const,
    pools: result.rows.map((row) => demandPoolDtoFromRow(row)),
    context: {
      household: context.household,
      neighbourhood: context.neighbourhood,
    },
  };
}

export async function getDemandPool(poolId: string, context: DemoActorContext) {
  await ensureDemandPoolRuntimeAvailable();

  const pool = await loadPoolDetail(poolId, context);
  if (!pool) {
    throw new DemandPoolRuntimeError(404, "DemandPool is not available.");
  }

  return {
    ok: true as const,
    pool,
  };
}

export async function createDemandPool(
  context: DemoActorContext,
  input: DemandPoolCreateInput,
): Promise<CreateDemandPoolResponse> {
  await ensureDemandPoolRuntimeAvailable();

  const scope = "demand_pool:create";
  const key = namespaceKey(
    scope,
    input.idempotencyKey ?? autoIdempotencyKey(scope, context, input),
  );
  const hash = requestHash({ contextHouseholdId: context.household.id, input });

  return withTransaction(async (transaction) => {
    const existing = await beginIdempotentMutation(transaction, key, scope, hash);
    if (existing) {
      return existing as CreateDemandPoolResponse;
    }

    const metadata = {
      ...input.metadata,
      requestedItems: input.requestedItems,
      maxPricePencePerHousehold: input.maxPricePencePerHousehold ?? null,
      pickupRadiusMeters: input.pickupRadiusMeters,
      paymentMode: "unpaid_demo_intent",
      paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
    };
    const thresholdQuantity = input.thresholdQuantity ?? input.thresholdHouseholds;
    const inserted = await execTx<{ id: string }>(
      transaction,
      `
        insert into demand_pools (
          neighbourhood_id, created_by_household_id, title, description,
          status, target_location, threshold_quantity, committed_quantity,
          threshold_households, committed_households, unit, opens_at,
          closes_at, metadata, demo_scope_id, is_demo
        )
        select
          :neighbourhoodId::uuid, h.id, :title, nullif(:description, ''),
          'gathering', h.home_location, :thresholdQuantity, 0,
          :thresholdHouseholds, 0, :unit, now(),
          :closesAt::timestamp with time zone, :metadata::jsonb,
          :demoScope, true
        from households h
        where h.id = :householdId::uuid
          and h.neighbourhood_id = :neighbourhoodId::uuid
          and h.deleted_at is null
        returning id::text as id
      `,
      {
        householdId: context.household.id,
        neighbourhoodId: context.neighbourhood.id,
        title: input.title,
        description: input.description ?? "",
        thresholdQuantity,
        thresholdHouseholds: input.thresholdHouseholds,
        unit: input.unit,
        closesAt: input.closesAt,
        metadata,
        demoScope: context.demoScope,
      },
    );

    const poolId = inserted.rows[0]?.id;
    if (!poolId) {
      throw new DemandPoolRuntimeError(404, "Demo household is not available for pool creation.");
    }

    const pool = await loadPoolDetail(poolId, context, transaction);
    if (!pool) {
      throw new DemandPoolRuntimeError(500, "Created DemandPool could not be loaded.");
    }

    const response = {
      ok: true as const,
      idempotent: false,
      pool,
    };

    await writePoolAudit(transaction, {
      actor: context,
      poolId,
      action: "created",
      sourceRoute: "/api/demand-pools",
      idempotencyKey: key,
      afterState: {
        status: pool.status,
        threshold: pool.threshold,
        committed: pool.committed,
      },
      metadata: { paymentMode: "unpaid_demo_intent" },
    });
    await completeIdempotentMutation(transaction, key, response);

    return response;
  });
}

export async function commitToDemandPool(
  poolId: string,
  context: DemoActorContext,
  input: DemandPoolCommitInput,
): Promise<CommitDemandPoolResponse> {
  await ensureDemandPoolRuntimeAvailable();

  const scope = "demand_pool:commit";
  const key = namespaceKey(
    scope,
    input.idempotencyKey ?? autoIdempotencyKey(scope, context, { poolId, input }),
  );
  const hash = requestHash({ contextHouseholdId: context.household.id, poolId, input });

  return withTransaction(async (transaction) => {
    const existing = await beginIdempotentMutation(transaction, key, scope, hash);
    if (existing) {
      return existing as CommitDemandPoolResponse;
    }

    const pool = await lockPoolForMutation(transaction, poolId, context);
    if (!["gathering", "threshold_met", "bidding"].includes(pool.status)) {
      throw new DemandPoolRuntimeError(409, `DemandPool is ${pool.status} and cannot accept commitments.`);
    }

    if (new Date(pool.closes_at).getTime() <= Date.now()) {
      throw new DemandPoolRuntimeError(409, "DemandPool has closed for new commitments.");
    }

    const metadata = {
      ...input.metadata,
      maxPricePence: input.maxPricePence ?? null,
      note: input.note ?? null,
      paymentMode: "unpaid_demo_intent",
      paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
    };

    await execTx(
      transaction,
      `
        insert into demand_pool_commitments (
          demand_pool_id, household_id, quantity, unit, status,
          idempotency_key, committed_at, cancelled_at, metadata,
          demo_scope_id, is_demo, created_at, updated_at
        )
        values (
          :poolId::uuid, :householdId::uuid, :quantity, :unit, 'active',
          :idempotencyKey, now(), null, :metadata::jsonb,
          :demoScope, true, now(), now()
        )
        on conflict (demand_pool_id, household_id)
        do update set
          quantity = excluded.quantity,
          unit = excluded.unit,
          status = 'active',
          idempotency_key = excluded.idempotency_key,
          committed_at = case
            when demand_pool_commitments.status = 'active'
            then demand_pool_commitments.committed_at
            else now()
          end,
          cancelled_at = null,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      {
        poolId,
        householdId: context.household.id,
        quantity: input.quantity,
        unit: pool.unit,
        idempotencyKey: key,
        metadata,
        demoScope: context.demoScope,
      },
    );

    const beforeState = {
      status: pool.status,
      thresholdQuantity: pool.threshold_quantity,
      thresholdHouseholds: pool.threshold_households,
    };
    const afterRecompute = await recomputePoolCounters(transaction, pool);
    const detail = await loadPoolDetail(poolId, context, transaction);
    if (!detail) {
      throw new DemandPoolRuntimeError(500, "Committed DemandPool could not be loaded.");
    }

    const response = {
      ok: true as const,
      idempotent: false,
      pool: detail,
      commitment: detail.currentHouseholdCommitment,
      thresholdTransitioned: pool.status !== afterRecompute.status,
    };

    await writePoolAudit(transaction, {
      actor: context,
      poolId,
      action: "commitment_upserted",
      sourceRoute: "/api/demand-pools/[poolId]/commit",
      idempotencyKey: key,
      beforeState,
      afterState: afterRecompute,
      metadata: { paymentMode: "unpaid_demo_intent" },
    });
    await completeIdempotentMutation(transaction, key, response);

    return response;
  });
}

export async function cancelDemandPoolCommitment(
  poolId: string,
  context: DemoActorContext,
  input: DemandPoolCancelCommitmentInput,
): Promise<CancelDemandPoolCommitmentResponse> {
  await ensureDemandPoolRuntimeAvailable();

  const scope = "demand_pool:cancel_commitment";
  const key = namespaceKey(
    scope,
    input.idempotencyKey ?? autoIdempotencyKey(scope, context, { poolId, input }),
  );
  const hash = requestHash({ contextHouseholdId: context.household.id, poolId, input });

  return withTransaction(async (transaction) => {
    const existing = await beginIdempotentMutation(transaction, key, scope, hash);
    if (existing) {
      return existing as CancelDemandPoolCommitmentResponse;
    }

    const pool = await lockPoolForMutation(transaction, poolId, context);
    if (!["gathering", "threshold_met", "bidding"].includes(pool.status)) {
      throw new DemandPoolRuntimeError(409, `DemandPool is ${pool.status} and commitments cannot be cancelled.`);
    }

    const existingCommitment = await execTx<CommitmentRow>(
      transaction,
      `
        select id::text as id, status::text as status
        from demand_pool_commitments
        where demand_pool_id = :poolId::uuid
          and household_id = :householdId::uuid
        for update
      `,
      { poolId, householdId: context.household.id },
    );

    const commitment = existingCommitment.rows[0];
    if (!commitment) {
      throw new DemandPoolRuntimeError(404, "No commitment exists for this household and pool.");
    }

    if (commitment.status === "active") {
      const metadata = {
        reason: input.reason ?? null,
        ...input.metadata,
        paymentMode: "unpaid_demo_intent",
        paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
      };
      await execTx(
        transaction,
        `
          update demand_pool_commitments
          set status = 'cancelled',
              cancelled_at = now(),
              idempotency_key = :idempotencyKey,
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :commitmentId::uuid
        `,
        {
          commitmentId: commitment.id,
          idempotencyKey: key,
          metadata,
        },
      );
    }

    const beforeState = { status: pool.status };
    const afterRecompute = await recomputePoolCounters(transaction, pool);
    const detail = await loadPoolDetail(poolId, context, transaction);
    if (!detail) {
      throw new DemandPoolRuntimeError(500, "Cancelled DemandPool could not be loaded.");
    }

    const response = {
      ok: true as const,
      idempotent: false,
      pool: detail,
      commitment: null,
      thresholdTransitioned: pool.status !== afterRecompute.status,
    };

    await writePoolAudit(transaction, {
      actor: context,
      poolId,
      action: "commitment_cancelled",
      sourceRoute: "/api/demand-pools/[poolId]/cancel-commitment",
      idempotencyKey: key,
      beforeState,
      afterState: afterRecompute,
      metadata: { paymentMode: "unpaid_demo_intent" },
    });
    await completeIdempotentMutation(transaction, key, response);

    return response;
  });
}

export async function listDemandPoolOrders(context: DemoActorContext) {
  await ensureDemandPoolRuntimeAvailable();

  const result = await executeSql<OrderRow>({
    sql: `
      select
        o.id::text as id,
        p.id::text as pool_id,
        p.title as pool_title,
        o.status::text as status,
        o.quantity::text as quantity,
        o.unit,
        o.price_cents,
        o.currency,
        m.id::text as merchant_id,
        m.name as merchant_name,
        ml.name as pickup_area_label,
        pt.id::text as pickup_task_id,
        pt.status::text as pickup_status,
        pt.coarse_pickup_label,
        coalesce(pt.pickup_window_start, o.pickup_window_start)::text as pickup_window_start,
        coalesce(pt.pickup_window_end, o.pickup_window_end)::text as pickup_window_end,
        coalesce(pt.ready_at, o.ready_at)::text as ready_at,
        coalesce(pt.collected_at, o.collected_at)::text as collected_at,
        o.fulfilled_at::text as fulfilled_at,
        o.cancelled_at::text as cancelled_at,
        o.created_at::text as created_at,
        o.updated_at::text as updated_at
      from pool_orders o
      join demand_pools p on p.id = o.demand_pool_id
      left join merchants m on m.id = o.merchant_id
      left join merchant_locations ml on ml.id = o.merchant_location_id
      left join pickup_tasks pt on pt.pool_order_id = o.id
      where o.household_id = :householdId::uuid
        and o.deleted_at is null
      order by o.created_at desc
    `,
    parameters: params({ householdId: context.household.id }),
  });

  return {
    ok: true as const,
    orders: result.rows.map((row): DemandPoolOrderDto => ({
      id: row.id,
      poolId: row.pool_id,
      poolTitle: row.pool_title,
      status: row.status as DemandPoolOrderDto["status"],
      quantity: row.quantity,
      unit: row.unit,
      priceCents: row.price_cents,
      currency: row.currency,
      merchant: {
        id: row.merchant_id,
        name: row.merchant_name,
        pickupAreaLabel: row.pickup_area_label,
      },
      pickup: {
        taskId: row.pickup_task_id,
        status: row.pickup_status as DemandPoolOrderDto["pickup"]["status"],
        coarsePickupLabel: row.coarse_pickup_label,
        pickupWindowStart: row.pickup_window_start,
        pickupWindowEnd: row.pickup_window_end,
        readyAt: row.ready_at,
        collectedAt: row.collected_at,
      },
      timeline: {
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fulfilledAt: row.fulfilled_at,
        cancelledAt: row.cancelled_at,
      },
      paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
    })),
    paymentNotice: DEMAND_POOL_PAYMENT_NOTICE,
  };
}
