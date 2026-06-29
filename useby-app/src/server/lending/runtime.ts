import { createHash } from "node:crypto";

import type { HandoffStatus } from "../bookings/contracts";
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
import { persistHouseholdTrustScore } from "../trust/runtime";
import {
  checkLendingContracts,
  LENDING_ELIGIBLE_CATEGORIES,
  LENDING_LISTABLE_ITEM_STATES,
  unavailableLendingReason,
  type LendingBookingDto,
  type LendingCategory,
  type LendingCompleteInput,
  type LendingConditionEventType,
  type LendingListingDto,
  type LendingReasonInput,
  type LendingRequestInput,
  type LendingReservationStatus,
  type LendingReviewInput,
  type LendingSchedulePickupInput,
  type LendingTermsDto,
} from "./contracts";

type IdempotencyRow = {
  status: string;
  request_hash: string;
  response_json: unknown | null;
};

type ListingRow = {
  id: string;
  title: string;
  category: LendingCategory;
  description: string | null;
  quantity: string;
  unit: string;
  item_state: string;
  metadata: unknown;
  owner_household_id: string;
  owner_coarse_location_label: string;
  active_reservations: unknown;
};

type LendingDetailRow = {
  id: string;
  status: LendingBookingDto["status"];
  item_instance_id: string;
  item_title: string;
  item_category: LendingCategory;
  item_state: string;
  item_metadata: unknown;
  request_note: string | null;
  owner_household_id: string;
  owner_coarse_location_label: string;
  requester_household_id: string;
  requester_coarse_location_label: string;
  reservation_id: string;
  reservation_status: LendingReservationStatus;
  borrow_window_start: string;
  borrow_window_end: string;
  reservation_accepted_at: string | null;
  reservation_released_at: string | null;
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

type LendingLockRow = {
  booking_id: string;
  booking_status: LendingBookingDto["status"];
  item_instance_id: string;
  item_state: string;
  item_category: string;
  item_title: string;
  item_metadata: unknown;
  requester_household_id: string;
  owner_household_id: string;
  neighbourhood_id: string;
  owner_coarse_location_label: string;
  reservation_id: string;
  reservation_status: LendingReservationStatus;
  window_start: string;
  window_end: string;
};

type RequestTargetRow = {
  item_instance_id: string;
  owner_household_id: string;
  neighbourhood_id: string;
  title: string;
  category: string;
  quantity: string;
  unit: string;
  item_state: string;
  metadata: unknown;
  owner_coarse_location_label: string;
};

export class LendingRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LendingRuntimeError";
    this.status = status;
  }
}

export function isLendingRuntimeError(error: unknown): error is LendingRuntimeError {
  return error instanceof LendingRuntimeError;
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

function textFromMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function termsFromMetadata(
  metadata: Record<string, unknown>,
  ownerCoarseLocationLabel: string,
): LendingTermsDto {
  const ownerTerms = textFromMetadata(metadata, "lendingTerms");
  const availabilityNote = textFromMetadata(metadata, "availabilityNote");
  const condition = textFromMetadata(metadata, "condition");
  const depositPreferenceNote =
    ownerTerms && /deposit/i.test(ownerTerms) ? ownerTerms : null;

  return {
    conditionNote: condition,
    returnExpectations: ownerTerms,
    cleaningOrHandlingNote: ownerTerms && /clean|dry|empty|deflated|return/i.test(ownerTerms)
      ? ownerTerms
      : null,
    pickupHint: availabilityNote ?? ownerCoarseLocationLabel,
    ownerTerms,
    depositPreferenceNote,
    paymentDeferredNotice:
      "Payments and deposit capture are deferred in Checkpoint 4; deposit wording is owner preference only.",
  };
}

function listingDtoFromRow(row: ListingRow): LendingListingDto {
  const metadata = metadataObject(row.metadata);
  const activeReservations = jsonField(row.active_reservations);
  const reservations = Array.isArray(activeReservations)
    ? activeReservations
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
        )
        .map((entry) => ({
          windowStart: String(entry.windowStart ?? ""),
          windowEnd: String(entry.windowEnd ?? ""),
          status: "active" as const,
        }))
        .filter((entry) => entry.windowStart && entry.windowEnd)
    : [];

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    size: textFromMetadata(metadata, "size"),
    condition: textFromMetadata(metadata, "condition"),
    availabilityNote: textFromMetadata(metadata, "availabilityNote"),
    owner: {
      householdId: row.owner_household_id,
      coarseLocationLabel: row.owner_coarse_location_label,
    },
    terms: termsFromMetadata(metadata, row.owner_coarse_location_label),
    activeReservations: reservations,
  };
}

