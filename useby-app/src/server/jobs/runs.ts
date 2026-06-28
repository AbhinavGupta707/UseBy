import { recordAuditEvent } from "../audit/events";
import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam } from "../db/sql";
import { claimIdempotencyKey } from "../idempotency/keys";

export type SystemJobType =
  | "expiry-decay"
  | "recompute-matches"
  | "close-demand-pools"
  | "pickup-reminders";

export type SystemJobRunResult = {
  status: "completed" | "skipped" | "unavailable" | "failed";
  jobType: SystemJobType;
  idempotencyKey: string;
  windowStart: string;
  recorded: boolean;
  jobRunId?: string | null;
  auditRecorded?: boolean;
  reason?: string;
};

const JOB_METADATA: Record<SystemJobType, Record<string, unknown>> = {
  "expiry-decay": {
    checkpoint: 1,
    stub: true,
    plannedWork: "Recompute expiry bands and urgent cards.",
  },
  "recompute-matches": {
    checkpoint: 1,
    stub: true,
    plannedWork: "Refresh matches and action cards from current rows.",
  },
  "close-demand-pools": {
    checkpoint: 1,
    stub: true,
    plannedWork: "Close, expire, or transition demand pools from current rows.",
  },
  "pickup-reminders": {
    checkpoint: 1,
    stub: true,
    plannedWork: "Create pickup reminder notifications from current bookings.",
  },
};

function currentWindowStart(now = new Date()): string {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  return windowStart.toISOString();
}

export function makeJobIdempotencyKey(
  jobType: SystemJobType,
  neighbourhoodId = "system",
  windowStart = currentWindowStart(),
): string {
  return `${jobType}:${neighbourhoodId}:${windowStart}`;
}

export async function runSystemJobStub(
  jobType: SystemJobType,
  source: string,
): Promise<SystemJobRunResult> {
  const env = loadRuntimeEnv();
  const windowStart = currentWindowStart();
  const idempotencyKey = makeJobIdempotencyKey(jobType, "system", windowStart);

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      jobType,
      idempotencyKey,
      windowStart,
      recorded: false,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const claim = await claimIdempotencyKey({
    key: idempotencyKey,
    scope: "system-job",
    requestHash: jobType,
    metadata: { jobType, source, windowStart },
  });

  if (claim.available && claim.existing) {
    return {
      status: "skipped",
      jobType,
      idempotencyKey,
      windowStart,
      recorded: false,
      reason: "Job window already claimed by idempotency key.",
    };
  }

  try {
    const availability = await getTableAvailability(SYSTEM_TABLES.jobRuns);
    const required = ASSUMED_SYSTEM_COLUMNS.jobRuns;
    const missing = required.filter((column) => !availability.columns.has(column));

    if (!availability.exists || missing.length > 0) {
      return {
        status: "unavailable",
        jobType,
        idempotencyKey,
        windowStart,
        recorded: false,
        reason: availability.exists
          ? `job_runs missing columns: ${missing.join(", ")}`
          : "job_runs table is not available",
      };
    }

    const result = await executeSql<{ id: string }>({
      sql: `
        insert into job_runs (
          job_type,
          status,
          source,
          idempotency_key,
          started_at,
          completed_at,
          metadata
        )
        values (
          :jobType,
          'completed',
          :source,
          :idempotencyKey,
          now(),
          now(),
          :metadata::jsonb
        )
        returning id::text as id
      `,
      parameters: [
        sqlParam("jobType", jobType),
        sqlParam("source", source),
        sqlParam("idempotencyKey", idempotencyKey),
        sqlParam("metadata", {
          ...JOB_METADATA[jobType],
          source,
          windowStart,
          idempotencyAvailable: claim.available,
          idempotencyReason: claim.reason ?? null,
        }),
      ],
    });

    const audit = await recordAuditEvent({
      eventType: "system.job.completed",
      actorType: "job",
      source,
      entityType: "job_run",
      entityId: result.rows[0]?.id ?? null,
      idempotencyKey,
      metadata: {
        jobType,
        windowStart,
        checkpoint: 1,
        stub: true,
      },
    });

    return {
      status: "completed",
      jobType,
      idempotencyKey,
      windowStart,
      recorded: true,
      jobRunId: result.rows[0]?.id ?? null,
      auditRecorded: audit.recorded,
      reason: audit.recorded ? undefined : audit.reason,
    };
  } catch (error) {
    return {
      status: "failed",
      jobType,
      idempotencyKey,
      windowStart,
      recorded: false,
      reason: publicErrorMessage(error),
    };
  }
}
