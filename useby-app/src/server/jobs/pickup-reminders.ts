import { recordAuditEvent } from "../audit/events";
import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import { claimIdempotencyKey } from "../idempotency/keys";
import { generateNotificationsFromLiveRows } from "../notifications/runtime";
import { makeJobIdempotencyKey } from "./runs";

export type PickupReminderJobInput = {
  source: string;
  neighbourhoodId?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
};

export type PickupReminderJobResult = {
  status: "succeeded" | "skipped" | "unavailable" | "failed";
  jobType: "pickup-reminders";
  idempotencyKey: string;
  windowStart: string;
  recorded: boolean;
  jobRunId?: string | null;
  auditRecorded?: boolean;
  candidates?: number;
  notificationsCreated?: number;
  existingNotifications?: number;
  emailStatusCounts?: Record<string, number>;
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

async function upsertPickupReminderJobRun(input: {
  idempotencyKey: string;
  windowStart: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  source: string;
  neighbourhoodId?: string | null;
  summary: Record<string, unknown>;
  errorMessage?: string | null;
}) {
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
        'pickup-reminders',
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

export async function runPickupReminderJob(
  input: PickupReminderJobInput,
): Promise<PickupReminderJobResult> {
  const env = loadRuntimeEnv();
  const now = input.now ?? new Date();
  const windowStart = currentWindowStart(now);
  const idempotencyKey =
    input.idempotencyKey ??
    makeJobIdempotencyKey(
      "pickup-reminders",
      input.neighbourhoodId ?? "system",
      windowStart,
    );

  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      jobType: "pickup-reminders",
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
        jobType: "pickup-reminders",
        idempotencyKey,
        windowStart,
        recorded: false,
        reason: jobRunUnavailable,
      };
    }

    const claim = await claimIdempotencyKey({
      key: idempotencyKey,
      scope: "system-job",
      requestHash: "pickup-reminders",
      metadata: { jobType: "pickup-reminders", source: input.source, windowStart },
    });

    if (claim.available && claim.existing) {
      const jobRunId = await upsertPickupReminderJobRun({
        idempotencyKey,
        windowStart,
        status: "skipped",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 8,
          skipped: true,
          reason: "Job window already claimed by idempotency key.",
        },
      });

      return {
        status: "skipped",
        jobType: "pickup-reminders",
        idempotencyKey,
        windowStart,
        recorded: true,
        jobRunId,
        reason: "Job window already claimed by idempotency key.",
      };
    }

    const startedJobRunId = await upsertPickupReminderJobRun({
      idempotencyKey,
      windowStart,
      status: "started",
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 8,
        idempotencyAvailable: claim.available,
        idempotencyReason: claim.reason ?? null,
      },
    });

    const generation = await generateNotificationsFromLiveRows(now);
    if (generation.status === "unavailable") {
      const reason = generation.reason ?? "Notification runtime unavailable.";
      const jobRunId = await upsertPickupReminderJobRun({
        idempotencyKey,
        windowStart,
        status: "skipped",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 8,
          unavailable: true,
          reason,
          missingColumns: generation.missingColumns ?? [],
        },
        errorMessage: reason,
      });

      const audit = await recordAuditEvent({
        eventType: "notification.pickup_reminders.unavailable",
        actorType: "job",
        source: input.source,
        entityType: "job_run",
        entityId: jobRunId,
        idempotencyKey,
        metadata: {
          checkpoint: 8,
          reason,
          missingColumns: generation.missingColumns ?? [],
        },
      });

      return {
        status: "unavailable",
        jobType: "pickup-reminders",
        idempotencyKey,
        windowStart,
        recorded: true,
        jobRunId,
        auditRecorded: audit.recorded,
        reason,
      };
    }

    const jobRunId = await upsertPickupReminderJobRun({
      idempotencyKey,
      windowStart,
      status: "succeeded",
      source: input.source,
      neighbourhoodId: input.neighbourhoodId,
      summary: {
        checkpoint: 8,
        ...generation.summary,
      },
    });

    const audit = await recordAuditEvent({
      eventType: "notification.pickup_reminders.completed",
      actorType: "job",
      source: input.source,
      entityType: "job_run",
      entityId: jobRunId ?? startedJobRunId,
      idempotencyKey,
      metadata: {
        checkpoint: 8,
        ...generation.summary,
      },
    });

    return {
      status: "succeeded",
      jobType: "pickup-reminders",
      idempotencyKey,
      windowStart,
      recorded: true,
      jobRunId,
      auditRecorded: audit.recorded,
      candidates: generation.summary.candidates,
      notificationsCreated: generation.summary.created,
      existingNotifications: generation.summary.existing,
      emailStatusCounts: generation.summary.emailStatusCounts,
      reason: audit.recorded ? undefined : audit.reason,
    };
  } catch (error) {
    const reason = publicErrorMessage(error);
    let jobRunId: string | null = null;
    try {
      jobRunId = await upsertPickupReminderJobRun({
        idempotencyKey,
        windowStart,
        status: "failed",
        source: input.source,
        neighbourhoodId: input.neighbourhoodId,
        summary: {
          checkpoint: 8,
          failed: true,
        },
        errorMessage: reason,
      });
    } catch {
      // Keep the original public failure.
    }

    return {
      status: "failed",
      jobType: "pickup-reminders",
      idempotencyKey,
      windowStart,
      recorded: Boolean(jobRunId),
      jobRunId,
      reason,
    };
  }
}