function detailDtoFromRow(row: LendingDetailRow): LendingBookingDto {
  const metadata = metadataObject(row.item_metadata);

  return {
    id: row.id,
    status: row.status,
    item: {
      id: row.item_instance_id,
      title: row.item_title,
      category: row.item_category,
      state: row.item_state,
      condition: textFromMetadata(metadata, "condition"),
      size: textFromMetadata(metadata, "size"),
    },
    reservation: {
      id: row.reservation_id,
      status: row.reservation_status,
      borrowWindowStart: row.borrow_window_start,
      borrowWindowEnd: row.borrow_window_end,
      acceptedAt: row.reservation_accepted_at,
      releasedAt: row.reservation_released_at,
    },
    owner: {
      householdId: row.owner_household_id,
      coarseLocationLabel: row.owner_coarse_location_label,
    },
    requester: {
      householdId: row.requester_household_id,
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
    requestNote: row.request_note,
    terms: termsFromMetadata(metadata, row.owner_coarse_location_label),
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

async function ensureLendingRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new LendingRuntimeError(503, `Aurora env missing: ${env.missing.join(", ")}`);
  }

  const contracts = await checkLendingContracts();
  if (!contracts.available) {
    throw new LendingRuntimeError(503, unavailableLendingReason(contracts));
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
    throw new LendingRuntimeError(
      409,
      "Idempotency key already exists for a different lending request.",
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

async function detailQuery(
  values: { bookingId: string; householdId: string },
  transaction?: TransactionContext,
): Promise<LendingBookingDto | null> {
  const sql = `
    select
      b.id::text as id,
      b.status::text as status,
      i.id::text as item_instance_id,
      i.title as item_title,
      i.category::text as item_category,
      i.item_state::text as item_state,
      i.metadata as item_metadata,
      b.request_note,
      owner.id::text as owner_household_id,
      owner.coarse_location_label as owner_coarse_location_label,
      requester.id::text as requester_household_id,
      requester.coarse_location_label as requester_coarse_location_label,
      lr.id::text as reservation_id,
      lr.status::text as reservation_status,
      lr.window_start::text as borrow_window_start,
      lr.window_end::text as borrow_window_end,
      lr.accepted_at::text as reservation_accepted_at,
      lr.released_at::text as reservation_released_at,
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
    join lending_reservations lr on lr.booking_id = b.id
    join item_instances i on i.id = b.item_instance_id
    join households owner on owner.id = b.owner_household_id
    join households requester on requester.id = b.requester_household_id
    left join handoffs h on h.booking_id = b.id
    where b.id = :bookingId::uuid
      and b.deleted_at is null
      and b.metadata->>'flow' = 'lending'
      and (
        b.requester_household_id = :householdId::uuid
        or b.owner_household_id = :householdId::uuid
      )
    limit 1
  `;

  const result = transaction
    ? await execTx<LendingDetailRow>(transaction, sql, values)
    : await executeSql<LendingDetailRow>({
        sql,
        parameters: params(values),
      });

  const row = result.rows[0];
  return row ? detailDtoFromRow(row) : null;
}

async function responseForBooking(
  context: TransactionContext,
  demoContext: DemoActorContext,
  bookingId: string,
) {
  const booking = await detailQuery(
    { bookingId, householdId: demoContext.household.id },
    context,
  );

  if (!booking) {
    throw new LendingRuntimeError(500, "Lending transition completed but detail projection failed.");
  }

  return {
    ok: true as const,
    idempotent: false,
    booking,
  };
}

function isOverlapConstraintError(error: unknown): boolean {
  const message = publicErrorMessage(error);
  return (
    message.includes("lending_reservation_no_active_overlap") ||
    message.includes("conflicting key value violates exclusion constraint")
  );
}

async function mutateLending(
  demoContext: DemoActorContext,
  scope: string,
  idempotencyKey: string | undefined,
  hashInput: unknown,
  operation: (
    transaction: TransactionContext,
    key: string,
  ) => Promise<{ bookingId: string }>,
) {
  await ensureLendingRuntimeAvailable();
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
      const response = await responseForBooking(transaction, demoContext, result.bookingId);
      await completeIdempotentMutation(transaction, key, response);
      return response;
    });
  } catch (error) {
    if (isLendingRuntimeError(error)) {
      throw error;
    }

    if (isOverlapConstraintError(error)) {
      throw new LendingRuntimeError(409, "Item already has an overlapping active lending reservation.");
    }

    throw new LendingRuntimeError(503, publicErrorMessage(error));
  }
}

async function relationshipBlockExists(
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

  return Boolean(result.rows[0]);
}

async function assertWindowAvailable(
  context: TransactionContext,
  input: {
    itemId: string;
    borrowWindowStart: string;
    borrowWindowEnd: string;
  },
) {
  const conflict = await execTx<{ id: string }>(
    context,
    `
      select id::text as id
      from lending_reservations
      where item_instance_id = :itemId::uuid
        and status = 'active'
        and deleted_at is null
        and tstzrange(window_start, window_end, '[)') &&
            tstzrange(:borrowWindowStart::timestamp with time zone, :borrowWindowEnd::timestamp with time zone, '[)')
      limit 1
      for update
    `,
    input,
  );

  if (conflict.rows[0]) {
    throw new LendingRuntimeError(409, "Item already has an overlapping active lending reservation.");
  }

  const blockout = await execTx<{ id: string }>(
    context,
    `
      select id::text as id
      from lending_availability_windows
      where item_instance_id = :itemId::uuid
        and status in ('blocked', 'paused')
        and deleted_at is null
        and (
          window_start is null
          or window_end is null
          or tstzrange(window_start, window_end, '[)') &&
             tstzrange(:borrowWindowStart::timestamp with time zone, :borrowWindowEnd::timestamp with time zone, '[)')
        )
      limit 1
    `,
    input,
  );

  if (blockout.rows[0]) {
    throw new LendingRuntimeError(409, "Item is blocked for that lending window.");
  }

  const availability = await execTx<{ available_count: number; covering_count: number }>(
    context,
    `
      select
        count(*)::int as available_count,
        count(*) filter (
          where (window_start is null or window_start <= :borrowWindowStart::timestamp with time zone)
            and (window_end is null or window_end >= :borrowWindowEnd::timestamp with time zone)
        )::int as covering_count
      from lending_availability_windows
      where item_instance_id = :itemId::uuid
        and status = 'available'
        and deleted_at is null
    `,
    input,
  );
  const row = availability.rows[0];
  if (row && Number(row.available_count) > 0 && Number(row.covering_count) === 0) {
    throw new LendingRuntimeError(409, "Item is not available for the requested lending window.");
  }
}

async function loadRequestTarget(
  context: TransactionContext,
  demoContext: DemoActorContext,
  input: LendingRequestInput,
): Promise<RequestTargetRow> {
  const result = await execTx<RequestTargetRow>(
    context,
    `
      select
        i.id::text as item_instance_id,
        i.owner_household_id::text as owner_household_id,
        i.neighbourhood_id::text as neighbourhood_id,
        i.title,
        i.category::text as category,
        i.quantity::text as quantity,
        i.unit,
        i.item_state::text as item_state,
        i.metadata,
        owner.coarse_location_label as owner_coarse_location_label
      from item_instances i
      join households owner on owner.id = i.owner_household_id
      where i.id = :itemId::uuid
        and i.owner_household_id is not null
        and i.deleted_at is null
      for update of i
    `,
    { itemId: input.itemId },
  );

  const row = result.rows[0];
  if (!row) {
    throw new LendingRuntimeError(404, "Item is not available for lending.");
  }

  if (!LENDING_ELIGIBLE_CATEGORIES.includes(row.category as LendingCategory)) {
    throw new LendingRuntimeError(409, "Lending APIs only support fashion and household items.");
  }

  if (!LENDING_LISTABLE_ITEM_STATES.includes(row.item_state as "listed")) {
    throw new LendingRuntimeError(409, `Item state is ${row.item_state}.`);
  }

  if (row.owner_household_id === demoContext.household.id) {
    throw new LendingRuntimeError(409, "A household cannot request its own lending item.");
  }

  const blocked = await relationshipBlockExists(
    context,
    demoContext.household.id,
    row.owner_household_id,
  );
  if (blocked) {
    throw new LendingRuntimeError(403, "A block exists between these households.");
  }

  await assertWindowAvailable(context, {
    itemId: row.item_instance_id,
    borrowWindowStart: input.borrowWindowStart,
    borrowWindowEnd: input.borrowWindowEnd,
  });

  return row;
}

async function lockLendingBookingForActor(
  context: TransactionContext,
  bookingId: string,
  householdId: string,
) {
  const result = await execTx<LendingLockRow>(
    context,
    `
      select
        b.id::text as booking_id,
        b.status::text as booking_status,
        i.id::text as item_instance_id,
        i.item_state::text as item_state,
        i.category::text as item_category,
        i.title as item_title,
        i.metadata as item_metadata,
        b.requester_household_id::text as requester_household_id,
        b.owner_household_id::text as owner_household_id,
        b.neighbourhood_id::text as neighbourhood_id,
        owner.coarse_location_label as owner_coarse_location_label,
        lr.id::text as reservation_id,
        lr.status::text as reservation_status,
        lr.window_start::text as window_start,
        lr.window_end::text as window_end
      from bookings b
      join lending_reservations lr on lr.booking_id = b.id
      join item_instances i on i.id = b.item_instance_id
      join households owner on owner.id = b.owner_household_id
      where b.id = :bookingId::uuid
        and b.deleted_at is null
        and b.metadata->>'flow' = 'lending'
        and (
          b.requester_household_id = :householdId::uuid
          or b.owner_household_id = :householdId::uuid
        )
      for update of b, lr, i
    `,
    { bookingId, householdId },
  );

  const row = result.rows[0];
  if (!row) {
    throw new LendingRuntimeError(404, "Lending booking not found for this demo household.");
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
        :userId::uuid, :householdId::uuid, 'lending_booking', :bookingId::uuid,
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

async function writeConditionEvent(
  context: TransactionContext,
  demoContext: DemoActorContext,
  input: {
    bookingId: string;
    itemId: string;
    eventType: LendingConditionEventType;
    conditionLabel?: string | null;
    note?: string | null;
    photoFileIds?: string[];
    metadata?: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into lending_condition_events (
        booking_id, item_instance_id, actor_household_id, actor_user_id,
        event_type, condition_label, note, photo_file_ids, metadata,
        demo_scope_id, is_demo
      )
      values (
        :bookingId::uuid, :itemId::uuid, :householdId::uuid, :userId::uuid,
        :eventType::lending_condition_event_type, nullif(:conditionLabel, ''),
        nullif(:note, ''),
        array(select jsonb_array_elements_text(:photoFileIds::jsonb)::uuid),
        :metadata::jsonb, :demoScope, true
      )
    `,
    {
      bookingId: input.bookingId,
      itemId: input.itemId,
      householdId: demoContext.household.id,
      userId: demoContext.user.id,
      eventType: input.eventType,
      conditionLabel: input.conditionLabel ?? "",
      note: input.note ?? "",
      photoFileIds: input.photoFileIds ?? [],
      metadata: input.metadata ?? {},
      demoScope: demoContext.demoScope,
    },
  );
}

export async function listLendingListings(demoContext: DemoActorContext) {
  await ensureLendingRuntimeAvailable();

  try {
    const result = await executeSql<ListingRow>({
      sql: `
        select
          i.id::text as id,
          i.title,
          i.category::text as category,
          i.description,
          i.quantity::text as quantity,
          i.unit,
          i.item_state::text as item_state,
          i.metadata,
          owner.id::text as owner_household_id,
          owner.coarse_location_label as owner_coarse_location_label,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'windowStart', lr.window_start::text,
                'windowEnd', lr.window_end::text,
                'status', lr.status::text
              )
              order by lr.window_start
            )
            from lending_reservations lr
            where lr.item_instance_id = i.id
              and lr.status = 'active'
              and lr.deleted_at is null
              and lr.window_end > now()
          ), '[]'::jsonb) as active_reservations
        from item_instances i
        join households owner on owner.id = i.owner_household_id
        where i.deleted_at is null
          and i.category in ('fashion', 'household')
          and i.item_state = 'listed'
          and i.owner_household_id <> :householdId::uuid
          and not exists (
            select 1
            from blocks b
            where b.status = 'active'
              and (
                (b.blocker_household_id = :householdId::uuid and b.blocked_household_id = i.owner_household_id)
                or (b.blocker_household_id = i.owner_household_id and b.blocked_household_id = :householdId::uuid)
              )
          )
        order by i.updated_at desc, i.created_at desc
        limit 100
      `,
      parameters: params({ householdId: demoContext.household.id }),
    });

    return {
      ok: true as const,
      listings: result.rows.map(listingDtoFromRow),
    };
  } catch (error) {
    if (isLendingRuntimeError(error)) {
      throw error;
    }

    throw new LendingRuntimeError(503, publicErrorMessage(error));
  }
}

export async function listLendingRequests(demoContext: DemoActorContext) {
  await ensureLendingRuntimeAvailable();

  try {
    const result = await executeSql<LendingDetailRow>({
      sql: `
        select
          b.id::text as id,
          b.status::text as status,
          i.id::text as item_instance_id,
          i.title as item_title,
          i.category::text as item_category,
          i.item_state::text as item_state,
          i.metadata as item_metadata,
          b.request_note,
          owner.id::text as owner_household_id,
          owner.coarse_location_label as owner_coarse_location_label,
          requester.id::text as requester_household_id,
          requester.coarse_location_label as requester_coarse_location_label,
          lr.id::text as reservation_id,
          lr.status::text as reservation_status,
          lr.window_start::text as borrow_window_start,
          lr.window_end::text as borrow_window_end,
          lr.accepted_at::text as reservation_accepted_at,
          lr.released_at::text as reservation_released_at,
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
        join lending_reservations lr on lr.booking_id = b.id
        join item_instances i on i.id = b.item_instance_id
        join households owner on owner.id = b.owner_household_id
        join households requester on requester.id = b.requester_household_id
        left join handoffs h on h.booking_id = b.id
        where b.deleted_at is null
          and b.metadata->>'flow' = 'lending'
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
      requests: result.rows.map(detailDtoFromRow),
    };
  } catch (error) {
    if (isLendingRuntimeError(error)) {
      throw error;
    }

    throw new LendingRuntimeError(503, publicErrorMessage(error));
  }
}

