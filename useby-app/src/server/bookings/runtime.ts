import { createHash } from "node:crypto";

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
import type { DemoActorContext } from "../demo/context";
import {
  BOOKING_ACTIVE_RESERVATION_STATUSES,
  checkBookingContracts,
  unavailableBookingReason,
  type BookingCompleteInput,
  type BookingDto,
  type BookingReasonInput,
  type BookingRecomputeNote,
  type BookingRequestInput,
  type BookingReviewInput,
  type BookingSchedulePickupInput,
  type BookingStatus,
  type HandoffStatus,
} from "./contracts";

type BookingDetailRow = {
  id: string;
  status: BookingStatus;
  item_instance_id: string;
  item_title: string;
  item_category: string;
  item_quantity: string;
  item_unit: string;
  item_state: string;
  safety_status: string;
  storage_state: string;
  match_id: string | null;
  need_id: string | null;
  booking_quantity: string;
  booking_unit: string;
  request_note: string | null;
  owner_household_id: string;
  owner_public_label: string;
  owner_coarse_location_label: string;
  requester_household_id: string;
  requester_public_label: string;
  requester_coarse_location_label: string;
  handoff_id: string | null;
  handoff_status: HandoffStatus | null;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  coarse_pickup_hint: string | null;
  completion_note: string | null;
  requested_at: string;
  accepted_at: string | null;
  reserved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  picked_up_at: string | null;
  returned_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

type BookingTargetRow = {
  item_instance_id: string;
  match_id: string | null;
  need_id: string | null;
  requester_household_id: string;
  owner_household_id: string;
  neighbourhood_id: string;
  title: string;
  category: string;
  quantity: string;
  unit: string;
  item_state: string;
  storage_state: string;
  safety_status: string;
  expiry_date: string | null;
  owner_coarse_location_label: string;
};

type BookingLockRow = {
  booking_id: string;
  status: BookingStatus;
  item_instance_id: string;
  item_state: string;
  item_category: string;
  item_title: string;
  storage_state: string;
  safety_status: string;
  expiry_date: string | null;
  requester_household_id: string;
  owner_household_id: string;
  neighbourhood_id: string;
  match_id: string | null;
  metadata: unknown;
  owner_coarse_location_label: string;
};

type IdempotencyRow = {
  status: string;
  request_hash: string;
  response_json: unknown | null;
};

const ACTIVE_RESERVATION_SQL = BOOKING_ACTIVE_RESERVATION_STATUSES.map(
  (status) => `'${status}'`,
).join(", ");
const AVAILABLE_ITEM_STATES = new Set(["listed", "offered", "use_soon"]);
const FOOD_STORAGE_STATES = new Set(["sealed", "cupboard", "fridge", "freezer"]);

export class BookingRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BookingRuntimeError";
    this.status = status;
  }
}

export function isBookingRuntimeError(error: unknown): error is BookingRuntimeError {
  return error instanceof BookingRuntimeError;
}

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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function namespaceKey(scope: string, rawKey: string): string {
  const trimmed = rawKey.trim();
  return trimmed.startsWith(`${scope}:`) ? trimmed : `${scope}:${trimmed}`;
}

function autoIdempotencyKey(scope: string, context: DemoActorContext, input: unknown): string {
  return `${scope}:auto:${requestHash({
    householdId: context.household.id,
    input,
  })}`;
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
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

async function ensureBookingRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new BookingRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  const contracts = await checkBookingContracts();
  if (!contracts.available) {
    throw new BookingRuntimeError(503, unavailableBookingReason(contracts));
  }
}

async function beginIdempotentMutation(
  context: TransactionContext,
  key: string,
  scope: string,
  hash: string,
): Promise<unknown | null> {
  const existing = await execTx<IdempotencyRow>(
    context,
    `
      select status, request_hash, response_json
      from idempotency_keys
      where key = :key
      for update
    `,
    { key },
  );

  const row = existing.rows[0];
  if (!row) {
    await execTx(
      context,
      `
        insert into idempotency_keys (
          key, scope, request_hash, status, locked_at, expires_at,
          created_at, updated_at
        )
        values (
          :key, :scope, :requestHash, 'started', now(),
          now() + interval '24 hours', now(), now()
        )
      `,
      { key, scope, requestHash: hash },
    );
    return null;
  }

  if (row.request_hash !== hash) {
    throw new BookingRuntimeError(
      409,
      "Idempotency key already exists for a different booking request.",
    );
  }

  if (row.status === "completed" && row.response_json) {
    return jsonField(row.response_json);
  }

  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'started',
          locked_at = now(),
          expires_at = now() + interval '24 hours',
          updated_at = now()
      where key = :key
    `,
    { key },
  );

  return null;
}

async function completeIdempotentMutation(
  context: TransactionContext,
  key: string,
  response: unknown,
) {
  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'completed',
          response_json = :response::jsonb,
          locked_at = null,
          updated_at = now()
      where key = :key
    `,
    { response: response as Record<string, unknown>, key },
  );
}

