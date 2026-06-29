import { recordAuditEvent } from "../audit/events";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { quoteIdentifier } from "../db/schema-contract";
import { executeSql, sqlParam, type QueryRow } from "../db/sql";
import {
  CP3_TABLES,
  TRUST_EVENTS_CONTRACT,
  checkRuntimeContracts,
  firstAvailableColumn,
  unavailableCp3Reason,
} from "../safety/schema-contract";

export type TrustSignalType =
  | "booking_completed"
  | "positive_review"
  | "report_submitted"
  | "block_received"
  | "dispute_opened"
  | "handoff_cancelled";

export type TrustSignal = {
  type: TrustSignalType | string;
  scoreDelta?: number | null;
  occurredAt?: string | Date | null;
};

export type TrustScoreOutput = {
  score: number;
  label: "new" | "steady" | "strong" | "watch";
  eventCount: number;
  positiveCount: number;
  negativeCount: number;
  rationale: string[];
};

type TrustEventRow = QueryRow & {
  event_type?: string | null;
  score_delta?: number | string | null;
  occurred_at?: string | null;
};

type InsertColumn = {
  column: string;
  param: string;
  value: string | number | Record<string, unknown> | null;
  cast?: string;
};

const DEFAULT_EVENT_DELTAS: Record<string, number> = {
  booking_completed: 8,
  positive_review: 4,
  report_submitted: -18,
  block_received: -12,
  dispute_opened: -20,
  handoff_cancelled: -6,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function eventDelta(signal: TrustSignal): number {
  if (typeof signal.scoreDelta === "number" && Number.isFinite(signal.scoreDelta)) {
    return signal.scoreDelta;
  }

  return DEFAULT_EVENT_DELTAS[signal.type] ?? 0;
}

export function calculateTrustScore(signals: TrustSignal[]): TrustScoreOutput {
  const deltas = signals.map(eventDelta);
  const rawScore = 50 + deltas.reduce((sum, delta) => sum + delta, 0);
  const score = clamp(Math.round(rawScore), 0, 100);
  const positiveCount = deltas.filter((delta) => delta > 0).length;
  const negativeCount = deltas.filter((delta) => delta < 0).length;
  const rationale = [
    `Started from neutral score 50.`,
    `${positiveCount} positive trust event${positiveCount === 1 ? "" : "s"} applied.`,
    `${negativeCount} negative trust event${negativeCount === 1 ? "" : "s"} applied.`,
    `Final deterministic score is ${score}.`,
  ];

  const label =
    signals.length === 0
      ? "new"
      : score >= 75
        ? "strong"
        : score < 40
          ? "watch"
          : "steady";

  return {
    score,
    label,
    eventCount: signals.length,
    positiveCount,
    negativeCount,
    rationale,
  };
}

function pushColumn(
  columns: InsertColumn[],
  availableColumns: Set<string>,
  column: string,
  param: string,
  value: InsertColumn["value"],
  cast?: string,
) {
  if (availableColumns.has(column)) {
    columns.push({ column, param, value, cast });
  }
}

function paramsFor(columns: InsertColumn[]) {
  const byName = new Map<string, InsertColumn["value"]>();
  for (const column of columns) {
    byName.set(column.param, column.value);
  }

  return [...byName.entries()].map(([name, value]) => sqlParam(name, value));
}

function insertSql(columns: InsertColumn[], returning: string) {
  const names = columns.map((column) => quoteIdentifier(column.column)).join(", ");
  const values = columns
    .map((column) => {
      const base = `:${column.param}`;
      if (column.cast === "uuid") {
        return `nullif(${base}, '')::uuid`;
      }
      return column.cast ? `${base}::${column.cast}` : base;
    })
    .join(", ");

  return `
    insert into trust_events (${names})
    values (${values})
    returning ${returning}
  `;
}

export async function recordTrustEvent(input: {
  householdId: string;
  eventType: TrustSignalType | string;
  scoreDelta?: number;
  bookingId?: string | null;
  actorUserId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([TRUST_EVENTS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable" as const,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.trustEvents];
  const householdColumn = firstAvailableColumn(availability, [
    "household_id",
    "subject_household_id",
  ]);
  const typeColumn = firstAvailableColumn(availability, ["event_type", "kind", "type"]);
  const deltaColumn = firstAvailableColumn(availability, ["score_delta", "delta"]);
  if (!householdColumn || !typeColumn || !deltaColumn) {
    return {
      status: "unavailable" as const,
      reason: "trust_events is missing household, type, or score delta columns",
    };
  }

  const scoreDelta = input.scoreDelta ?? DEFAULT_EVENT_DELTAS[input.eventType] ?? 0;
  const columns: InsertColumn[] = [
    { column: householdColumn, param: "householdId", value: input.householdId, cast: "uuid" },
    { column: typeColumn, param: "eventType", value: input.eventType },
    { column: deltaColumn, param: "scoreDelta", value: scoreDelta },
  ];
  pushColumn(columns, availability.columns, "booking_id", "bookingId", input.bookingId ?? null, "uuid");
  pushColumn(columns, availability.columns, "actor_user_id", "actorUserId", input.actorUserId ?? null, "uuid");
  pushColumn(columns, availability.columns, "source", "source", input.source ?? "trust_runtime");
  pushColumn(
    columns,
    availability.columns,
    "metadata",
    "metadata",
    {
      ...(input.metadata ?? {}),
      deterministic: true,
      scoreDelta,
    },
    "jsonb",
  );

  const returning = [
    availability.columns.has("id") ? "id::text as id" : "null::text as id",
    `${quoteIdentifier(typeColumn)}::text as event_type`,
    `${quoteIdentifier(deltaColumn)} as score_delta`,
    availability.columns.has("created_at")
      ? "created_at::text as occurred_at"
      : availability.columns.has("occurred_at")
        ? "occurred_at::text as occurred_at"
        : "now()::text as occurred_at",
  ].join(", ");

  try {
    const result = await executeSql<QueryRow>({
      sql: insertSql(columns, returning),
      parameters: paramsFor(columns),
    });
    const audit = await recordAuditEvent({
      eventType: "trust.event.recorded",
      actorType: input.actorUserId ? "user" : "system",
      actorId: input.actorUserId ?? null,
      source: input.source ?? "trust_runtime",
      entityType: "trust_event",
      entityId: typeof result.rows[0]?.id === "string" ? result.rows[0].id : null,
      metadata: {
        householdId: input.householdId,
        eventType: input.eventType,
        scoreDelta,
        bookingId: input.bookingId ?? null,
      },
    });

    return {
      status: "ok" as const,
      event: result.rows[0] ?? null,
      audit,
    };
  } catch (error) {
    return { status: "unavailable" as const, reason: publicErrorMessage(error) };
  }
}

export async function recordBookingCompletedTrustEvents(input: {
  ownerHouseholdId: string;
  requesterHouseholdId: string;
  bookingId: string;
  actorUserId?: string | null;
}) {
  const owner = await recordTrustEvent({
    householdId: input.ownerHouseholdId,
    eventType: "booking_completed",
    bookingId: input.bookingId,
    actorUserId: input.actorUserId ?? null,
    source: "booking_completion",
    metadata: { role: "owner" },
  });
  const requester = await recordTrustEvent({
    householdId: input.requesterHouseholdId,
    eventType: "booking_completed",
    bookingId: input.bookingId,
    actorUserId: input.actorUserId ?? null,
    source: "booking_completion",
    metadata: { role: "requester" },
  });

  return { owner, requester };
}

export async function calculateHouseholdTrustFromDatabase(householdId: string) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
      trust: calculateTrustScore([]),
    };
  }

  const contracts = await checkRuntimeContracts([TRUST_EVENTS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable" as const,
      reason: unavailableCp3Reason(contracts),
      trust: calculateTrustScore([]),
    };
  }

  const availability = contracts.availability[CP3_TABLES.trustEvents];
  const householdColumn = firstAvailableColumn(availability, [
    "household_id",
    "subject_household_id",
  ]);
  const typeColumn = firstAvailableColumn(availability, ["event_type", "kind", "type"]);
  const deltaColumn = firstAvailableColumn(availability, ["score_delta", "delta"]);
  const occurredColumn = firstAvailableColumn(availability, [
    "occurred_at",
    "created_at",
  ]);
  if (!householdColumn || !typeColumn || !deltaColumn) {
    return {
      status: "unavailable" as const,
      reason: "trust_events is missing score calculation columns",
      trust: calculateTrustScore([]),
    };
  }

  try {
    const result = await executeSql<TrustEventRow>({
      sql: `
        select
          ${quoteIdentifier(typeColumn)}::text as event_type,
          ${quoteIdentifier(deltaColumn)} as score_delta,
          ${occurredColumn ? `${quoteIdentifier(occurredColumn)}::text` : "null::text"} as occurred_at
        from trust_events
        where ${quoteIdentifier(householdColumn)} = :householdId::uuid
        order by ${occurredColumn ? quoteIdentifier(occurredColumn) : quoteIdentifier(typeColumn)} asc
      `,
      parameters: [sqlParam("householdId", householdId)],
    });
    const trust = calculateTrustScore(
      result.rows.map((row) => ({
        type: String(row.event_type ?? "unknown"),
        scoreDelta:
          typeof row.score_delta === "number"
            ? row.score_delta
            : Number.parseFloat(String(row.score_delta ?? "0")),
        occurredAt: row.occurred_at ?? null,
      })),
    );

    return { status: "ok" as const, trust };
  } catch (error) {
    return {
      status: "unavailable" as const,
      reason: publicErrorMessage(error),
      trust: calculateTrustScore([]),
    };
  }
}

export async function persistHouseholdTrustScore(householdId: string) {
  const calculated = await calculateHouseholdTrustFromDatabase(householdId);
  if (calculated.status !== "ok") {
    return calculated;
  }

  try {
    await executeSql({
      sql: `
        update households
        set trust_score = :score,
            updated_at = now()
        where id = :householdId::uuid
      `,
      parameters: [
        sqlParam("score", calculated.trust.score),
        sqlParam("householdId", householdId),
      ],
    });
    return calculated;
  } catch (error) {
    return {
      status: "unavailable" as const,
      reason: publicErrorMessage(error),
      trust: calculated.trust,
    };
  }
}