export async function requestLending(
  demoContext: DemoActorContext,
  input: LendingRequestInput,
) {
  return mutateLending(
    demoContext,
    "lending.request",
    input.idempotencyKey,
    input,
    async (transaction, key) => {
      const target = await loadRequestTarget(transaction, demoContext, input);
      const metadata = metadataObject(target.metadata);
      const terms = termsFromMetadata(metadata, target.owner_coarse_location_label);

      const created = await execTx<{ id: string }>(
        transaction,
        `
          insert into bookings (
            item_instance_id, requester_household_id, owner_household_id,
            neighbourhood_id, requested_by_user_id, status, quantity, unit,
            request_note, idempotency_key, metadata, demo_scope_id, is_demo
          )
          values (
            :itemId::uuid, :requesterHouseholdId::uuid, :ownerHouseholdId::uuid,
            :neighbourhoodId::uuid, :userId::uuid, 'requested', 1, :unit,
            nullif(:note, ''), :idempotencyKey, :metadata::jsonb,
            :demoScope, true
          )
          returning id::text as id
        `,
        {
          itemId: target.item_instance_id,
          requesterHouseholdId: demoContext.household.id,
          ownerHouseholdId: target.owner_household_id,
          neighbourhoodId: target.neighbourhood_id,
          userId: demoContext.user.id,
          unit: target.unit,
          note: input.note ?? "",
          idempotencyKey: key,
          metadata: {
            ...input.metadata,
            flow: "lending",
            requestedFrom: "lending.listing",
            borrowWindowStart: input.borrowWindowStart,
            borrowWindowEnd: input.borrowWindowEnd,
            termsAccepted: input.termsAccepted,
            paymentDeferred: true,
            termsSnapshot: terms,
          },
          demoScope: demoContext.demoScope,
        },
      );
      const bookingId = created.rows[0].id;

      await execTx(
        transaction,
        `
          insert into lending_reservations (
            booking_id, item_instance_id, requester_household_id,
            owner_household_id, window_start, window_end, status,
            metadata, demo_scope_id, is_demo
          )
          values (
            :bookingId::uuid, :itemId::uuid, :requesterHouseholdId::uuid,
            :ownerHouseholdId::uuid, :borrowWindowStart::timestamp with time zone,
            :borrowWindowEnd::timestamp with time zone, 'requested',
            :metadata::jsonb, :demoScope, true
          )
        `,
        {
          bookingId,
          itemId: target.item_instance_id,
          requesterHouseholdId: demoContext.household.id,
          ownerHouseholdId: target.owner_household_id,
          borrowWindowStart: input.borrowWindowStart,
          borrowWindowEnd: input.borrowWindowEnd,
          metadata: { idempotencyKey: key },
          demoScope: demoContext.demoScope,
        },
      );

      await writeConditionEvent(transaction, demoContext, {
        bookingId,
        itemId: target.item_instance_id,
        eventType: "request_snapshot",
        conditionLabel: input.condition?.conditionLabel ?? textFromMetadata(metadata, "condition"),
        note: input.condition?.note ?? null,
        photoFileIds: input.condition?.photoFileIds,
        metadata: {
          itemCondition: textFromMetadata(metadata, "condition"),
          itemSize: textFromMetadata(metadata, "size"),
        },
      });
      await writeInventoryEvent(transaction, {
        itemId: target.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: target.item_state,
        toState: target.item_state,
        metadata: {
          bookingId,
          transition: "lending_requested",
          idempotencyKey: key,
        },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.requested",
        route: "/api/lending/request",
        idempotencyKey: key,
        metadata: {
          itemId: target.item_instance_id,
          borrowWindowStart: input.borrowWindowStart,
          borrowWindowEnd: input.borrowWindowEnd,
          paymentDeferred: true,
        },
      });

      return { bookingId };
    },
  );
}