function recomputePlaceholder(
  affectedItemIds: string[],
  affectedMatchIds: string[] = [],
): BookingRecomputeNote {
  return {
    invoked: false,
    contract: "checkpoint-2-lane-2b",
    note:
      "Action-card and match recompute/invalidation is owned by the matching lane; booking mutations return affected ids for that contract.",
    affectedItemIds,
    affectedMatchIds,
  };
}

function dtoFromRow(row: BookingDetailRow): BookingDto {
  return {
    id: row.id,
    status: row.status,
    item: {
      id: row.item_instance_id,
      title: row.item_title,
      category: row.item_category,
      quantity: row.item_quantity,
      unit: row.item_unit,
      state: row.item_state,
      safetyStatus: row.safety_status,
      storageState: row.storage_state,
    },
    matchId: row.match_id,
    needId: row.need_id,
    quantity: row.booking_quantity,
    unit: row.booking_unit,
    requestNote: row.request_note,
    owner: {
      householdId: row.owner_household_id,
      publicLabel: row.owner_public_label,
      coarseLocationLabel: row.owner_coarse_location_label,
    },
    requester: {
      householdId: row.requester_household_id,
      publicLabel: row.requester_public_label,
      coarseLocationLabel: row.requester_coarse_location_label,
    },
    handoff: row.handoff_id && row.handoff_status
      ? {
          id: row.handoff_id,
          status: row.handoff_status,
          pickupWindowStart: row.pickup_window_start,
          pickupWindowEnd: row.pickup_window_end,
          coarsePickupHint: row.coarse_pickup_hint,
          completionNote: row.completion_note,
        }
      : null,
    timeline: {
      requestedAt: row.requested_at,
      acceptedAt: row.accepted_at,
      reservedAt: row.reserved_at,
      declinedAt: row.declined_at,
      cancelledAt: row.cancelled_at,
      pickedUpAt: row.picked_up_at,
      returnedAt: row.returned_at,
      completedAt: row.completed_at,
      reviewedAt: row.reviewed_at,
      updatedAt: row.updated_at,
    },
  };
}

async function detailQuery(
  values: { bookingId: string; householdId: string },
  transaction?: TransactionContext,
): Promise<BookingDto | null> {
  const sql = `
    select
      b.id::text as id,
      b.status::text as status,
      i.id::text as item_instance_id,
      i.title as item_title,
      i.category::text as item_category,
      i.quantity::text as item_quantity,
      i.unit as item_unit,
      i.item_state::text as item_state,
      i.safety_status::text as safety_status,
      i.storage_state::text as storage_state,
      b.match_id::text as match_id,
      b.need_id::text as need_id,
      b.quantity::text as booking_quantity,
      b.unit as booking_unit,
      b.request_note,
      owner.id::text as owner_household_id,
      owner.public_label as owner_public_label,
      owner.coarse_location_label as owner_coarse_location_label,
      requester.id::text as requester_household_id,
      requester.public_label as requester_public_label,
      requester.coarse_location_label as requester_coarse_location_label,
      h.id::text as handoff_id,
      h.status::text as handoff_status,
      h.pickup_window_start::text as pickup_window_start,
      h.pickup_window_end::text as pickup_window_end,
      case
        when b.status in ('accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'completed', 'reviewed', 'disputed')
        then h.coarse_pickup_hint
        else null
      end as coarse_pickup_hint,
      h.completion_note,
      b.requested_at::text as requested_at,
      b.accepted_at::text as accepted_at,
      b.reserved_at::text as reserved_at,
      b.declined_at::text as declined_at,
      b.cancelled_at::text as cancelled_at,
      b.picked_up_at::text as picked_up_at,
      b.returned_at::text as returned_at,
      b.completed_at::text as completed_at,
      b.reviewed_at::text as reviewed_at,
      b.updated_at::text as updated_at
    from bookings b
    join item_instances i on i.id = b.item_instance_id
    join households owner on owner.id = b.owner_household_id
    join households requester on requester.id = b.requester_household_id
    left join handoffs h on h.booking_id = b.id
    where b.id = :bookingId::uuid
      and b.deleted_at is null
      and (
        b.requester_household_id = :householdId::uuid
        or b.owner_household_id = :householdId::uuid
      )
    limit 1
  `;

  const result = transaction
    ? await execTx<BookingDetailRow>(transaction, sql, values)
    : await executeSql<BookingDetailRow>({
        sql,
        parameters: params(values),
      });

  const row = result.rows[0];
  return row ? dtoFromRow(row) : null;
}

async function assertNotBlocked(
  context: TransactionContext,
  leftHouseholdId: string,
  rightHouseholdId: string,
) {
  const result = await execTx<{ id: string }>(
    context,
    `
      select id::text as id
      from blocks
      where status = 'active'
        and (
          (blocker_household_id = :leftHouseholdId::uuid and blocked_household_id = :rightHouseholdId::uuid)
          or (blocker_household_id = :rightHouseholdId::uuid and blocked_household_id = :leftHouseholdId::uuid)
        )
      limit 1
    `,
    { leftHouseholdId, rightHouseholdId },
  );

  if (result.rows[0]) {
    throw new BookingRuntimeError(403, "Booking is unavailable between blocked households.");
  }
}

