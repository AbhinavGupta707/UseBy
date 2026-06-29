import {
  CP6_BASE_TABLE_CONTRACTS,
  CP6_OUTPUT_TABLE_CONTRACTS,
  checkCp6Contracts,
  unavailableCp6Reason,
} from "./contracts";
import {
  scoreMerchantBids,
  type AwardBidInput,
  type AwardPoolInput,
  type ScoredBid,
} from "./scoring";
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

export type AwardDemandPoolResult = {
  status: "awarded" | "skipped" | "unavailable" | "failed";
  poolId: string;
  awardedBidId?: string | null;
  winningMerchantId?: string | null;
  scoredBids: ScoredBid[];
  ordersCreated: number;
  pickupTasksCreated: number;
  reason?: string;
};

export class AwardRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AwardRuntimeError";
    this.status = status;
  }
}

type AwardPoolRow = {
  id: string;
  status: string;
  committed_quantity: string;
  committed_households: number;
  threshold_quantity: string;
  threshold_households: number;
  closes_at: string;
  metadata: unknown;
  awarded_bid_id: string | null;
};

type AwardBidRow = {
  id: string;
  merchant_id: string;
  merchant_location_id: string | null;
  price_cents: number;
  min_quantity: string;
  available_quantity: string;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  terms: string | null;
  submitted_at: string | null;
  metadata: unknown;
  distance_meters: number | null;
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

function scoringBidFromRow(row: AwardBidRow): AwardBidInput {
  const metadata = metadataObject(row.metadata);
  const reliabilityScore = numberFrom(metadata.reliabilityScore, Number.NaN);
  const substitutionQuality = numberFrom(metadata.substitutionQuality, Number.NaN);
  const substitutionPolicy =
    typeof metadata.substitutionPolicy === "string"
      ? metadata.substitutionPolicy
      : "";

  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantLocationId: row.merchant_location_id,
    priceCents: row.price_cents,
    minQuantity: numberFrom(row.min_quantity),
    availableQuantity: numberFrom(row.available_quantity),
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    distanceMeters: row.distance_meters,
    reliabilityScore: Number.isFinite(reliabilityScore) ? reliabilityScore : null,
    substitutionQuality: Number.isFinite(substitutionQuality)
      ? substitutionQuality
      : null,
    terms: [row.terms, substitutionPolicy].filter(Boolean).join(" "),
    submittedAt: row.submitted_at,
  };
}

function scoringPoolFromRow(row: AwardPoolRow): AwardPoolInput {
  const metadata = metadataObject(row.metadata);
  return {
    id: row.id,
    committedQuantity: numberFrom(row.committed_quantity),
    committedHouseholds: row.committed_households,
    thresholdQuantity: numberFrom(row.threshold_quantity),
    thresholdHouseholds: row.threshold_households,
    maxPriceCents: numberFrom(metadata.maxPricePencePerHousehold, 0) || null,
    pickupRadiusMeters: numberFrom(metadata.pickupRadiusMeters, 0) || null,
    closesAt: row.closes_at,
  };
}

export async function ensureAwardRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return `Aurora env missing: ${env.missing.join(", ")}`;
  }

  const contracts = await checkCp6Contracts([
    ...CP6_BASE_TABLE_CONTRACTS,
    ...CP6_OUTPUT_TABLE_CONTRACTS,
  ]);
  return contracts.available ? null : unavailableCp6Reason(contracts);
}

