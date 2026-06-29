import { BOOKING_ACTIVE_RESERVATION_STATUSES } from "../bookings/contracts";
import { loadRuntimeEnv } from "../db/env";
import {
  getTableAvailability,
  publicErrorMessage,
  type TableAvailability,
} from "../db/introspection";
import { quoteIdentifier } from "../db/schema-contract";
import { executeSql, sqlParam } from "../db/sql";

export type LendingWindowInput = {
  itemId: string;
  windowStart: string | Date;
  windowEnd: string | Date;
  excludeBookingId?: string | null;
};

export type LendingAvailabilityConflict = {
  bookingId: string | null;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  source: "booking_window" | "handoff_window" | "active_booking_without_window";
};

export type LendingAvailabilityDecision = {
  available: boolean;
  code: "available" | "invalid_window" | "item_unavailable" | "window_conflict";
  reasons: string[];
  windowStart: string | null;
  windowEnd: string | null;
  conflicts: LendingAvailabilityConflict[];
};

export type LendingAvailabilityCheck =
  | {
      status: "available";
      decision: LendingAvailabilityDecision;
    }
  | {
      status: "unavailable";
      decision: LendingAvailabilityDecision;
      reason: string;
    };

type ConflictRow = {
  booking_id: string | null;
  status: string;
  window_start: string | null;
  window_end: string | null;
  source: LendingAvailabilityConflict["source"];
};

const ACTIVE_LENDING_STATUSES = [
  "requested",
  ...BOOKING_ACTIVE_RESERVATION_STATUSES,
] as const;

const BOOKING_WINDOW_START_COLUMNS = [
  "borrow_window_start",
  "borrow_start_at",
  "rental_start_at",
  "window_start",
  "requested_window_start",
  "requested_start_at",
  "start_at",
] as const;

const BOOKING_WINDOW_END_COLUMNS = [
  "borrow_window_end",
  "borrow_end_at",
  "rental_end_at",
  "window_end",
  "requested_window_end",
  "requested_end_at",
  "end_at",
] as const;

