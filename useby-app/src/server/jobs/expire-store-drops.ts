import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import {
  CP7_STORE_DROP_TABLE_CONTRACTS,
  checkTableContracts,
  unavailableStoreDropReason,
} from "../store-drops/contracts";
import { makeJobIdempotencyKey } from "./runs";

export type ExpireStoreDropsJobInput = {
  source: string;
  neighbourhoodId?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
};

export type ExpireStoreDropsJobResult = {
  status: "succeeded" | "unavailable" | "failed";
  jobType: "expire-store-drops";
  idempotencyKey: string;
  windowStart: string;
  recorded: boolean;
  jobRunId?: string | null;
  expiredDrops?: number;
  staleReservationsReleased?: number;
  dropReservationsReleased?: number;
  auditRecorded?: boolean;
  reason?: string;
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
        'expire-store-drops',
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

async function writeJobAudit(
  context: TransactionContext,
  input: {
    jobRunId: string | null;
    action: string;
    idempotencyKey: string;
    source: string;
    metadata: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into audit_events (
        job_run_id, entity_type, entity_id, action, source, source_route,
        idempotency_key, after_state, metadata, demo_scope_id, is_demo
      )
      values (
        nullif(:jobRunId, '')::uuid, 'job_run', nullif(:jobRunId, '')::uuid,
        :action, 'job', :source, :idempotencyKey,
        :afterState::jsonb, :metadata::jsonb, :demoScope, true
      )
    `,
    {
      jobRunId: input.jobRunId ?? "",
      action: input.action,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      afterState: input.metadata,
      metadata: {
        ...input.metadata,
        jobType: "expire-store-drops",
        checkpoint: 7,
      },
      demoScope: "riverside-quarter",
    },
  );
}

async function runExpiryMutations(
  input: ExpireStoreDropsJobInput & {
    nowIso: string;
    jobRunId: string | null;
    idempotencyKey: string;
  },
) {
  return withTransaction(async (transaction) => {
    const expiredDrops = await execTx<{ id: string }>(
      transaction,
      `
        update store_drops
        set
          status = 'expired',
          updated_at = now()
        where deleted_at is null
          and status in ('draft', 'published', 'paused')
          and coalesce(expires_at, pickup_window_end) <= :now::timestamp with time zone
          and (:neighbourhoodId = '' or neighbourhood_id = :neighbourhoodId::uuid)
        returning id::text as id
      `,
      {
        now: input.nowIso,
        neighbourhoodId: input.neighbourhoodId ?? "",
      },
    );

    const staleReservations = await execTx<{ id: string }>(
      transaction,
      `
        update store_drop_reservations
        set
          status = 'expired',
          released_at = coalesce(released_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb,
          updated_at = now()
        where status = 'active'
          and expires_at is not null
          and expires_at <= :now::timestamp with time zone
          and exists (
            select 1
            from store_drops d
            where d.id = store_drop_reservations.store_drop_id
              and (:neighbourhoodId = '' or d.neighbourhood_id = :neighbourhoodId::uuid)
          )
        returning id::text as id
      `,
      {
        now: input.nowIso,
        neighbourhoodId: input.neighbourhoodId ?? "",
        metadata: {
          releaseReason: "reservation_expired",
          jobRunId: input.jobRunId,
        },
      },
    );

    const dropReservations = await execTx<{ id: string }>(
      transaction,
      `
        update store_drop_reservations r
        set
          status = 'released',
          released_at = coalesce(r.released_at, now()),
          metadata = coalesce(r.metadata, '{}'::jsonb) || :metadata::jsonb,
          updated_at = now()
        from store_drops d
        where r.store_drop_id = d.id
          and r.status = 'active'
          and d.status in ('expired', 'closed', 'deleted')
          and (:neighbourhoodId = '' or d.neighbourhood_id = :neighbourhoodId::uuid)
        returning r.id::text as id
      `,
      {
        neighbourhoodId: input.neighbourhoodId ?? "",
        metadata: {
          releaseReason: "drop_unavailable",
          jobRunId: input.jobRunId,
        },
      },
    );

    const summary = {
      expiredDrops: expiredDrops.rows.length,
      staleReservationsReleased: staleReservations.rows.length,
      dropReservationsReleased: dropReservations.rows.length,
      neighbourhoodId: input.neighbourhoodId ?? null,
    };

    await writeJobAudit(transaction, {
      jobRunId: input.jobRunId,
      action: "store_drop.expiry_job.completed",
      idempotencyKey: input.idempotencyKey,
      source: input.source,
      metadata: summary,
    });

    return summary;
  });
}

export async function runExpireStoreDropsJob(
  input: ExpireStoreDropsJobInput,
): Promise<ExpireStoreDropsJobResult> {
  const env = loadRuntimeEnv();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const windowStart = currentWindowStart(now);
  const idempotencyKey =
    input.idempotencyKey ??
    makeJobIdempotencyKey(
      "expire-store-drops",
      input.neighbourhoodId ?? "system",
      windowStart,
    );

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      jobType: "expire-store-drops",
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
        jobType: "expire-store-drops",
        idempotencyKey,
        windowStart,
        recorded: false,
        reason: jobRunUnavailable,
      };
    }

    const contracts = await checkTableContracts(CP7_STORE_DROP_TABLE_CONTRACTS);
    if (!contracts.available) {
      const reason = unavailableStoreDropReason(contracts);
      const jobRunId = await upsertJobRun({
        idempotencyKey,
        windowStart,
        status: "skipped",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 7,
          unavailable: true,
          reason,
        },
        errorMessage: reason,
      });

      return {
        status: "unavailable",
        jobType: "expire-store-drops",
        idempotencyKey,
        windowStart,
        recorded: true,
        jobRunId,
        auditRecorded: false,
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
        checkpoint: 7,
        scope: {
          neighbourhoodId: input.neighbourhoodId ?? null,
        },
      },
    });

    const summary = await runExpiryMutations({
      ...input,
      nowIso,
      jobRunId: startedJobRunId,
      idempotencyKey,
    });

    const finishedJobRunId = await upsertJobRun({
      idempotencyKey,
      windowStart,
      status: "succeeded",
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 7,
        ...summary,
      },
    });

    return {
      status: "succeeded",
      jobType: "expire-store-drops",
      idempotencyKey,
      windowStart,
      recorded: true,
      jobRunId: finishedJobRunId,
      expiredDrops: summary.expiredDrops,
      staleReservationsReleased: summary.staleReservationsReleased,
      dropReservationsReleased: summary.dropReservationsReleased,
      auditRecorded: true,
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
          checkpoint: 7,
          failed: true,
        },
        errorMessage: reason,
      });
    } catch {
      // Preserve the original job failure for public callers.
    }

    return {
      status: "failed",
      jobType: "expire-store-drops",
      idempotencyKey,
      windowStart,
      recorded: Boolean(jobRunId),
      jobRunId,
      reason,
    };
  }
}

