import { recordAuditEvent } from "../audit/events";
import {
  ACTION_CARDS_CONTRACT,
  CP2_INPUT_CONTRACTS,
  MATCHES_CONTRACT,
  checkCp2Contracts,
  unavailableCp2Reason,
} from "../actions/contracts";
import {
  recomputeActionCards,
  type RecomputeScope,
} from "../actions/recompute";
import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import { recomputeGroceryMatches } from "../matching/recompute";
import { makeJobIdempotencyKey } from "./runs";

export type RecomputeMatchesJobInput = RecomputeScope & {
  source: string;
  idempotencyKey?: string | null;
  now?: Date;
};

export type RecomputeMatchesJobResult = {
  status: "succeeded" | "unavailable" | "failed";
  jobType: "recompute-matches";
  idempotencyKey: string;
  windowStart: string;
  recorded: boolean;
  jobRunId?: string | null;
  actionCards?: {
    generated: number;
    deleted: number;
  };
  matches?: {
    generated: number;
    deleted: number;
  };
  auditRecorded?: boolean;
  reason?: string;
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
        'recompute-matches',
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

export async function runRecomputeMatchesJob(
  input: RecomputeMatchesJobInput,
): Promise<RecomputeMatchesJobResult> {
  const env = loadRuntimeEnv();
  const windowStart = currentWindowStart(input.now);
  const idempotencyKey =
    input.idempotencyKey ??
    makeJobIdempotencyKey(
      "recompute-matches",
      input.neighbourhoodId ?? "system",
      windowStart,
    );

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      jobType: "recompute-matches",
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
        jobType: "recompute-matches",
        idempotencyKey,
        windowStart,
        recorded: false,
        reason: jobRunUnavailable,
      };
    }

    const contracts = await checkCp2Contracts([
      ...CP2_INPUT_CONTRACTS,
      ACTION_CARDS_CONTRACT,
      MATCHES_CONTRACT,
    ]);

    if (!contracts.available) {
      const reason = unavailableCp2Reason(contracts);
      const jobRunId = await upsertJobRun({
        idempotencyKey,
        windowStart,
        status: "skipped",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 2,
          unavailable: true,
          missing: contracts.missing,
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
          jobType: "recompute-matches",
          checkpoint: 2,
          missing: contracts.missing,
        },
      });

      return {
        status: "unavailable",
        jobType: "recompute-matches",
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
        checkpoint: 2,
        scope: {
          neighbourhoodId: input.neighbourhoodId ?? null,
          householdId: input.householdId ?? null,
        },
      },
    });

    const actionCards = await recomputeActionCards(input);
    if (actionCards.status !== "succeeded") {
      throw new Error(actionCards.reason ?? "Action-card recompute failed");
    }

    const matches = await recomputeGroceryMatches(input);
    if (matches.status !== "succeeded") {
      throw new Error(matches.reason ?? "Grocery match recompute failed");
    }

    const finishedJobRunId = await upsertJobRun({
      idempotencyKey,
      windowStart,
      status: "succeeded",
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 2,
        actionCards: {
          generated: actionCards.generated,
          deleted: actionCards.deleted,
        },
        matches: {
          generated: matches.generated,
          deleted: matches.deleted,
        },
        jobRunId: startedJobRunId,
      },
    });

    const audit = await recordAuditEvent({
      eventType: "system.job.completed",
      actorType: "job",
      source: input.source,
      entityType: "job_run",
      entityId: finishedJobRunId,
      idempotencyKey,
      metadata: {
        jobType: "recompute-matches",
        checkpoint: 2,
        actionCards,
        matches,
      },
    });

    return {
      status: "succeeded",
      jobType: "recompute-matches",
      idempotencyKey,
      windowStart,
      recorded: true,
      jobRunId: finishedJobRunId,
      actionCards: {
        generated: actionCards.generated,
        deleted: actionCards.deleted,
      },
      matches: {
        generated: matches.generated,
        deleted: matches.deleted,
      },
      auditRecorded: audit.recorded,
      reason: audit.recorded ? undefined : audit.reason,
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
          checkpoint: 2,
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
          jobType: "recompute-matches",
          checkpoint: 2,
          reason,
        },
      });
    } catch {
      // Preserve the original job failure for public callers.
    }

    return {
      status: "failed",
      jobType: "recompute-matches",
      idempotencyKey,
      windowStart,
      recorded: Boolean(jobRunId),
      jobRunId,
      reason,
    };
  }
}