export async function acceptLending(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReasonInput,
) {
  return mutateLending(
    demoContext,
    "lending.accept",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.owner_household_id !== demoContext.household.id) {
        throw new LendingRuntimeError(403, "Only the owner household can accept this lending request.");
      }
      if (locked.booking_status !== "requested") {
        throw new LendingRuntimeError(409, `Lending request cannot be accepted from ${locked.booking_status}.`);
      }

      const blocked = await relationshipBlockExists(
        transaction,
        locked.requester_household_id,
        locked.owner_household_id,
      );
      if (blocked) {
        throw new LendingRuntimeError(403, "A block exists between these households.");
      }
      await assertWindowAvailable(transaction, {
        itemId: locked.item_instance_id,
        borrowWindowStart: locked.window_start,
        borrowWindowEnd: locked.window_end,
      });

      await execTx(
        transaction,
        `
          update lending_reservations
          set status = 'active',
              accepted_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :reservationId::uuid
        `,
        {
          reservationId: locked.reservation_id,
          metadata: { acceptedBy: demoContext.user.id, idempotencyKey: key },
        },
      );
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
          metadata: { ...input.metadata, paymentDeferred: true },
        },
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
              metadata = handoffs.metadata || excluded.metadata,
              updated_at = now()
        `,
        {
          bookingId,
          coarsePickupHint: locked.owner_coarse_location_label,
          metadata: { createdBy: "lending.accept", paymentDeferred: true },
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
        metadata: { bookingId, transition: "lending_reserved", idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.accepted",
        route: "/api/lending/[bookingId]/accept",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status },
        afterState: { bookingStatus: "reserved", reservationStatus: "active" },
      });

      return { bookingId };
    },
  );
}

export async function declineLending(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReasonInput,
) {
  return mutateLending(
    demoContext,
    "lending.decline",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.owner_household_id !== demoContext.household.id) {
        throw new LendingRuntimeError(403, "Only the owner household can decline this lending request.");
      }
      if (locked.booking_status !== "requested") {
        throw new LendingRuntimeError(409, `Lending request cannot be declined from ${locked.booking_status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'declined',
              decline_reason = nullif(:reason, ''),
              declined_at = now(),
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :bookingId::uuid
        `,
        { bookingId, reason: input.reason ?? "", metadata: input.metadata },
      );
      await execTx(
        transaction,
        `
          update lending_reservations
          set status = 'cancelled',
              released_at = now(),
              updated_at = now()
          where id = :reservationId::uuid
        `,
        { reservationId: locked.reservation_id },
      );
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: { bookingId, transition: "lending_declined", idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.declined",
        route: "/api/lending/[bookingId]/decline",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status },
        afterState: { bookingStatus: "declined", reservationStatus: "cancelled" },
      });

      return { bookingId };
    },
  );
}

export async function cancelLending(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReasonInput,
) {
  return mutateLending(
    demoContext,
    "lending.cancel",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (["completed", "reviewed", "declined", "cancelled"].includes(locked.booking_status)) {
        throw new LendingRuntimeError(409, `Lending booking cannot be cancelled from ${locked.booking_status}.`);
      }
      if (!["requested", "reserved", "pickup_scheduled"].includes(locked.booking_status)) {
        throw new LendingRuntimeError(409, "Picked-up lending bookings must be returned or completed.");
      }

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
        { bookingId, reason: input.reason ?? "", metadata: input.metadata },
      );
      await execTx(
        transaction,
        `
          update lending_reservations
          set status = 'cancelled',
              released_at = now(),
              updated_at = now()
          where id = :reservationId::uuid
        `,
        { reservationId: locked.reservation_id },
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
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: { bookingId, transition: "lending_cancelled", idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.cancelled",
        route: "/api/lending/[bookingId]/cancel",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status },
        afterState: { bookingStatus: "cancelled", reservationStatus: "cancelled" },
      });

      return { bookingId };
    },
  );
}

export async function scheduleLendingPickup(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingSchedulePickupInput,
) {
  return mutateLending(
    demoContext,
    "lending.schedule-pickup",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.booking_status !== "reserved") {
        throw new LendingRuntimeError(409, `Pickup cannot be scheduled from ${locked.booking_status}.`);
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
        metadata: { bookingId, transition: "lending_pickup_scheduled", idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.pickup_scheduled",
        route: "/api/lending/[bookingId]/schedule-pickup",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status },
        afterState: { bookingStatus: "pickup_scheduled" },
      });

      return { bookingId };
    },
  );
}

export async function markLendingPickedUp(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReasonInput,
) {
  return mutateLending(
    demoContext,
    "lending.picked-up",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["reserved", "pickup_scheduled"].includes(locked.booking_status)) {
        throw new LendingRuntimeError(409, `Lending booking cannot be marked picked up from ${locked.booking_status}.`);
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
      await writeConditionEvent(transaction, demoContext, {
        bookingId,
        itemId: locked.item_instance_id,
        eventType: "pickup_evidence",
        conditionLabel: input.condition?.conditionLabel,
        note: input.condition?.note ?? input.reason,
        photoFileIds: input.condition?.photoFileIds,
      });
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "picked_up",
        metadata: { bookingId, idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.picked_up",
        route: "/api/lending/[bookingId]/picked-up",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status, itemState: locked.item_state },
        afterState: { bookingStatus: "picked_up", itemState: "picked_up" },
      });

      return { bookingId };
    },
  );
}

export async function markLendingReturned(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReasonInput,
) {
  return mutateLending(
    demoContext,
    "lending.returned",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.booking_status !== "picked_up") {
        throw new LendingRuntimeError(409, `Lending booking cannot be marked returned from ${locked.booking_status}.`);
      }

      await execTx(
        transaction,
        `
          update bookings
          set status = 'returned',
              returned_at = now(),
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
          set item_state = 'returned',
              updated_at = now()
          where id = :itemId::uuid
        `,
        { itemId: locked.item_instance_id },
      );
      await execTx(
        transaction,
        `
          update handoffs
          set status = 'returned',
              returned_at = now(),
              updated_at = now()
          where booking_id = :bookingId::uuid
        `,
        { bookingId },
      );
      await writeConditionEvent(transaction, demoContext, {
        bookingId,
        itemId: locked.item_instance_id,
        eventType: "return_evidence",
        conditionLabel: input.condition?.conditionLabel,
        note: input.condition?.note ?? input.reason,
        photoFileIds: input.condition?.photoFileIds,
      });
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "returned",
        metadata: { bookingId, idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.returned",
        route: "/api/lending/[bookingId]/returned",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status, itemState: locked.item_state },
        afterState: { bookingStatus: "returned", itemState: "returned" },
      });

      return { bookingId };
    },
  );
}

export async function completeLending(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingCompleteInput,
) {
  const response = await mutateLending(
    demoContext,
    "lending.complete",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (locked.owner_household_id !== demoContext.household.id) {
        throw new LendingRuntimeError(403, "Only the owner household can complete a returned lending booking.");
      }
      if (!["picked_up", "returned"].includes(locked.booking_status)) {
        throw new LendingRuntimeError(409, `Lending booking cannot be completed from ${locked.booking_status}.`);
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
          update lending_reservations
          set status = 'released',
              released_at = now(),
              updated_at = now()
          where id = :reservationId::uuid
        `,
        { reservationId: locked.reservation_id },
      );
      await execTx(
        transaction,
        `
          update item_instances
          set item_state = 'listed',
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
        { bookingId, userId: demoContext.user.id, note: input.note ?? "" },
      );
      await writeConditionEvent(transaction, demoContext, {
        bookingId,
        itemId: locked.item_instance_id,
        eventType: "completion_evidence",
        conditionLabel: input.condition?.conditionLabel,
        note: input.condition?.note ?? input.note,
        photoFileIds: input.condition?.photoFileIds,
      });
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "state_changed",
        fromState: locked.item_state,
        toState: "listed",
        metadata: { bookingId, transition: "lending_completed_relisted", idempotencyKey: key },
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
              5, 'Completed lending return', :metadata::jsonb,
              :demoScope, true
            ),
            (
              :bookingId::uuid, :requesterHouseholdId::uuid,
              :actorHouseholdId::uuid, :userId::uuid, 'booking_completed',
              5, 'Completed lending return', :metadata::jsonb,
              :demoScope, true
            )
        `,
        {
          bookingId,
          ownerHouseholdId: locked.owner_household_id,
          requesterHouseholdId: locked.requester_household_id,
          actorHouseholdId: demoContext.household.id,
          userId: demoContext.user.id,
          metadata: { itemId: locked.item_instance_id, flow: "lending" },
          demoScope: demoContext.demoScope,
        },
      );
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.completed",
        route: "/api/lending/[bookingId]/complete",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status, itemState: locked.item_state },
        afterState: {
          bookingStatus: "completed",
          itemState: "listed",
          reservationStatus: "released",
        },
      });

      return { bookingId };
    },
  );

  await Promise.allSettled([
    persistHouseholdTrustScore(response.booking.owner.householdId),
    persistHouseholdTrustScore(response.booking.requester.householdId),
  ]);

  return response;
}

