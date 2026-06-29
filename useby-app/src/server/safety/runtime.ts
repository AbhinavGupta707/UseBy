import { recordAuditEvent } from "../audit/events";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { quoteIdentifier } from "../db/schema-contract";
import { executeSql, sqlParam, type QueryRow } from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import {
  CP3_TABLES,
  SAFETY_ACKNOWLEDGEMENTS_CONTRACT,
  checkRuntimeContracts,
  firstAvailableColumn,
  unavailableCp3Reason,
} from "./schema-contract";
import type {
  SafetyAcknowledgementCheckInput,
  SafetyAcknowledgementCheckResult,
  SafetyAcknowledgementCreateInput,
  SafetyAcknowledgementDto,
} from "./contracts";

type InsertColumn = {
  column: string;
  param: string;
  cast?: string;
  value: string | boolean | Record<string, unknown> | null;
};

type SafetyAckRow = QueryRow & {
  id?: string | null;
  household_id?: string | null;
  actor_user_id?: string | null;
  acknowledgement_type?: string | null;
  item_instance_id?: string | null;
  booking_id?: string | null;
  acknowledged_at?: string | null;
};

function pushIfColumn(
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

function ackDto(
  row: SafetyAckRow,
  fallback: {
    householdId: string;
    actorUserId?: string | null;
    itemId?: string | null;
    bookingId?: string | null;
    acknowledgementType?: string | null;
  },
): SafetyAcknowledgementDto {
  return {
    id: typeof row.id === "string" ? row.id : null,
    acknowledgementType:
      String(row.acknowledgement_type ?? fallback.acknowledgementType ?? "food_handoff"),
    householdId: String(row.household_id ?? fallback.householdId),
    actorUserId:
      typeof row.actor_user_id === "string"
        ? row.actor_user_id
        : fallback.actorUserId ?? null,
    itemId:
      typeof row.item_instance_id === "string"
        ? row.item_instance_id
        : fallback.itemId ?? null,
    bookingId:
      typeof row.booking_id === "string" ? row.booking_id : fallback.bookingId ?? null,
    acknowledgedAt: String(row.acknowledged_at ?? new Date().toISOString()),
  };
}

export async function createSafetyAcknowledgement(
  context: DemoActorContext,
  input: SafetyAcknowledgementCreateInput,
) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([SAFETY_ACKNOWLEDGEMENTS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable" as const,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.safetyAcknowledgements];
  const householdColumn = firstAvailableColumn(availability, [
    "household_id",
    "acknowledged_by_household_id",
    "requester_household_id",
  ]);
  const typeColumn = firstAvailableColumn(availability, [
    "acknowledgement_type",
    "kind",
    "type",
  ]);

  if (!householdColumn || !typeColumn) {
    return {
      status: "unavailable" as const,
      reason: "safety_acknowledgements is missing household or acknowledgement type columns",
    };
  }

  const columns: InsertColumn[] = [];
  columns.push({
    column: householdColumn,
    param: "householdId",
    value: context.household.id,
    cast: "uuid",
  });
  columns.push({
    column: typeColumn,
    param: "acknowledgementType",
    value: input.acknowledgementType,
  });
  pushIfColumn(columns, availability.columns, "actor_user_id", "actorUserId", context.user.id, "uuid");
  pushIfColumn(
    columns,
    availability.columns,
    "acknowledged_by_user_id",
    "acknowledgedByUserId",
    context.user.id,
    "uuid",
  );
  pushIfColumn(
    columns,
    availability.columns,
    "item_instance_id",
    "itemId",
    input.itemId ?? null,
    "uuid",
  );
  pushIfColumn(
    columns,
    availability.columns,
    "booking_id",
    "bookingId",
    input.bookingId ?? null,
    "uuid",
  );
  pushIfColumn(
    columns,
    availability.columns,
    "idempotency_key",
    "idempotencyKey",
    input.idempotencyKey ?? null,
  );
  pushIfColumn(
    columns,
    availability.columns,
    "metadata",
    "metadata",
    {
      ...input.metadata,
      demoScope: context.demoScope,
      notice: "User acknowledged neighbour food handoff responsibility and uncertainty.",
    },
    "jsonb",
  );
  pushIfColumn(
    columns,
    availability.columns,
    "acknowledged_at",
    "acknowledgedAt",
    new Date().toISOString(),
    "timestamptz",
  );

  const sqlColumns = columns.map((column) => quoteIdentifier(column.column)).join(", ");
  const values = columns
    .map((column) => {
      const base = `:${column.param}`;
      if (column.cast === "uuid") {
        return `nullif(${base}, '')::uuid`;
      }
      return column.cast ? `${base}::${column.cast}` : base;
    })
    .join(", ");
  const parameters = paramsFor(columns);
  const returnColumns = [
    availability.columns.has("id") ? "id::text as id" : "null::text as id",
    `${quoteIdentifier(householdColumn)}::text as household_id`,
    availability.columns.has("actor_user_id")
      ? "actor_user_id::text as actor_user_id"
      : "null::text as actor_user_id",
    `${quoteIdentifier(typeColumn)}::text as acknowledgement_type`,
    availability.columns.has("item_instance_id")
      ? "item_instance_id::text as item_instance_id"
      : "null::text as item_instance_id",
    availability.columns.has("booking_id")
      ? "booking_id::text as booking_id"
      : "null::text as booking_id",
    availability.columns.has("acknowledged_at")
      ? "acknowledged_at::text as acknowledged_at"
      : "created_at::text as acknowledged_at",
  ].join(", ");

  try {
    const result = await executeSql<SafetyAckRow>({
      sql: `
        insert into safety_acknowledgements (${sqlColumns})
        values (${values})
        returning ${returnColumns}
      `,
      parameters,
    });

    const acknowledgement = ackDto(result.rows[0] ?? {}, {
      householdId: context.household.id,
      actorUserId: context.user.id,
      itemId: input.itemId ?? null,
      bookingId: input.bookingId ?? null,
      acknowledgementType: input.acknowledgementType,
    });

    const audit = await recordAuditEvent({
      eventType: "safety_acknowledgement.created",
      actorType: "user",
      actorId: context.user.id,
      source: "api:safety_acknowledgements",
      entityType: "safety_acknowledgement",
      entityId: acknowledgement.id,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: {
        householdId: context.household.id,
        itemId: input.itemId ?? null,
        bookingId: input.bookingId ?? null,
      },
    });

    return {
      status: "ok" as const,
      acknowledgement,
      audit,
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      reason: publicErrorMessage(error),
    };
  }
}

export async function checkSafetyAcknowledgement(
  input: SafetyAcknowledgementCheckInput,
): Promise<SafetyAcknowledgementCheckResult> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      acknowledged: false,
      acknowledgement: null,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([SAFETY_ACKNOWLEDGEMENTS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable",
      acknowledged: false,
      acknowledgement: null,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.safetyAcknowledgements];
  const householdColumn = firstAvailableColumn(availability, [
    "household_id",
    "acknowledged_by_household_id",
    "requester_household_id",
  ]);
  const typeColumn = firstAvailableColumn(availability, [
    "acknowledgement_type",
    "kind",
    "type",
  ]);
  const acknowledgedAtColumn = firstAvailableColumn(availability, [
    "acknowledged_at",
    "created_at",
  ]);

  if (!householdColumn || !typeColumn || !acknowledgedAtColumn) {
    return {
      status: "unavailable",
      acknowledged: false,
      acknowledgement: null,
      reason: "safety_acknowledgements is missing acknowledgement lookup columns",
    };
  }

  const filters = [
    `${quoteIdentifier(householdColumn)} = :householdId::uuid`,
    `${quoteIdentifier(typeColumn)} = :acknowledgementType`,
  ];
  const parameters = [
    sqlParam("householdId", input.householdId),
    sqlParam("acknowledgementType", input.acknowledgementType ?? "food_handoff"),
  ];

  if (input.itemId && availability.columns.has("item_instance_id")) {
    filters.push("item_instance_id = :itemId::uuid");
    parameters.push(sqlParam("itemId", input.itemId));
  }
  if (input.bookingId && availability.columns.has("booking_id")) {
    filters.push("booking_id = :bookingId::uuid");
    parameters.push(sqlParam("bookingId", input.bookingId));
  }

  try {
    const result = await executeSql<SafetyAckRow>({
      sql: `
        select
          ${availability.columns.has("id") ? "id::text" : "null::text"} as id,
          ${quoteIdentifier(householdColumn)}::text as household_id,
          ${availability.columns.has("actor_user_id") ? "actor_user_id::text" : "null::text"} as actor_user_id,
          ${quoteIdentifier(typeColumn)}::text as acknowledgement_type,
          ${availability.columns.has("item_instance_id") ? "item_instance_id::text" : "null::text"} as item_instance_id,
          ${availability.columns.has("booking_id") ? "booking_id::text" : "null::text"} as booking_id,
          ${quoteIdentifier(acknowledgedAtColumn)}::text as acknowledged_at
        from safety_acknowledgements
        where ${filters.join(" and ")}
        order by ${quoteIdentifier(acknowledgedAtColumn)} desc
        limit 1
      `,
      parameters,
    });

    const row = result.rows[0];
    return {
      status: "available",
      acknowledged: Boolean(row),
      acknowledgement: row
        ? ackDto(row, {
            householdId: input.householdId,
            itemId: input.itemId ?? null,
            bookingId: input.bookingId ?? null,
            acknowledgementType: input.acknowledgementType ?? "food_handoff",
          })
        : null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      acknowledged: false,
      acknowledgement: null,
      reason: publicErrorMessage(error),
    };
  }
}