export async function awardDemandPool(
  poolId: string,
  input: {
    source: string;
    jobRunId?: string | null;
    now?: Date;
  },
): Promise<AwardDemandPoolResult> {
  const unavailable = await ensureAwardRuntimeAvailable();
  if (unavailable) {
    return {
      status: "unavailable",
      poolId,
      scoredBids: [],
      ordersCreated: 0,
      pickupTasksCreated: 0,
      reason: unavailable,
    };
  }

  try {
    return await withTransaction(async (transaction) => {
      const poolResult = await execTx<AwardPoolRow>(
        transaction,
        `
          select
            id::text,
            status::text,
            committed_quantity::text,
            committed_households,
            threshold_quantity::text,
            threshold_households,
            closes_at::text,
            metadata,
            awarded_bid_id::text
          from demand_pools
          where id = :poolId::uuid
            and deleted_at is null
          for update
        `,
        { poolId },
      );

      const pool = poolResult.rows[0];
      if (!pool) {
        return {
          status: "skipped" as const,
          poolId,
          scoredBids: [],
          ordersCreated: 0,
          pickupTasksCreated: 0,
          reason: "Demand pool was not found.",
        };
      }

      if (pool.awarded_bid_id || pool.status === "awarded") {
        return {
          status: "skipped" as const,
          poolId,
          awardedBidId: pool.awarded_bid_id,
          scoredBids: [],
          ordersCreated: 0,
          pickupTasksCreated: 0,
          reason: "Demand pool is already awarded.",
        };
      }

      if (!["threshold_met", "bidding"].includes(pool.status)) {
        return {
          status: "skipped" as const,
          poolId,
          scoredBids: [],
          ordersCreated: 0,
          pickupTasksCreated: 0,
          reason: `Demand pool status is ${pool.status}.`,
        };
      }

      const aggregate = await execTx<{
        committed_quantity: string;
        committed_households: number;
      }>(
        transaction,
        `
          select
            coalesce(sum(quantity), 0)::text as committed_quantity,
            count(distinct household_id)::int as committed_households
          from demand_pool_commitments
          where demand_pool_id = :poolId::uuid
            and status = 'active'
        `,
        { poolId },
      );
      const aggregateRow = aggregate.rows[0];
      const refreshedPool = {
        ...pool,
        committed_quantity: aggregateRow?.committed_quantity ?? pool.committed_quantity,
        committed_households: aggregateRow?.committed_households ?? pool.committed_households,
      };
      const scoringPool = scoringPoolFromRow(refreshedPool);

      if (
        scoringPool.committedQuantity < scoringPool.thresholdQuantity ||
        scoringPool.committedHouseholds < scoringPool.thresholdHouseholds
      ) {
        return {
          status: "skipped" as const,
          poolId,
          scoredBids: [],
          ordersCreated: 0,
          pickupTasksCreated: 0,
          reason: "Demand pool is below threshold.",
        };
      }

      const bidResult = await execTx<AwardBidRow>(
        transaction,
        `
          select
            b.id::text,
            b.merchant_id::text,
            b.merchant_location_id::text,
            b.price_cents,
            b.min_quantity::text,
            b.available_quantity::text,
            b.pickup_window_start::text,
            b.pickup_window_end::text,
            b.terms,
            b.submitted_at::text,
            b.metadata,
            ST_Distance(ml.location, p.target_location)::float as distance_meters
          from merchant_bids b
          join demand_pools p on p.id = b.demand_pool_id
          left join merchant_locations ml on ml.id = b.merchant_location_id
          where b.demand_pool_id = :poolId::uuid
            and b.status = 'submitted'
            and b.deleted_at is null
          order by b.submitted_at asc
          for update of b
        `,
        { poolId },
      );

      const scoredBids = scoreMerchantBids(
        scoringPool,
        bidResult.rows.map(scoringBidFromRow),
      );
      const winner = scoredBids[0];
      if (!winner) {
        return {
          status: "skipped" as const,
          poolId,
          scoredBids,
          ordersCreated: 0,
          pickupTasksCreated: 0,
          reason: "No submitted merchant bids are available.",
        };
      }

      for (const bid of scoredBids) {
        await execTx(
          transaction,
          `
            update merchant_bids
            set
              score = :score,
              metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb,
              updated_at = now()
            where id = :bidId::uuid
          `,
          {
            bidId: bid.id,
            score: bid.score,
            metadata: {
              scoring: {
                rank: bid.rank,
                score: bid.score,
                components: bid.components,
              },
            },
          },
        );
      }

      await execTx(
        transaction,
        `
          update merchant_bids
          set status = 'winning', awarded_at = now(), updated_at = now()
          where id = :winningBidId::uuid
        `,
        { winningBidId: winner.id },
      );

      await execTx(
        transaction,
        `
          update merchant_bids
          set status = 'rejected', updated_at = now()
          where demand_pool_id = :poolId::uuid
            and id <> :winningBidId::uuid
            and status = 'submitted'
        `,
        { poolId, winningBidId: winner.id },
      );

      await execTx(
        transaction,
        `
          update demand_pools
          set
            status = 'awarded',
            awarded_bid_id = :winningBidId::uuid,
            awarded_at = now(),
            committed_quantity = :committedQuantity,
            committed_households = :committedHouseholds,
            updated_at = now()
          where id = :poolId::uuid
        `,
        {
          poolId,
          winningBidId: winner.id,
          committedQuantity: scoringPool.committedQuantity,
          committedHouseholds: scoringPool.committedHouseholds,
        },
      );

      const orderResult = await execTx<{ id: string }>(
        transaction,
        `
          insert into pool_orders (
            demand_pool_id, commitment_id, household_id, merchant_id,
            merchant_bid_id, status, quantity, unit, price_cents, currency,
            coarse_pickup_hint, metadata, demo_scope_id, is_demo
          )
          select
            c.demand_pool_id,
            c.id,
            c.household_id,
            :merchantId::uuid,
            :winningBidId::uuid,
            'awarded',
            c.quantity,
            c.unit,
            :priceCents,
            'GBP',
            ml.public_address,
            jsonb_build_object(
              'source', :source,
              'payment', 'deferred_demo_no_charge',
              'scoring', :scoring::jsonb
            ),
            c.demo_scope_id,
            c.is_demo
          from demand_pool_commitments c
          join merchant_bids b on b.id = :winningBidId::uuid
          left join merchant_locations ml on ml.id = b.merchant_location_id
          left join pool_orders existing on existing.commitment_id = c.id
          where c.demand_pool_id = :poolId::uuid
            and c.status = 'active'
            and existing.id is null
          returning id::text as id
        `,
        {
          poolId,
          merchantId: winner.merchantId,
          winningBidId: winner.id,
          priceCents: winner.priceCents,
          source: input.source,
          scoring: {
            winner: winner.id,
            bids: scoredBids.map((bid) => ({
              id: bid.id,
              rank: bid.rank,
              score: bid.score,
              components: bid.components,
            })),
          },
        },
      );

      const pickupResult = await execTx<{ id: string }>(
        transaction,
        `
          insert into pickup_tasks (
            pool_order_id, demand_pool_id, merchant_id, merchant_location_id,
            status, window_start, window_end, coarse_pickup_hint, metadata,
            demo_scope_id, is_demo
          )
          select
            po.id,
            po.demand_pool_id,
            po.merchant_id,
            b.merchant_location_id,
            'awarded',
            b.pickup_window_start,
            b.pickup_window_end,
            po.coarse_pickup_hint,
            jsonb_build_object(
              'source', :source,
              'payment', 'deferred_demo_no_charge'
            ),
            po.demo_scope_id,
            po.is_demo
          from pool_orders po
          join merchant_bids b on b.id = po.merchant_bid_id
          left join pickup_tasks existing on existing.pool_order_id = po.id
          where po.demand_pool_id = :poolId::uuid
            and po.merchant_bid_id = :winningBidId::uuid
            and existing.id is null
          returning id::text as id
        `,
        { poolId, winningBidId: winner.id, source: input.source },
      );

      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, job_run_id, entity_type, entity_id, action,
            source, source_route, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, nullif(:jobRunId, '')::uuid, 'demand_pool',
            :poolId::uuid, 'demand_pool.awarded', 'job', :source,
            :afterState::jsonb, :metadata::jsonb,
            (select demo_scope_id from demand_pools where id = :poolId::uuid),
            true
          )
        `,
        {
          merchantId: winner.merchantId,
          jobRunId: input.jobRunId ?? "",
          poolId,
          source: input.source,
          afterState: {
            status: "awarded",
            awardedBidId: winner.id,
          },
          metadata: {
            payment: "deferred_demo_no_charge",
            scoredBids: scoredBids.map((bid) => ({
              id: bid.id,
              rank: bid.rank,
              score: bid.score,
            })),
          },
        },
      );

      return {
        status: "awarded" as const,
        poolId,
        awardedBidId: winner.id,
        winningMerchantId: winner.merchantId,
        scoredBids,
        ordersCreated: orderResult.rows.length,
        pickupTasksCreated: pickupResult.rows.length,
      };
    });
  } catch (error) {
    if (error instanceof AwardRuntimeError) {
      return {
        status: "failed",
        poolId,
        scoredBids: [],
        ordersCreated: 0,
        pickupTasksCreated: 0,
        reason: error.message,
      };
    }

    return {
      status: "failed",
      poolId,
      scoredBids: [],
      ordersCreated: 0,
      pickupTasksCreated: 0,
      reason: publicErrorMessage(error),
    };
  }
}