export async function reviewLending(
  demoContext: DemoActorContext,
  bookingId: string,
  input: LendingReviewInput,
) {
  const response = await mutateLending(
    demoContext,
    "lending.review",
    input.idempotencyKey,
    { bookingId, input },
    async (transaction, key) => {
      const locked = await lockLendingBookingForActor(transaction, bookingId, demoContext.household.id);
      if (!["completed", "reviewed"].includes(locked.booking_status)) {
        throw new LendingRuntimeError(409, `Lending booking cannot be reviewed from ${locked.booking_status}.`);
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
          metadata: { ...input.metadata, flow: "lending" },
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
          rationale: `Lending review: ${input.rating}`,
          metadata: { rating: input.rating, flow: "lending" },
          demoScope: demoContext.demoScope,
        },
      );
      await writeConditionEvent(transaction, demoContext, {
        bookingId,
        itemId: locked.item_instance_id,
        eventType: "review_evidence",
        note: input.note,
        metadata: { rating: input.rating },
      });
      await writeInventoryEvent(transaction, {
        itemId: locked.item_instance_id,
        userId: demoContext.user.id,
        householdId: demoContext.household.id,
        eventType: "observed",
        fromState: locked.item_state,
        toState: locked.item_state,
        metadata: { bookingId, transition: "lending_reviewed", idempotencyKey: key },
      });
      await writeAuditEvent(transaction, demoContext, {
        bookingId,
        action: "lending.reviewed",
        route: "/api/lending/[bookingId]/review",
        idempotencyKey: key,
        beforeState: { bookingStatus: locked.booking_status },
        afterState: { bookingStatus: "reviewed", rating: input.rating },
      });

      return { bookingId };
    },
  );

  await Promise.allSettled([
    persistHouseholdTrustScore(response.booking.owner.householdId),
    persistHouseholdTrustScore(response.booking.requester.householdId),
  ]);

  return response;
}

export async function getLendingDetail(
  demoContext: DemoActorContext,
  bookingId: string,
) {
  await ensureLendingRuntimeAvailable();

  try {
    const booking = await detailQuery({
      bookingId,
      householdId: demoContext.household.id,
    });

    if (!booking) {
      throw new LendingRuntimeError(404, "Lending booking not found for this demo household.");
    }

    return {
      ok: true as const,
      booking,
    };
  } catch (error) {
    if (isLendingRuntimeError(error)) {
      throw error;
    }

    throw new LendingRuntimeError(503, publicErrorMessage(error));
  }
}
