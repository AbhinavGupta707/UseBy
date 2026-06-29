import { recordAuditEvent } from "../audit/events";
import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { quoteIdentifier } from "../db/schema-contract";
import { executeSql, sqlParam, type QueryRow } from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import {
  BLOCKS_CONTRACT,
  CP3_TABLES,
  REPORTS_CONTRACT,
  checkRuntimeContracts,
  firstAvailableColumn,
  unavailableCp3Reason,
} from "../safety/schema-contract";
import { recordTrustEvent } from "../trust/runtime";
import type {
  BlockCreateInput,
  BlockDto,
  RelationshipBlockCheck,
  ReportCreateInput,
  ReportDto,
} from "./contracts";

type InsertColumn = {
  column: string;
  param: string;
  value: string | Record<string, unknown> | null;
  cast?: string;
};

type ReportRow = QueryRow & {
  id?: string | null;
  category?: string | null;
  reason?: string | null;
  status?: string | null;
  reporter_household_id?: string | null;
  target_household_id?: string | null;
  booking_id?: string | null;
  item_instance_id?: string | null;
  created_at?: string | null;
};

type BlockRow = QueryRow & {
  id?: string | null;
  blocker_household_id?: string | null;
  blocked_household_id?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string | null;
};

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

function insertSql(table: string, columns: InsertColumn[], returning: string) {
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
    insert into ${quoteIdentifier(table)} (${names})
    values (${values})
    returning ${returning}
  `;
}

function paramsFor(columns: InsertColumn[]) {
  const byName = new Map<string, InsertColumn["value"]>();
  for (const column of columns) {
    byName.set(column.param, column.value);
  }

  return [...byName.entries()].map(([name, value]) => sqlParam(name, value));
}

function reportDto(row: ReportRow, fallback: ReportCreateInput & { reporterHouseholdId: string }): ReportDto {
  return {
    id: typeof row.id === "string" ? row.id : null,
    category: String(row.category ?? fallback.category),
    reason: String(row.reason ?? fallback.reason),
    status: String(row.status ?? "open"),
    reporterHouseholdId: String(row.reporter_household_id ?? fallback.reporterHouseholdId),
    targetHouseholdId:
      typeof row.target_household_id === "string"
        ? row.target_household_id
        : fallback.targetHouseholdId ?? null,
    bookingId:
      typeof row.booking_id === "string" ? row.booking_id : fallback.bookingId ?? null,
    itemId:
      typeof row.item_instance_id === "string" ? row.item_instance_id : fallback.itemId ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function blockDto(row: BlockRow, fallback: { blockerHouseholdId: string; blockedHouseholdId: string; reason?: string | null }): BlockDto {
  return {
    id: typeof row.id === "string" ? row.id : null,
    blockerHouseholdId: String(row.blocker_household_id ?? fallback.blockerHouseholdId),
    blockedHouseholdId: String(row.blocked_household_id ?? fallback.blockedHouseholdId),
    reason: typeof row.reason === "string" ? row.reason : fallback.reason ?? null,
    status: String(row.status ?? "active"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function createReport(
  context: DemoActorContext,
  input: ReportCreateInput,
) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([REPORTS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable" as const,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.reports];
  const reporterColumn = firstAvailableColumn(availability, [
    "reporter_household_id",
    "source_household_id",
    "created_by_household_id",
  ]);
  const categoryColumn = firstAvailableColumn(availability, [
    "category",
    "report_type",
    "type",
  ]);
  const statusColumn = firstAvailableColumn(availability, ["status", "state"]);
  if (!reporterColumn || !categoryColumn || !statusColumn) {
    return {
      status: "unavailable" as const,
      reason: "reports is missing reporter, category, or status columns",
    };
  }

  const columns: InsertColumn[] = [
    { column: reporterColumn, param: "reporterHouseholdId", value: context.household.id, cast: "uuid" },
    { column: categoryColumn, param: "category", value: input.category },
    { column: statusColumn, param: "status", value: "open" },
  ];
  pushColumn(columns, availability.columns, "reporter_user_id", "reporterUserId", context.user.id, "uuid");
  pushColumn(columns, availability.columns, "actor_user_id", "actorUserId", context.user.id, "uuid");
  pushColumn(columns, availability.columns, "target_household_id", "targetHouseholdId", input.targetHouseholdId ?? null, "uuid");
  pushColumn(columns, availability.columns, "target_user_id", "targetUserId", input.targetUserId ?? null, "uuid");
  pushColumn(columns, availability.columns, "booking_id", "bookingId", input.bookingId ?? null, "uuid");
  pushColumn(columns, availability.columns, "target_booking_id", "targetBookingId", input.bookingId ?? null, "uuid");
  pushColumn(columns, availability.columns, "item_instance_id", "itemId", input.itemId ?? null, "uuid");
  pushColumn(columns, availability.columns, "target_item_instance_id", "targetItemId", input.itemId ?? null, "uuid");
  pushColumn(columns, availability.columns, "reason", "reason", input.reason);
  pushColumn(columns, availability.columns, "details", "details", input.details ?? null);
  pushColumn(columns, availability.columns, "idempotency_key", "idempotencyKey", input.idempotencyKey ?? null);
  pushColumn(
    columns,
    availability.columns,
    "metadata",
    "metadata",
    {
      ...input.metadata,
      demoScope: context.demoScope,
      directContactIncluded: false,
    },
    "jsonb",
  );

  const returning = [
    availability.columns.has("id") ? "id::text as id" : "null::text as id",
    `${quoteIdentifier(categoryColumn)}::text as category`,
    availability.columns.has("reason") ? "reason::text as reason" : ":reason::text as reason",
    `${quoteIdentifier(statusColumn)}::text as status`,
    `${quoteIdentifier(reporterColumn)}::text as reporter_household_id`,
    availability.columns.has("target_household_id")
      ? "target_household_id::text as target_household_id"
      : "null::text as target_household_id",
    availability.columns.has("booking_id")
      ? "booking_id::text as booking_id"
      : availability.columns.has("target_booking_id")
        ? "target_booking_id::text as booking_id"
        : "null::text as booking_id",
    availability.columns.has("item_instance_id")
      ? "item_instance_id::text as item_instance_id"
      : availability.columns.has("target_item_instance_id")
        ? "target_item_instance_id::text as item_instance_id"
        : "null::text as item_instance_id",
    availability.columns.has("created_at") ? "created_at::text as created_at" : "now()::text as created_at",
  ].join(", ");

  try {
    const result = await executeSql<ReportRow>({
      sql: insertSql(CP3_TABLES.reports, columns, returning),
      parameters: paramsFor(columns),
    });
    const report = reportDto(result.rows[0] ?? {}, {
      ...input,
      reporterHouseholdId: context.household.id,
    });
    const audit = await recordAuditEvent({
      eventType: "moderation.report.created",
      actorType: "user",
      actorId: context.user.id,
      source: "api:reports",
      entityType: "report",
      entityId: report.id,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: {
        category: report.category,
        reporterHouseholdId: report.reporterHouseholdId,
        targetHouseholdId: report.targetHouseholdId,
        bookingId: report.bookingId,
        itemId: report.itemId,
      },
    });

    const trust = report.targetHouseholdId
      ? await recordTrustEvent({
          householdId: report.targetHouseholdId,
          eventType: "report_submitted",
          actorUserId: context.user.id,
          source: "api:reports",
          metadata: {
            reportId: report.id,
            category: report.category,
          },
        })
      : null;

    return { status: "ok" as const, report, audit, trust };
  } catch (error) {
    return { status: "unavailable" as const, reason: publicErrorMessage(error) };
  }
}

export async function createBlock(
  context: DemoActorContext,
  input: BlockCreateInput,
) {
  if (context.household.id === input.blockedHouseholdId) {
    return {
      status: "error" as const,
      code: "self_block_not_allowed",
      message: "A household cannot block itself.",
    };
  }

  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([BLOCKS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable" as const,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.blocks];
  const blockerColumn = firstAvailableColumn(availability, [
    "blocker_household_id",
    "source_household_id",
    "created_by_household_id",
  ]);
  const blockedColumn = firstAvailableColumn(availability, [
    "blocked_household_id",
    "target_household_id",
  ]);
  if (!blockerColumn || !blockedColumn) {
    return {
      status: "unavailable" as const,
      reason: "blocks is missing blocker or blocked household columns",
    };
  }

  const columns: InsertColumn[] = [
    { column: blockerColumn, param: "blockerHouseholdId", value: context.household.id, cast: "uuid" },
    { column: blockedColumn, param: "blockedHouseholdId", value: input.blockedHouseholdId, cast: "uuid" },
  ];
  pushColumn(columns, availability.columns, "actor_user_id", "actorUserId", context.user.id, "uuid");
  pushColumn(columns, availability.columns, "blocked_by_user_id", "blockedByUserId", context.user.id, "uuid");
  pushColumn(columns, availability.columns, "reason", "reason", input.reason ?? null);
  pushColumn(columns, availability.columns, "status", "status", "active");
  pushColumn(columns, availability.columns, "state", "state", "active");
  pushColumn(columns, availability.columns, "idempotency_key", "idempotencyKey", input.idempotencyKey ?? null);
  pushColumn(
    columns,
    availability.columns,
    "metadata",
    "metadata",
    { ...input.metadata, demoScope: context.demoScope },
    "jsonb",
  );

  const statusProjection = availability.columns.has("status")
    ? "status::text"
    : availability.columns.has("state")
      ? "state::text"
      : "'active'::text";
  const returning = [
    availability.columns.has("id") ? "id::text as id" : "null::text as id",
    `${quoteIdentifier(blockerColumn)}::text as blocker_household_id`,
    `${quoteIdentifier(blockedColumn)}::text as blocked_household_id`,
    availability.columns.has("reason") ? "reason::text as reason" : "null::text as reason",
    `${statusProjection} as status`,
    availability.columns.has("created_at") ? "created_at::text as created_at" : "now()::text as created_at",
  ].join(", ");

  try {
    const result = await executeSql<BlockRow>({
      sql: insertSql(CP3_TABLES.blocks, columns, returning),
      parameters: paramsFor(columns),
    });
    const block = blockDto(result.rows[0] ?? {}, {
      blockerHouseholdId: context.household.id,
      blockedHouseholdId: input.blockedHouseholdId,
      reason: input.reason ?? null,
    });
    const audit = await recordAuditEvent({
      eventType: "moderation.block.created",
      actorType: "user",
      actorId: context.user.id,
      source: "api:blocks",
      entityType: "block",
      entityId: block.id,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: {
        blockerHouseholdId: block.blockerHouseholdId,
        blockedHouseholdId: block.blockedHouseholdId,
      },
    });

    const trust = await recordTrustEvent({
      householdId: block.blockedHouseholdId,
      eventType: "block_received",
      actorUserId: context.user.id,
      source: "api:blocks",
      metadata: {
        blockId: block.id,
        blockerHouseholdId: block.blockerHouseholdId,
      },
    });

    return { status: "ok" as const, block, audit, trust };
  } catch (error) {
    return { status: "unavailable" as const, reason: publicErrorMessage(error) };
  }
}

export async function listBlocks(context: DemoActorContext) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      blocks: [],
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([BLOCKS_CONTRACT]);
  if (!contracts.available) {
    return { status: "unavailable" as const, blocks: [], reason: unavailableCp3Reason(contracts) };
  }

  const availability = contracts.availability[CP3_TABLES.blocks];
  const blockerColumn = firstAvailableColumn(availability, [
    "blocker_household_id",
    "source_household_id",
    "created_by_household_id",
  ]);
  const blockedColumn = firstAvailableColumn(availability, [
    "blocked_household_id",
    "target_household_id",
  ]);
  if (!blockerColumn || !blockedColumn) {
    return { status: "unavailable" as const, blocks: [], reason: "blocks lookup columns are missing" };
  }

  const statusExpression = availability.columns.has("status")
    ? "status::text"
    : availability.columns.has("state")
      ? "state::text"
      : "'active'::text";

  try {
    const result = await executeSql<BlockRow>({
      sql: `
        select
          ${availability.columns.has("id") ? "id::text" : "null::text"} as id,
          ${quoteIdentifier(blockerColumn)}::text as blocker_household_id,
          ${quoteIdentifier(blockedColumn)}::text as blocked_household_id,
          ${availability.columns.has("reason") ? "reason::text" : "null::text"} as reason,
          ${statusExpression} as status,
          ${availability.columns.has("created_at") ? "created_at::text" : "now()::text"} as created_at
        from blocks
        where ${quoteIdentifier(blockerColumn)} = :householdId::uuid
          and (${statusExpression}) = 'active'
        order by ${availability.columns.has("created_at") ? "created_at" : quoteIdentifier(blockedColumn)} desc
      `,
      parameters: [sqlParam("householdId", context.household.id)],
    });

    return {
      status: "ok" as const,
      blocks: result.rows.map((row) =>
        blockDto(row, {
          blockerHouseholdId: context.household.id,
          blockedHouseholdId: "",
        }),
      ),
    };
  } catch (error) {
    return { status: "unavailable" as const, blocks: [], reason: publicErrorMessage(error) };
  }
}

export async function checkRelationshipBlock(
  householdAId: string,
  householdBId: string,
): Promise<RelationshipBlockCheck> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      blocked: false,
      block: null,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contracts = await checkRuntimeContracts([BLOCKS_CONTRACT]);
  if (!contracts.available) {
    return {
      status: "unavailable",
      blocked: false,
      block: null,
      reason: unavailableCp3Reason(contracts),
    };
  }

  const availability = contracts.availability[CP3_TABLES.blocks];
  const blockerColumn = firstAvailableColumn(availability, [
    "blocker_household_id",
    "source_household_id",
    "created_by_household_id",
  ]);
  const blockedColumn = firstAvailableColumn(availability, [
    "blocked_household_id",
    "target_household_id",
  ]);
  if (!blockerColumn || !blockedColumn) {
    return {
      status: "unavailable",
      blocked: false,
      block: null,
      reason: "blocks lookup columns are missing",
    };
  }

  const statusExpression = availability.columns.has("status")
    ? "status::text"
    : availability.columns.has("state")
      ? "state::text"
      : "'active'::text";

  try {
    const result = await executeSql<BlockRow>({
      sql: `
        select
          ${availability.columns.has("id") ? "id::text" : "null::text"} as id,
          ${quoteIdentifier(blockerColumn)}::text as blocker_household_id,
          ${quoteIdentifier(blockedColumn)}::text as blocked_household_id,
          ${availability.columns.has("reason") ? "reason::text" : "null::text"} as reason,
          ${statusExpression} as status,
          ${availability.columns.has("created_at") ? "created_at::text" : "now()::text"} as created_at
        from blocks
        where (
          (${quoteIdentifier(blockerColumn)} = :householdAId::uuid and ${quoteIdentifier(blockedColumn)} = :householdBId::uuid)
          or
          (${quoteIdentifier(blockerColumn)} = :householdBId::uuid and ${quoteIdentifier(blockedColumn)} = :householdAId::uuid)
        )
          and (${statusExpression}) = 'active'
        order by ${availability.columns.has("created_at") ? "created_at" : quoteIdentifier(blockerColumn)} desc
        limit 1
      `,
      parameters: [
        sqlParam("householdAId", householdAId),
        sqlParam("householdBId", householdBId),
      ],
    });
    const row = result.rows[0];
    return {
      status: "available",
      blocked: Boolean(row),
      block: row
        ? blockDto(row, {
            blockerHouseholdId: householdAId,
            blockedHouseholdId: householdBId,
          })
        : null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      blocked: false,
      block: null,
      reason: publicErrorMessage(error),
    };
  }
}