function assertFoodShareable(row: {
  category: string;
  safety_status: string;
  storage_state: string;
  expiry_date: string | null;
}) {
  if (row.category !== "grocery") {
    return;
  }

  if (row.safety_status !== "eligible") {
    throw new BookingRuntimeError(409, "This grocery item is not eligible for neighbour sharing.");
  }

  if (!FOOD_STORAGE_STATES.has(row.storage_state)) {
    throw new BookingRuntimeError(409, "Opened or cooked grocery items cannot be booked for sharing.");
  }

  if (row.expiry_date && row.expiry_date < new Date().toISOString().slice(0, 10)) {
    throw new BookingRuntimeError(409, "Expired grocery items cannot be booked for sharing.");
  }
}

function assertItemAvailable(row: { item_state: string }) {
  if (!AVAILABLE_ITEM_STATES.has(row.item_state)) {
    throw new BookingRuntimeError(409, "Item is not currently available for booking.");
  }
}

async function findFoodSafetyAcknowledgement(
  context: TransactionContext,
  householdId: string,
) {
  const result = await execTx<{ id: string }>(
    context,
    `
      select id::text as id
      from safety_acknowledgements
      where household_id = :householdId::uuid
        and acknowledgement_type = 'food_handoff'
        and (expires_at is null or expires_at > now())
      order by acknowledged_at desc
      limit 1
    `,
    { householdId },
  );

  return result.rows[0]?.id ?? null;
}

async function loadRequestTarget(
  context: TransactionContext,
  demoContext: DemoActorContext,
  input: BookingRequestInput,
): Promise<BookingTargetRow> {
  if (input.matchId) {
    const result = await execTx<BookingTargetRow>(
      context,
      `
        select
          i.id::text as item_instance_id,
          m.id::text as match_id,
          m.need_id::text as need_id,
          m.requester_household_id::text as requester_household_id,
          m.owner_household_id::text as owner_household_id,
          m.neighbourhood_id::text as neighbourhood_id,
          i.title,
          i.category::text as category,
          i.quantity::text as quantity,
          i.unit,
          i.item_state::text as item_state,
          i.storage_state::text as storage_state,
          i.safety_status::text as safety_status,
          coalesce(i.use_by_date, i.best_before_date, i.expires_at::date)::text as expiry_date,
          owner.coarse_location_label as owner_coarse_location_label
        from matches m
        join item_instances i on i.id = m.item_instance_id
        join households owner on owner.id = m.owner_household_id
        where m.id = :matchId::uuid
          and m.requester_household_id = :householdId::uuid
          and m.status in ('active', 'proposed', 'accepted')
          and m.deleted_at is null
          and i.deleted_at is null
        limit 1
      `,
      {
        matchId: input.matchId,
        householdId: demoContext.household.id,
      },
    );

    const row = result.rows[0];
    if (!row) {
      throw new BookingRuntimeError(404, "Match is not available for this demo household.");
    }

    return row;
  }

  const result = await execTx<BookingTargetRow>(
    context,
    `
      select
        i.id::text as item_instance_id,
        null::text as match_id,
        nullif(:needId, '')::text as need_id,
        :householdId::text as requester_household_id,
        i.owner_household_id::text as owner_household_id,
        i.neighbourhood_id::text as neighbourhood_id,
        i.title,
        i.category::text as category,
        i.quantity::text as quantity,
        i.unit,
        i.item_state::text as item_state,
        i.storage_state::text as storage_state,
        i.safety_status::text as safety_status,
        coalesce(i.use_by_date, i.best_before_date, i.expires_at::date)::text as expiry_date,
        owner.coarse_location_label as owner_coarse_location_label
      from item_instances i
      join households owner on owner.id = i.owner_household_id
      where i.id = :itemId::uuid
        and i.owner_household_id is not null
        and i.deleted_at is null
      limit 1
    `,
    {
      itemId: input.itemId ?? "",
      needId: input.needId ?? "",
      householdId: demoContext.household.id,
    },
  );

  const row = result.rows[0];
  if (!row) {
    throw new BookingRuntimeError(404, "Item is not available for booking.");
  }

  return row;
}

async function lockBookingForActor(
  context: TransactionContext,
  bookingId: string,
  householdId: string,
) {
  const result = await execTx<BookingLockRow>(
    context,
    `
      select
        b.id::text as booking_id,
        b.status::text as status,
        b.item_instance_id::text as item_instance_id,
        i.item_state::text as item_state,
        i.category::text as item_category,
        i.title as item_title,
        i.storage_state::text as storage_state,
        i.safety_status::text as safety_status,
        coalesce(i.use_by_date, i.best_before_date, i.expires_at::date)::text as expiry_date,
        b.requester_household_id::text as requester_household_id,
        b.owner_household_id::text as owner_household_id,
        b.neighbourhood_id::text as neighbourhood_id,
        b.match_id::text as match_id,
        b.metadata,
        owner.coarse_location_label as owner_coarse_location_label
      from bookings b
      join item_instances i on i.id = b.item_instance_id
      join households owner on owner.id = b.owner_household_id
      where b.id = :bookingId::uuid
        and b.deleted_at is null
        and (
          b.requester_household_id = :householdId::uuid
          or b.owner_household_id = :householdId::uuid
        )
      for update of b, i
    `,
    { bookingId, householdId },
  );

  const row = result.rows[0];
  if (!row) {
    throw new BookingRuntimeError(404, "Booking not found for this demo household.");
  }

  return row;
}