function isoDate(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unavailableDecision(reason: string): LendingAvailabilityDecision {
  return {
    available: false,
    code: "item_unavailable",
    reasons: [reason],
    windowStart: null,
    windowEnd: null,
    conflicts: [],
  };
}

function firstColumn(
  availability: TableAvailability,
  candidates: readonly string[],
): string | null {
  return candidates.find((column) => availability.columns.has(column)) ?? null;
}

function hasColumns(availability: TableAvailability, columns: readonly string[]) {
  return availability.exists && columns.every((column) => availability.columns.has(column));
}

function statusListSql() {
  return ACTIVE_LENDING_STATUSES.map((status) => `'${status}'`).join(", ");
}

function excludeBookingSql() {
  return `
    and (
      nullif(:excludeBookingId, '') is null
      or b.id <> nullif(:excludeBookingId, '')::uuid
    )
  `;
}

function conflictFromRow(row: ConflictRow): LendingAvailabilityConflict {
  return {
    bookingId: row.booking_id,
    status: row.status,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    source: row.source,
  };
}

export function evaluateLendingAvailability(input: {
  windowStart: string | Date;
  windowEnd: string | Date;
  itemState?: string | null;
  conflicts?: LendingAvailabilityConflict[];
}): LendingAvailabilityDecision {
  const windowStart = isoDate(input.windowStart);
  const windowEnd = isoDate(input.windowEnd);
  const reasons: string[] = [];

  if (!windowStart || !windowEnd) {
    reasons.push("Borrow window must include valid start and end timestamps.");
  } else if (new Date(windowEnd).getTime() <= new Date(windowStart).getTime()) {
    reasons.push("Borrow window end must be after start.");
  }

  if (input.itemState && input.itemState !== "listed") {
    reasons.push(`Item state is ${input.itemState}; lending requires a listed item.`);
  }

  const conflicts = input.conflicts ?? [];
  if (conflicts.length > 0) {
    reasons.push("Requested window overlaps an active lending booking or unresolved hold.");
  }

  if (reasons.length > 0) {
    return {
      available: false,
      code: conflicts.length > 0 ? "window_conflict" : input.itemState ? "item_unavailable" : "invalid_window",
      reasons,
      windowStart,
      windowEnd,
      conflicts,
    };
  }

  return {
    available: true,
    code: "available",
    reasons: [],
    windowStart,
    windowEnd,
    conflicts,
  };
}

async function loadItemState(itemId: string) {
  const result = await executeSql<{ item_state: string | null }>({
    sql: `
      select item_state::text as item_state
      from item_instances
      where id = :itemId::uuid
        and deleted_at is null
      limit 1
    `,
    parameters: [sqlParam("itemId", itemId)],
  });

  return result.rows[0]?.item_state ?? null;
}

async function findBookingWindowConflicts(input: {
  itemId: string;
  windowStart: string;
  windowEnd: string;
  excludeBookingId: string;
  startColumn: string;
  endColumn: string;
}) {
  const startColumn = quoteIdentifier(input.startColumn);
  const endColumn = quoteIdentifier(input.endColumn);
  const result = await executeSql<ConflictRow>({
    sql: `
      select
        b.id::text as booking_id,
        b.status::text as status,
        b.${startColumn}::text as window_start,
        b.${endColumn}::text as window_end,
        'booking_window'::text as source
      from bookings b
      where b.item_instance_id = :itemId::uuid
        and b.deleted_at is null
        and b.status in (${statusListSql()})
        ${excludeBookingSql()}
        and b.${startColumn} is not null
        and b.${endColumn} is not null
        and tstzrange(b.${startColumn}, b.${endColumn}, '[)')
          && tstzrange(:windowStart::timestamptz, :windowEnd::timestamptz, '[)')
      order by b.updated_at desc
      limit 10
    `,
    parameters: [
      sqlParam("itemId", input.itemId),
      sqlParam("windowStart", input.windowStart),
      sqlParam("windowEnd", input.windowEnd),
      sqlParam("excludeBookingId", input.excludeBookingId),
    ],
  });

  return result.rows.map(conflictFromRow);
}

async function findHandoffWindowConflicts(input: {
  itemId: string;
  windowStart: string;
  windowEnd: string;
  excludeBookingId: string;
}) {
  const result = await executeSql<ConflictRow>({
    sql: `
      select
        b.id::text as booking_id,
        b.status::text as status,
        h.pickup_window_start::text as window_start,
        h.pickup_window_end::text as window_end,
        'handoff_window'::text as source
      from bookings b
      join handoffs h on h.booking_id = b.id
      where b.item_instance_id = :itemId::uuid
        and b.deleted_at is null
        and b.status in (${statusListSql()})
        ${excludeBookingSql()}
        and h.pickup_window_start is not null
        and h.pickup_window_end is not null
        and tstzrange(h.pickup_window_start, h.pickup_window_end, '[)')
          && tstzrange(:windowStart::timestamptz, :windowEnd::timestamptz, '[)')
      order by h.updated_at desc
      limit 10
    `,
    parameters: [
      sqlParam("itemId", input.itemId),
      sqlParam("windowStart", input.windowStart),
      sqlParam("windowEnd", input.windowEnd),
      sqlParam("excludeBookingId", input.excludeBookingId),
    ],
  });

  return result.rows.map(conflictFromRow);
}

async function findActiveBookingsWithoutComparableWindow(input: {
  itemId: string;
  excludeBookingId: string;
}) {
  const result = await executeSql<ConflictRow>({
    sql: `
      select
        b.id::text as booking_id,
        b.status::text as status,
        null::text as window_start,
        null::text as window_end,
        'active_booking_without_window'::text as source
      from bookings b
      left join handoffs h on h.booking_id = b.id
      where b.item_instance_id = :itemId::uuid
        and b.deleted_at is null
        and b.status in (${statusListSql()})
        ${excludeBookingSql()}
        and (h.id is null or h.pickup_window_start is null or h.pickup_window_end is null)
      order by b.updated_at desc
      limit 10
    `,
    parameters: [
      sqlParam("itemId", input.itemId),
      sqlParam("excludeBookingId", input.excludeBookingId),
    ],
  });

  return result.rows.map(conflictFromRow);
}

export async function checkLendingAvailability(
  input: LendingWindowInput,
): Promise<LendingAvailabilityCheck> {
  const windowStart = isoDate(input.windowStart);
  const windowEnd = isoDate(input.windowEnd);
  const earlyDecision = evaluateLendingAvailability({
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });

  if (!windowStart || !windowEnd || !earlyDecision.available) {
    return { status: "available", decision: earlyDecision };
  }

  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable",
      decision: unavailableDecision("Availability check is unavailable."),
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const [itemAvailability, bookingAvailability, handoffAvailability] =
      await Promise.all([
        getTableAvailability("item_instances"),
        getTableAvailability("bookings"),
        getTableAvailability("handoffs"),
      ]);

    if (!hasColumns(itemAvailability, ["id", "item_state", "deleted_at"])) {
      return {
        status: "unavailable",
        decision: unavailableDecision("Item availability contract is unavailable."),
        reason: "item_instances is missing id, item_state, or deleted_at columns",
      };
    }

    if (
      !hasColumns(bookingAvailability, [
        "id",
        "item_instance_id",
        "status",
        "deleted_at",
        "updated_at",
      ])
    ) {
      return {
        status: "unavailable",
        decision: unavailableDecision("Booking availability contract is unavailable."),
        reason: "bookings is missing live reservation columns",
      };
    }

    const itemState = await loadItemState(input.itemId);
    if (!itemState) {
      return {
        status: "available",
        decision: evaluateLendingAvailability({
          windowStart,
          windowEnd,
          itemState: "missing",
        }),
      };
    }

    const excludeBookingId = input.excludeBookingId ?? "";
    const bookingWindowStart = firstColumn(
      bookingAvailability,
      BOOKING_WINDOW_START_COLUMNS,
    );
    const bookingWindowEnd = firstColumn(
      bookingAvailability,
      BOOKING_WINDOW_END_COLUMNS,
    );
    const conflicts = bookingWindowStart && bookingWindowEnd
      ? await findBookingWindowConflicts({
          itemId: input.itemId,
          windowStart,
          windowEnd,
          excludeBookingId,
          startColumn: bookingWindowStart,
          endColumn: bookingWindowEnd,
        })
        : hasColumns(handoffAvailability, [
          "id",
          "booking_id",
          "pickup_window_start",
          "pickup_window_end",
          "updated_at",
        ])
        ? [
            ...(await findHandoffWindowConflicts({
              itemId: input.itemId,
              windowStart,
              windowEnd,
              excludeBookingId,
            })),
            ...(await findActiveBookingsWithoutComparableWindow({
              itemId: input.itemId,
              excludeBookingId,
            })),
          ]
        : null;

    if (!conflicts) {
      return {
        status: "unavailable",
        decision: unavailableDecision("Borrow window overlap contract is unavailable."),
        reason:
          "No CP4 booking window columns or handoff pickup window columns are available for live overlap checks.",
      };
    }

    return {
      status: "available",
      decision: evaluateLendingAvailability({
        windowStart,
        windowEnd,
        itemState,
        conflicts,
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      decision: unavailableDecision("Availability check is unavailable."),
      reason: publicErrorMessage(error),
    };
  }
}
