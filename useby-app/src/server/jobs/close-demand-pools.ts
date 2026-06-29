import { recordAuditEvent } from "../audit/events";
import { awardDemandPool } from "../demand-pools/award";
import {
  CP6_BASE_TABLE_CONTRACTS,
  checkCp6Contracts,
  unavailableCp6Reason,
} from "../demand-pools/contracts";
import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import { makeJobIdempotencyKey } from "./runs";

export type CloseDemandPoolsJobInput = {
  source: string;
  neighbourhoodId?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
};

export type CloseDemandPoolsJobResult = {
  status: "succeeded" | "unavailable" | "failed";
  jobType: "close-demand-pools";
  idempotencyKey: string;
  windowStart: string;
  recorded: boolean;
  jobRunId?: string | null;
  refreshedPools?: number;
  openedForBidding?: number;
  expiredPools?: number;
  awards?: {
    attempted: number;
    awarded: number;
    skipped: number;
    unavailable: number;
    failed: number;
    ordersCreated: number;
    pickupTasksCreated: number;
  };
  auditRecorded?: boolean;
  reason?: string;
};

type PoolIdRow = {
  id: string;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function currentWindowStart(now = new Date()): string {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  return windowStart.toISOString();
}

async function ensureJobRunAvailable(): Promise<string | null> {
  const availability = await getTableAvailability(SYSTEM_TABLES.jobRuns);
  const missing = ASSUMED_SYSTEM_COLUMNS.jobRuns.filter(
    (column) => !availability.columns.has(column),
  );

  if (!availability.exists) {
    return "job_runs table is not available";
  }

  if (missing.length > 0) {
    return `job_runs missing columns: ${missing.join(", ")}`;
  }

  return null;
}

async function upsertJobRun(input: {
  idempotencyKey: string;
  windowStart: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  source: string;
  neighbourhoodId?: string | null;
  summary: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<string | null> {
  const result = await executeSql<{ id: string }>({
    sql: `
      insert into job_runs (
        job_type,
        status,
        neighbourhood_id,
        idempotency_key,
        window_start,
        started_at,
        finished_at,
        summary,
        error_message
      )
      values (
        'close-demand-pools',
        :status::job_run_status,
        nullif(:neighbourhoodId, '')::uuid,
        :idempotencyKey,
        :windowStart::timestamp with time zone,
        now(),
        case when :status = 'started' then null else now() end,
        :summary::jsonb,
        nullif(:errorMessage, '')
      )
      on conflict (idempotency_key) where idempotency_key is not null do update set
        status = excluded.status,
        neighbourhood_id = excluded.neighbourhood_id,
        finished_at = excluded.finished_at,
        summary = excluded.summary,
        error_message = excluded.error_message
      returning id::text as id
    `,
    parameters: params({
      status: input.status,
      neighbourhoodId: input.neighbourhoodId ?? "",
      idempotencyKey: input.idempotencyKey,
      windowStart: input.windowStart,
      summary: {
        ...input.summary,
        source: input.source,
      },
      errorMessage: input.errorMessage ?? "",
    }),
  });

  return result.rows[0]?.id ?? null;
}

async function refreshCommittedAggregates(input: {
  neighbourhoodId?: string | null;
}): Promise<number> {
  const result = await executeSql({
    sql: `
      with aggregate as (
        select
          p.id,
          coalesce(sum(c.quantity), 0) as committed_quantity,
          count(distinct c.household_id)::int as committed_households
        from demand_pools p
        left join demand_pool_commitments c
          on c.demand_pool_id = p.id
          and c.status = 'active'
        where p.deleted_at is null
          and p.status in ('gathering', 'threshold_met', 'bidding')
          and (:neighbourhoodId = '' or p.neighbourhood_id = :neighbourhoodId::uuid)
        group by p.id
      )
      update demand_pools p
      set
        committed_quantity = aggregate.committed_quantity,
        committed_households = aggregate.committed_households,
        updated_at = now()
      from aggregate
      where p.id = aggregate.id
        and (
          p.committed_quantity <> aggregate.committed_quantity
          or p.committed_households <> aggregate.committed_households
        )
    `,
    parameters: params({ neighbourhoodId: input.neighbourhoodId ?? "" }),
  });

  return result.recordsUpdated;
}

async function openThresholdPools(input: {
  neighbourhoodId?: string | null;
}): Promise<number> {
  const result = await executeSql({
    sql: `
      update demand_pools
      set
        status = 'bidding',
        bidding_opens_at = coalesce(bidding_opens_at, now()),
        updated_at = now()
      where deleted_at is null
        and status in ('gathering', 'threshold_met')
        and committed_quantity >= threshold_quantity
        and committed_households >= threshold_households
        and (:neighbourhoodId = '' or neighbourhood_id = :neighbourhoodId::uuid)
    `,
    parameters: params({ neighbourhoodId: input.neighbourhoodId ?? "" }),
  });

  return result.recordsUpdated;
}

async function expireBelowThresholdPools(input: {
  neighbourhoodId?: string | null;
  now: string;
}): Promise<number> {
  const result = await executeSql({
    sql: `
      update demand_pools
      set status = 'expired', updated_at = now()
      where deleted_at is null
        and status in ('gathering', 'threshold_met', 'bidding')
        and closes_at <= :now::timestamp with time zone
        and awarded_bid_id is null
        and (
          committed_quantity < threshold_quantity
          or committed_households < threshold_households
        )
        and (:neighbourhoodId = '' or neighbourhood_id = :neighbourhoodId::uuid)
    `,
    parameters: params({
      neighbourhoodId: input.neighbourhoodId ?? "",
      now: input.now,
    }),
  });

  return result.recordsUpdated;
}

async function awardablePoolIds(input: {
  neighbourhoodId?: string | null;
  now: string;
}) {
  const result = await executeSql<PoolIdRow>({
    sql: `
      select p.id::text as id
      from demand_pools p
      where p.deleted_at is null
        and p.status in ('threshold_met', 'bidding')
        and p.awarded_bid_id is null
        and p.committed_quantity >= p.threshold_quantity
        and p.committed_households >= p.threshold_households
        and exists (
          select 1
          from merchant_bids b
          where b.demand_pool_id = p.id
            and b.status = 'submitted'
            and b.deleted_at is null
        )
        and (
          p.closes_at <= :now::timestamp with time zone
          or p.status = 'bidding'
        )
        and (:neighbourhoodId = '' or p.neighbourhood_id = :neighbourhoodId::uuid)
      order by p.closes_at asc, p.created_at asc
    `,
    parameters: params({
      neighbourhoodId: input.neighbourhoodId ?? "",
      now: input.now,
    }),
  });

  return result.rows.map((row) => row.id);
}

export async function runCloseDemandPoolsJob(
  input: CloseDemandPoolsJobInput,
): Promise<CloseDemandPoolsJobResult> {
  const env = loadRuntimeEnv();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const windowStart = currentWindowStart(now);
  const idempotencyKey =
    input.idempotencyKey ??
    makeJobIdempotencyKey(
      "close-demand-pools",
      input.neighbourhoodId ?? "system",
      windowStart,
    );

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      jobType: "close-demand-pools",
      idempotencyKey,
      windowStart,
      recorded: false,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const jobRunUnavailable = await ensureJobRunAvailable();
    if (jobRunUnavailable) {
      return {
        status: "unavailable",
        jobType: "close-demand-pools",
        idempotencyKey,
        windowStart,
        recorded: false,
        reason: jobRunUnavailable,
      };
    }

    const contracts = await checkCp6Contracts(CP6_BASE_TABLE_CONTRACTS);
    if (!contracts.available) {
      const reason = unavailableCp6Reason(contracts);
      const jobRunId = await upsertJobRun({
        idempotencyKey,
        windowStart,
        status: "skipped",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 6,
          unavailable: true,
          reason,
        },
        errorMessage: reason,
      });
      const audit = await recordAuditEvent({
        eventType: "system.job.unavailable",
        actorType: "job",
        source: input.source,
        entityType: "job_run",
        entityId: jobRunId,
        idempotencyKey,
        metadata: {
          jobType: "close-demand-pools",
          checkpoint: 6,
          reason,
        },
      });

      return {
        status: "unavailable",
        jobType: "close-demand-pools",
        idempotencyKey,
        windowStart,
        recorded: true,
        jobRunId,
        auditRecorded: audit.recorded,
        reason,
      };
    }

    const startedJobRunId = await upsertJobRun({
      idempotencyKey,
      windowStart,
      status: "started",
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 6,
        scope: {
          neighbourhoodId: input.neighbourhoodId ?? null,
        },
      },
    });

    const refreshedPools = await refreshCommittedAggregates(input);
    const openedForBidding = await openThresholdPools(input);
    const expiredPools = await expireBelowThresholdPools({
      neighbourhoodId: input.neighbourhoodId,
      now: nowIso,
    });
    const candidatePoolIds = await awardablePoolIds({
      neighbourhoodId: input.neighbourhoodId,
      now: nowIso,
    });

    const awardResults = [];
    for (const poolId of candidatePoolIds) {
      awardResults.push(
        await awardDemandPool(poolId, {
          source: input.source,
          jobRunId: startedJobRunId,
          now,
        }),
      );
    }

    const awardSummary = {
      attempted: awardResults.length,
      awarded: awardResults.filter((result) => result.status === "awarded").length,
      skipped: awardResults.filter((result) => result.status === "skipped").length,
      unavailable: awardResults.filter((result) => result.status === "unavailable").length,
      failed: awardResults.filter((result) => result.status === "failed").length,
      ordersCreated: awardResults.reduce((total, result) => total + result.ordersCreated, 0),
      pickupTasksCreated: awardResults.reduce(
        (total, result) => total + result.pickupTasksCreated,
        0,
      ),
    };

    const firstProblem = awardResults.find(
      (result) => result.status === "unavailable" || result.status === "failed",
    );
    const finalStatus = firstProblem?.status === "failed"
      ? "failed"
      : firstProblem?.status === "unavailable"
        ? "skipped"
        : "succeeded";
    const resultStatus = firstProblem?.status === "failed"
      ? "failed"
      : firstProblem?.status === "unavailable"
        ? "unavailable"
        : "succeeded";

    const finishedJobRunId = await upsertJobRun({
      idempotencyKey,
      windowStart,
      status: finalStatus,
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 6,
        refreshedPools,
        openedForBidding,
        expiredPools,
        awards: awardSummary,
        awardResults: awardResults.map((result) => ({
          status: result.status,
          poolId: result.poolId,
          awardedBidId: result.awardedBidId ?? null,
          ordersCreated: result.ordersCreated,
          pickupTasksCreated: result.pickupTasksCreated,
          reason: result.reason ?? null,
        })),
      },
      errorMessage: firstProblem?.reason ?? null,
    });

    const audit = await recordAuditEvent({
      eventType:
        resultStatus === "succeeded"
          ? "system.job.completed"
          : resultStatus === "unavailable"
            ? "system.job.unavailable"
            : "system.job.failed",
      actorType: "job",
      source: input.source,
      entityType: "job_run",
      entityId: finishedJobRunId,
      idempotencyKey,
      metadata: {
        jobType: "close-demand-pools",
        checkpoint: 6,
        refreshedPools,
        openedForBidding,
        expiredPools,
        awards: awardSummary,
      },
    });

    return {
      status: resultStatus,
      jobType: "close-demand-pools",
      idempotencyKey,
      windowStart,
      recorded: true,
      jobRunId: finishedJobRunId,
      refreshedPools,
      openedForBidding,
      expiredPools,
      awards: awardSummary,
      auditRecorded: audit.recorded,
      reason: firstProblem?.reason,
    };
  } catch (error) {
    const reason = publicErrorMessage(error);
    let jobRunId: string | null = null;
    try {
      jobRunId = await upsertJobRun({
        idempotencyKey,
        windowStart,
        status: "failed",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 6,
          failed: true,
        },
        errorMessage: reason,
      });
      await recordAuditEvent({
        eventType: "system.job.failed",
        actorType: "job",
        source: input.source,
        entityType: "job_run",
        entityId: jobRunId,
        idempotencyKey,
        metadata: {
          jobType: "close-demand-pools",
          checkpoint: 6,
          reason,
        },
      });
    } catch {
      // Preserve the original job failure for public callers.
    }

    return {
      status: "failed",
      jobType: "close-demand-pools",
      idempotencyKey,
      windowStart,
      recorded: Boolean(jobRunId),
      jobRunId,
      reason,
    };
  }
}