async function writeInventoryEvent(
  context: TransactionContext,
  input: {
    itemId: string;
    userId: string;
    householdId: string;
    eventType: "state_changed" | "observed";
    fromState: string;
    toState: string;
    metadata: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into inventory_events (
        item_instance_id, actor_user_id, household_id, event_type,
        from_state, to_state, metadata
      )
      values (
        :itemId::uuid, :userId::uuid, :householdId::uuid,
        :eventType::inventory_event_type, :fromState::item_state,
        :toState::item_state, :metadata::jsonb
      )
    `,
    input,
  );
}

async function writeAuditEvent(
  context: TransactionContext,
  demoContext: DemoActorContext,
  input: {
    bookingId: string;
    action: string;
    route: string;
    idempotencyKey: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into audit_events (
        actor_user_id, actor_household_id, entity_type, entity_id,
        action, source, source_route, idempotency_key, before_state,
        after_state, metadata, demo_scope_id, is_demo
      )
      values (
        :userId::uuid, :householdId::uuid, 'booking', :bookingId::uuid,
        :action, 'api', :route, :idempotencyKey,
        :beforeState::jsonb, :afterState::jsonb, :metadata::jsonb,
        :demoScope, true
      )
    `,
    {
      userId: demoContext.user.id,
      householdId: demoContext.household.id,
      bookingId: input.bookingId,
      action: input.action,
      route: input.route,
      idempotencyKey: input.idempotencyKey,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      metadata: input.metadata ?? {},
      demoScope: demoContext.demoScope,
    },
  );
}

async function responseForBooking(
  context: TransactionContext,
  demoContext: DemoActorContext,
  bookingId: string,
  recompute: BookingRecomputeNote,
) {
  const booking = await detailQuery(
    { bookingId, householdId: demoContext.household.id },
    context,
  );

  if (!booking) {
    throw new BookingRuntimeError(500, "Booking transition completed but detail projection failed.");
  }

  return {
    ok: true as const,
    idempotent: false,
    booking,
    recompute,
  };
}

async function mutateBooking(
  demoContext: DemoActorContext,
  scope: string,
  idempotencyKey: string | undefined,
  hashInput: unknown,
  operation: (
    transaction: TransactionContext,
    key: string,
  ) => Promise<{
    bookingId: string;
    recompute: BookingRecomputeNote;
  }>,
) {
  await ensureBookingRuntimeAvailable();
  const key = idempotencyKey
    ? namespaceKey(scope, idempotencyKey)
    : autoIdempotencyKey(scope, demoContext, hashInput);
  const hash = requestHash({
    householdId: demoContext.household.id,
    scope,
    input: hashInput,
  });

  try {
    return await withTransaction(async (transaction) => {
      const existing = await beginIdempotentMutation(transaction, key, scope, hash);
      if (existing) {
        return {
          ...(existing as Awaited<ReturnType<typeof responseForBooking>>),
          idempotent: true,
        };
      }

      const result = await operation(transaction, key);
      const response = await responseForBooking(
        transaction,
        demoContext,
        result.bookingId,
        result.recompute,
      );
      await completeIdempotentMutation(transaction, key, response);
      return response;
    });
  } catch (error) {
    if (isBookingRuntimeError(error)) {
      throw error;
    }

    throw new BookingRuntimeError(503, publicErrorMessage(error));
  }
}

export async function requestBooking(
  demoContext: DemoActorContext,
  input: BookingRequestInput,
) {
  return mutateBooking(
    demoContext,
    "booking.request",
    input.idempotencyKey,
    input,
    async (transaction, key) => {
      const target = await loadRequestTarget(transaction, demoContext, input);
      if (target.requester_household_id !== demoContext.household.id) {
        throw new BookingRuntimeError(403, "Booking requester does not match demo actor.");
      }
      if (target.owner_household_id === demoContext.household.id) {
        throw new BookingRuntimeError(409, "A household cannot request its own item.");
      }

      assertItemAvailable(target);
      assertFoodShareable(target);
      await assertNotBlocked(
        transaction,
        target.requester_household_id,
        target.owner_household_id,
      );

      const safetyAcknowledgementId =
        target.category === "grocery"
          ? await findFoodSafetyAcknowledgement(transaction, target.requester_household_id)
          : null;
      if (target.category === "grocery" && !safetyAcknowledgementId) {
        throw new BookingRuntimeError(
          412,
          "Food safety acknowledgement is required before requesting a grocery handoff.",
        );
      }

      const created = await execTx<{ id: string }>(
        transaction,
        `
          insert into bookings (
            item_instance_id, match_id, need_id, requester_household_id,
            owner_household_id, neighbourhood_id, requested_by_user_id,
            status, quantity, unit, request_note, safety_acknowledgement_id,
            idempotency_key, metadata, demo_scope_id, is_demo
          )
          values (
            :itemId::uuid, nullif(:matchId, '')::uuid, nullif(:needId, '')::uuid,
            :requesterHouseholdId::uuid, :ownerHouseholdId::uuid,
            :neighbourhoodId::uuid, :userId::uuid, 'requested',
            :quantity, :unit, nullif(:note, ''),
            nullif(:safetyAcknowledgementId, '')::uuid, :idempotencyKey,
            :metadata::jsonb, :demoScope, true
          )
          returning id::text as id
        `,
        {
          itemId: target.item_instance_id,
          matchId: target.match_id ?? "",
          needId: target.need_id ?? input.needId ?? "",
          requesterHouseholdId: target.requester_household_id,
          ownerHouseholdId: target.owner_household_id,
          neighbourhoodId: target.neighbourhood_id,
          userId: demoContext.user.id,
          quantity: input.quantity,
          unit: input.unit ?? target.unit,
          note: input.note ?? "",
          safetyAcknowledgementId: safetyAcknowledgementId ?? "",
          idempotencyKey: key,
          metadata: {
            ...input.metadata,
            requestedFrom: input.matchId ? "match" : "item",
          },
          demoScope: demoContext.demoScope,
        },
      );

      if (target.match_id) {
        await execTx(
          transaction,
          `
            update matches
            set status = 'converted',
                converted_at = now(),
                updated_at = now()
            where id = :matchId::uuid
          `,
          { matchId: target.match_id },
        );
      }

      await writeInventoryEvent(transaction, {
        itemId: target.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: target.item_state,
        toState: target.item_state,
        metadata: {
          bookingId: created.rows[0].id,
          transition: "requested",
          idempotencyKey: key,
        },
      });

      await writeAuditEvent(transaction, demoContext, {
        bookingId: created.rows[0].id,
        action: "booking.requested",
        route: "/api/bookings/request",
        idempotencyKey: key,
        metadata: {
          itemId: target.item_instance_id,
          matchId: target.match_id,
        },
      });

      return {
        bookingId: created.rows[0].id,
        recompute: recomputePlaceholder(
          [target.item_instance_id],
          target.match_id ? [target.match_id] : [],
        ),
      };
    },
  );
}

export async function acceptBooking(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReasonInput,
) {
  return mutateBooking(
    demoContext,
    "booking.accept",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      await execTx(transaction, "set transaction isolation level serializable");
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.owner_household_id !== demoContext.household.id) {
        throw new BookingRuntimeError(403, "Only the owner household can accept this booking.");
      }
      if (locked.status !== "requested") {
        throw new BookingRuntimeError(409, `Booking cannot be accepted from ${locked.status}.`);
      }

      assertItemAvailable({
        item_state: locked.item_state,
      });
      assertFoodShareable({
        category: locked.item_category,
        safety_status: locked.safety_status,
        storage_state: locked.storage_state,
        expiry_date: locked.expiry_date,
      });
      await assertNotBlocked(
        transaction,
        locked.requester_household_id,
        locked.owner_household_id,
      );

      const conflict = await execTx<{ id: string }>(
        transaction,
        `
          select id::text as id
          from bookings
          where item_instance_id = :itemId::uuid
            and id <> :bookingId::uuid
            and status in (${ACTIVE_RESERVATION_SQL})
          limit 1
          for update
        `,
        {
          itemId: locked.item_instance_id,
          bookingId,
        },
      );

      if (conflict.rows[0]) {
        throw new BookingRuntimeError(409, "Item already has an active reservation.");
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'reserved',
              owner_actor_user_id = :userId::uuid,
              accepted_at = now(),
              reserved_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        {
          bookingId,
          userId: demoContext.user.id,
          metadata: {
            ...input.metadata,
            reservedFromState: locked.item_state,
          },
        },
      );

      await execTx(
        transaction,
        `
          update item_instances
          set item_state = 'reserved',
              updated_at = now()
          where id = :itemId::uuid
        `,
        { itemId: locked.item_instance_id },
      );

      await execTx(
        transaction,
        `
          insert into handoffs (
            booking_id, status, coarse_pickup_hint, metadata,
            demo_scope_id, is_demo
          )
          values (
            :bookingId::uuid, 'pending', :coarsePickupHint,
            :metadata::jsonb, :demoScope, true
          )
          on conflict (booking_id) do update
          set status = 'pending',
              coarse_pickup_hint = excluded.coarse_pickup_hint,
              updated_at = now()
        `,
        {
          bookingId,
          coarsePickupHint: locked.owner_coarse_location_label,
          metadata: {
            createdBy: "booking.accept",
          },
          demoScope: demoContext.demoScope,
        },
      );

      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "reserved",
        metadata: {
          bookingId,
          idempotencyKey: key,
        },
      });

      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.accepted",
        route: "/api/bookings/[bookingId]/accept",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
          itemState: locked.item_state,
        },
        afterState: {
          bookingStatus: "reserved",
          itemState: "reserved",
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function declineBooking(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReasonInput,
) {
  return terminalRequestTransition(
    demoContext,
    bookingId,
    input,
    "declined",
    "booking.declined",
    "/api/bookings/[bookingId]/decline",
  );
}

export async function cancelBooking(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReasonInput,
) {
  return mutateBooking(
    demoContext,
    "booking.cancel",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (["completed", "reviewed", "declined", "cancelled"].includes(locked.status)) {
        throw new BookingRuntimeError(409, `Booking cannot be cancelled from ${locked.status}.`);
      }
      if (!["requested", "reserved", "pickup_scheduled"].includes(locked.status)) {
        throw new BookingRuntimeError(409, "Picked-up bookings must be completed or disputed.");
      }

      const metadata = metadataObject(locked.metadata);
      const restoreState =
        typeof metadata.reservedFromState === "string"
          ? metadata.reservedFromState
          : "listed";

      await execTx(
        transaction,
        `
          update bookings
          set status = 'cancelled',
              cancel_reason = nullif(:reason, ''),
              cancelled_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        {
          bookingId,
          reason: input.reason ?? "",
          metadata: input.metadata,
        },
      );

      await execTx(
        transaction,
        `
          update handoffs
          set status = 'cancelled',
              updated_at = now()
          where booking_id = :bookingId::uuid
        `,
        { bookingId },
      );

      if (locked.status !== "requested") {
        await execTx(
          transaction,
          `
            update item_instances
            set item_state = :restoreState::item_state,
                updated_at = now()
            where id = :itemId::uuid
          `,
          {
            itemId: locked.item_instance_id,
            restoreState,
          },
        );
        await writeInventoryEvent(transaction, {
          itemId: locked.item_instance_id,
          userId: demoContext.user.id,
          householdId: demoContext.household.id,
          eventType: "state_changed",
          fromState: locked.item_state,
          toState: restoreState,
          metadata: {
            bookingId,
            idempotencyKey: key,
          },
        });
      } else {
        await writeInventoryEvent(transaction, {
          itemId: locked.item_instance_id,
          userId: demoContext.user.id,
          householdId: demoContext.household.id,
          eventType: "observed",
          fromState: locked.item_state,
          toState: locked.item_state,
          metadata: {
            bookingId,
            transition: "cancelled",
            idempotencyKey: key,
          },
        });
      }

      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.cancelled",
        route: "/api/bookings/[bookingId]/cancel",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
        },
        afterState: {
          bookingStatus: "cancelled",
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

async function terminalRequestTransition(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReasonInput,
  nextStatus: "declined",
  action: string,
  route: string,
) {
  return mutateBooking(
    demoContext,
    `booking.${nextStatus}`,
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.owner_household_id !== demoContext.household.id) {
        throw new BookingRuntimeError(403, "Only the owner household can decline this booking.");
      }
      if (locked.status !== "requested") {
        throw new BookingRuntimeError(409, `Booking cannot be declined from ${locked.status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = :nextStatus::booking_status,
              decline_reason = nullif(:reason, ''),
              declined_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        {
          bookingId,
          nextStatus,
          reason: input.reason ?? "",
          metadata: input.metadata,
        },
      );

      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: {
          bookingId,
          transition: nextStatus,
          idempotencyKey: key,
        },
      });

      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action,
        route,
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
        },
        afterState: {
          bookingStatus: nextStatus,
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function schedulePickup(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingSchedulePickupInput,
) {
  return mutateBooking(
    demoContext,
    "booking.schedule-pickup",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["reserved", "accepted"].includes(locked.status)) {
        throw new BookingRuntimeError(409, `Pickup cannot be scheduled from ${locked.status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'pickup_scheduled',
              updated_at = now()
          where id = :bookingId::uuid
        `,
        { bookingId },
      );

      await execTx(
        transaction,
        `
          insert into handoffs (
            booking_id, status, pickup_window_start, pickup_window_end,
            coarse_pickup_hint, scheduled_by_user_id, scheduled_at, metadata,
            demo_scope_id, is_demo
          )
          values (
            :bookingId::uuid, 'scheduled',
            :pickupWindowStart::timestamp with time zone,
            :pickupWindowEnd::timestamp with time zone,
            :coarsePickupHint, :userId::uuid, now(), :metadata::jsonb,
            :demoScope, true
          )
          on conflict (booking_id) do update
          set status = 'scheduled',
              pickup_window_start = excluded.pickup_window_start,
              pickup_window_end = excluded.pickup_window_end,
              coarse_pickup_hint = excluded.coarse_pickup_hint,
              scheduled_by_user_id = excluded.scheduled_by_user_id,
              scheduled_at = now(),
              metadata = handoffs.metadata || excluded.metadata,
              updated_at = now()
        `,
        {
          bookingId,
          pickupWindowStart: input.pickupWindowStart,
          pickupWindowEnd: input.pickupWindowEnd,
          coarsePickupHint: input.coarsePickupHint ?? locked.owner_coarse_location_label,
          userId: demoContext.user.id,
          metadata: input.metadata,
          demoScope: demoContext.demoScope,
        },
      );

      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: {
          bookingId,
          transition: "pickup_scheduled",
          idempotencyKey: key,
        },
      });

      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.pickup_scheduled",
        route: "/api/bookings/[bookingId]/schedule-pickup",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
        },
        afterState: {
          bookingStatus: "pickup_scheduled",
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function markPickedUp(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReasonInput,
) {
  return mutateBooking(
    demoContext,
    "booking.picked-up",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["reserved", "pickup_scheduled"].includes(locked.status)) {
        throw new BookingRuntimeError(409, `Booking cannot be marked picked up from ${locked.status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'picked_up',
              picked_up_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        { bookingId, metadata: input.metadata },
      );
      await execTx(
        transaction,
        `
          update item_instances
          set item_state = 'picked_up',
              updated_at = now()
          where id = :itemId::uuid
        `,
        { itemId: locked.item_instance_id },
      );
      await execTx(
        transaction,
        `
          update handoffs
          set status = 'picked_up',
              picked_up_by_user_id = :userId::uuid,
              picked_up_at = now(),
              updated_at = now()
          where booking_id = :bookingId::uuid
        `,
        { bookingId, userId: demoContext.user.id },
      );
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "picked_up",
        metadata: {
          bookingId,
          idempotencyKey: key,
        },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.picked_up",
        route: "/api/bookings/[bookingId]/picked-up",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
          itemState: locked.item_state,
        },
        afterState: {
          bookingStatus: "picked_up",
          itemState: "picked_up",
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function completeBooking(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingCompleteInput,
) {
  return mutateBooking(
    demoContext,
    "booking.complete",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["picked_up", "returned"].includes(locked.status)) {
        throw new BookingRuntimeError(409, `Booking cannot be completed from ${locked.status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'completed',
              completed_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        { bookingId, metadata: input.metadata },
      );
      await execTx(
        transaction,
        `
          update item_instances
          set item_state = 'completed',
              updated_at = now()
          where id = :itemId::uuid
        `,
        { itemId: locked.item_instance_id },
      );
      await execTx(
        transaction,
        `
          update handoffs
          set status = 'completed',
              completed_by_user_id = :userId::uuid,
              completed_at = now(),
              completion_note = nullif(:note, ''),
              updated_at = now()
          where booking_id = :bookingId::uuid
        `,
        {
          bookingId,
          userId: demoContext.user.id,
          note: input.note ?? "",
        },
      );
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "completed",
        metadata: {
          bookingId,
          idempotencyKey: key,
        },
      });
      await execTx(
        transaction,
        `
          insert into trust_events (
            booking_id, household_id, actor_household_id, actor_user_id,
            event_type, delta, rationale, metadata, demo_scope_id, is_demo
          )
          values
            (
              :bookingId::uuid, :ownerHouseholdId::uuid,
              :actorHouseholdId::uuid, :userId::uuid, 'booking_completed',
              5, 'Completed booking handoff', :metadata::jsonb,
              :demoScope, true
            ),
            (
              :bookingId::uuid, :requesterHouseholdId::uuid,
              :actorHouseholdId::uuid, :userId::uuid, 'booking_completed',
              5, 'Completed booking handoff', :metadata::jsonb,
              :demoScope, true
            )
        `,
        {
          bookingId,
          ownerHouseholdId: locked.owner_household_id,
          requesterHouseholdId: locked.requester_household_id,
          actorHouseholdId: demoContext.household.id,
          userId: demoContext.user.id,
          metadata: {
            itemId: locked.item_instance_id,
          },
          demoScope: demoContext.demoScope,
        },
      );
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.completed",
        route: "/api/bookings/[bookingId]/complete",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
          itemState: locked.item_state,
        },
        afterState: {
          bookingStatus: "completed",
          itemState: "completed",
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function reviewBooking(
  demoContext: DemoActorContext,
  bookingId: string,
  input: BookingReviewInput,
) {
  return mutateBooking(
    demoContext,
    "booking.review",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["completed", "reviewed"].includes(locked.status)) {
        throw new BookingRuntimeError(409, `Booking cannot be reviewed from ${locked.status}.`);
      }

      const revieweeHouseholdId =
        locked.owner_household_id === demoContext.household.id
          ? locked.requester_household_id
          : locked.owner_household_id;
      const delta = input.rating === "positive" ? 2 : input.rating === "negative" ? -5 : 0;

      await execTx(
        transaction,
        `
          insert into reviews (
            booking_id, reviewer_household_id, reviewee_household_id,
            reviewer_user_id, rating, note, metadata, demo_scope_id, is_demo
          )
          values (
            :bookingId::uuid, :reviewerHouseholdId::uuid,
            :revieweeHouseholdId::uuid, :userId::uuid,
            :rating::review_rating, nullif(:note, ''),
            :metadata::jsonb, :demoScope, true
          )
          on conflict (booking_id, reviewer_household_id) do update
          set rating = excluded.rating,
              note = excluded.note,
              metadata = reviews.metadata || excluded.metadata,
              updated_at = now(),
              deleted_at = null
        `,
        {
          bookingId,
          reviewerHouseholdId: demoContext.household.id,
          revieweeHouseholdId,
          userId: demoContext.user.id,
          rating: input.rating,
          note: input.note ?? "",
          metadata: input.metadata,
          demoScope: demoContext.demoScope,
        },
      );

      await execTx(
        transaction,
        `
          update bookings
          set status = 'reviewed',
              reviewed_at = coalesce(reviewed_at, now()),
              updated_at = now()
          where id = :bookingId::uuid
        `,
        { bookingId },
      );

      await execTx(
        transaction,
        `
          insert into trust_events (
            booking_id, household_id, actor_household_id, actor_user_id,
            event_type, delta, rationale, metadata, demo_scope_id, is_demo
          )
          values (
            :bookingId::uuid, :revieweeHouseholdId::uuid,
            :reviewerHouseholdId::uuid, :userId::uuid, 'booking_reviewed',
            :delta, :rationale, :metadata::jsonb, :demoScope, true
          )
        `,
        {
          bookingId,
          revieweeHouseholdId,
          reviewerHouseholdId: demoContext.household.id,
          userId: demoContext.user.id,
          delta,
          rationale: `Booking review: ${input.rating}`,
          metadata: {
            rating: input.rating,
          },
          demoScope: demoContext.demoScope,
        },
      );

      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: {
          bookingId,
          transition: "reviewed",
          idempotencyKey: key,
        },
      });

      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "booking.reviewed",
        route: "/api/bookings/[bookingId]/review",
        idempotencyKey: key,
        beforeState: {
          bookingStatus: locked.status,
        },
        afterState: {
          bookingStatus: "reviewed",
          rating: input.rating,
        },
      });

      return {
        bookingId,
        recompute: recomputePlaceholder(
          [locked.item_instance_id],
          locked.match_id ? [locked.match_id] : [],
        ),
      };
    },
  );
}

export async function listBookings(demoContext: DemoActorContext) {
  await ensureBookingRuntimeAvailable();

  try {
    const result = await executeSql<BookingDetailRow>({
      sql: `
        select
          b.id::text as id,
          b.status::text as status,
          i.id::text as item_instance_id,
          i.title as item_title,
          i.category::text as item_category,
          i.quantity::text as item_quantity,
          i.unit as item_unit,
          i.item_state::text as item_state,
          i.safety_status::text as safety_status,
          i.storage_state::text as storage_state,
          b.match_id::text as match_id,
          b.need_id::text as need_id,
          b.quantity::text as booking_quantity,
          b.unit as booking_unit,
          b.request_note,
          owner.id::text as owner_household_id,
          owner.public_label as owner_public_label,
          owner.coarse_location_label as owner_coarse_location_label,
          requester.id::text as requester_household_id,
          requester.public_label as requester_public_label,
          requester.coarse_location_label as requester_coarse_location_label,
          h.id::text as handoff_id,
          h.status::text as handoff_status,
          h.pickup_window_start::text as pickup_window_start,
          h.pickup_window_end::text as pickup_window_end,
          case
            when b.status in ('accepted', 'reserved', 'pickup_scheduled', 'picked_up', 'returned', 'completed', 'reviewed', 'disputed')
            then h.coarse_pickup_hint
            else null
          end as coarse_pickup_hint,
          h.completion_note,
          b.requested_at::text as requested_at,
          b.accepted_at::text as accepted_at,
          b.reserved_at::text as reserved_at,
          b.declined_at::text as declined_at,
          b.cancelled_at::text as cancelled_at,
          b.picked_up_at::text as picked_up_at,
          b.returned_at::text as returned_at,
          b.completed_at::text as completed_at,
          b.reviewed_at::text as reviewed_at,
          b.updated_at::text as updated_at
        from bookings b
        join item_instances i on i.id = b.item_instance_id
        join households owner on owner.id = b.owner_household_id
        join households requester on requester.id = b.requester_household_id
        left join handoffs h on h.booking_id = b.id
        where b.deleted_at is null
          and (
            b.requester_household_id = :householdId::uuid
            or b.owner_household_id = :householdId::uuid
          )
        order by b.updated_at desc, b.created_at desc
        limit 100
      `,
      parameters: params({ householdId: demoContext.household.id }),
    });

    return {
      ok: true as const,
      bookings: result.rows.map(dtoFromRow),
    };
  } catch (error) {
    if (isBookingRuntimeError(error)) {
      throw error;
    }

    throw new BookingRuntimeError(503, publicErrorMessage(error));
  }
}

export async function getBookingDetail(
  demoContext: DemoActorContext,
  bookingId: string,
) {
  await ensureBookingRuntimeAvailable();

  try {
    const booking = await detailQuery({
      bookingId,
      householdId: demoContext.household.id,
    });

    if (!booking) {
      throw new BookingRuntimeError(404, "Booking not found for this demo household.");
    }

    return {
      ok: true as const,
      booking,
    };
  } catch (error) {
    if (isBookingRuntimeError(error)) {
      throw error;
    }

    throw new BookingRuntimeError(503, publicErrorMessage(error));
  }
}
