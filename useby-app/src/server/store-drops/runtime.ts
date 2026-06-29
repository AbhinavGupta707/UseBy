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
  STORE_DROP_PAYMENT_NOTICE,
  STORE_DROP_SAFETY_NOTICE,
  checkStoreDropContracts,
  computeStoreDropAvailability,
  formatStoreDropPrice,
  unavailableStoreDropReason,
  type StoreDropCancelReservationInput,
  type StoreDropDto,
  type StoreDropReservationDto,
  type StoreDropReserveInput,
  type StoreDropStatus,
} from "./contracts";

type IdempotencyRow = {
  status: string;
  request_hash: string;
  response_json: unknown | null;
};

type DropRow = {
  id: string;
  title: string;
  description: string | null;
  status: StoreDropStatus;
  merchant_id: string;
  merchant_name: string;
  merchant_category: string;
  location_name: string | null;
  public_address: string | null;
  pickup_notes: string | null;
  quantity_total: string;
  unit: string;
  price_cents: number;
  currency: string;
  pickup_window_start: string;
  pickup_window_end: string;
  safety_notes: string | null;
  reserved_quantity: string;
  reservation_id: string | null;
  reservation_status: string | null;
  reservation_quantity: string | null;
  reservation_reserved_at: string | null;
  reservation_cancelled_at: string | null;
  reservation_expires_at: string | null;
  reservation_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type DropLockRow = {
  id: string;
  status: StoreDropStatus;
  quantity_total: string;
  unit: string;
  pickup_window_end: string;
  deleted_at: string | null;
};

type ReservationRow = {
  id: string;
  quantity: string;
  status: string;
};

type ReservationListRow = {
  id: string;
  drop_id: string;
  drop_title: string;
  merchant_name: string;
  pickup_area_label: string;
  status: StoreDropReservationDto["status"];
  quantity: string;
  unit: string;
  reserved_at: string;
  cancelled_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

type ReservedAggregateRow = {
  reserved_quantity: string;
};

type StoreDropMutationResponse = {
  ok: true;
  idempotent: boolean;
  drop: StoreDropDto;
  reservation: StoreDropReservationDto | null;
  paymentNotice: typeof STORE_DROP_PAYMENT_NOTICE;
};

export class StoreDropRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StoreDropRuntimeError";
    this.status = status;
  }
}

export function isStoreDropRuntimeError(
  error: unknown,
): error is StoreDropRuntimeError {
  return error instanceof StoreDropRuntimeError;
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

function autoIdempotencyKey(
  scope: string,
  context: DemoActorContext,
  dropId: string,
  input: unknown,
): string {
  return `${scope}:auto:${requestHash({
    dropId,
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

function numberFromNumeric(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericString(value: number): string {
  return Number.isInteger(value) ? `${value}.000` : value.toFixed(3);
}

function reservationDtoFromDropRow(row: DropRow): StoreDropReservationDto | null {
  if (
    !row.reservation_id ||
    !row.reservation_status ||
    !row.reservation_quantity ||
    !row.reservation_reserved_at ||
    !row.reservation_updated_at
  ) {
    return null;
  }

  return {
    id: row.reservation_id,
    dropId: row.id,
    status: row.reservation_status as StoreDropReservationDto["status"],
    quantity: row.reservation_quantity,
    unit: row.unit,
    reservedAt: row.reservation_reserved_at,
    cancelledAt: row.reservation_cancelled_at,
    expiresAt: row.reservation_expires_at,
    updatedAt: row.reservation_updated_at,
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

function reservationDtoFromListRow(row: ReservationListRow): StoreDropReservationDto {
  return {
    id: row.id,
    dropId: row.drop_id,
    status: row.status,
    quantity: row.quantity,
    unit: row.unit,
    reservedAt: row.reserved_at,
    cancelledAt: row.cancelled_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    dropTitle: row.drop_title,
    merchantName: row.merchant_name,
    pickupAreaLabel: row.pickup_area_label,
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

export function storeDropDtoFromRow(row: DropRow): StoreDropDto {
  const availability = computeStoreDropAvailability({
    quantityTotal: numberFromNumeric(row.quantity_total),
    quantityReserved: numberFromNumeric(row.reserved_quantity),
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    merchant: {
      id: row.merchant_id,
      displayName: row.merchant_name,
      category: row.merchant_category,
    },
    pickup: {
      areaLabel: row.location_name ?? "Merchant pickup area",
      publicAddress: row.public_address,
      windowStart: row.pickup_window_start,
      windowEnd: row.pickup_window_end,
      notes: row.pickup_notes,
    },
    quantity: {
      total: row.quantity_total,
      reserved: numericString(availability.quantityReserved),
      remaining: numericString(availability.quantityRemaining),
      unit: row.unit,
      soldOut: availability.soldOut,
    },
    price: {
      amountCents: row.price_cents,
      currency: row.currency,
      display: formatStoreDropPrice(row.price_cents, row.currency),
    },
    safety: {
      notes: row.safety_notes,
      notice: STORE_DROP_SAFETY_NOTICE,
    },
    currentHouseholdReservation: reservationDtoFromDropRow(row),
    timeline: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

async function ensureStoreDropRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new StoreDropRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  try {
    const contracts = await checkStoreDropContracts();
    if (!contracts.available) {
      throw new StoreDropRuntimeError(503, unavailableStoreDropReason(contracts));
    }
  } catch (error) {
    if (isStoreDropRuntimeError(error)) {
      throw error;
    }

    throw new StoreDropRuntimeError(503, publicErrorMessage(error));
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
    throw new StoreDropRuntimeError(
      409,
      "Idempotency key already exists for a different store drop request.",
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

function baseDropSelect(whereClause: string) {
  return `
    with active_reservations as (
      select
        store_drop_id,
        coalesce(sum(quantity), 0)::text as reserved_quantity
      from store_drop_reservations
      where status = 'active'
      group by store_drop_id
    )
    select
      d.id::text as id,
      d.title,
      d.description,
      d.status::text as status,
      d.merchant_id::text as merchant_id,
      m.name as merchant_name,
      m.category as merchant_category,
      ml.name as location_name,
      ml.public_address,
      ml.pickup_notes,
      d.quantity_total::text as quantity_total,
      d.unit,
      d.price_cents,
      d.currency,
      d.pickup_window_start::text as pickup_window_start,
      d.pickup_window_end::text as pickup_window_end,
      d.safety_notes,
      coalesce(ar.reserved_quantity, '0') as reserved_quantity,
      r.id::text as reservation_id,
      r.status::text as reservation_status,
      r.quantity::text as reservation_quantity,
      r.reserved_at::text as reservation_reserved_at,
      r.cancelled_at::text as reservation_cancelled_at,
      r.expires_at::text as reservation_expires_at,
      r.updated_at::text as reservation_updated_at,
      d.created_at::text as created_at,
      d.updated_at::text as updated_at
    from store_drops d
    join merchants m on m.id = d.merchant_id
    left join merchant_locations ml on ml.id = d.merchant_location_id
    left join active_reservations ar on ar.store_drop_id = d.id
    left join store_drop_reservations r
      on r.store_drop_id = d.id
      and r.household_id = :householdId::uuid
      and r.status = 'active'
    ${whereClause}
  `;
}

async function loadDropDetail(
  dropId: string,
  context: DemoActorContext,
  transaction?: TransactionContext,
): Promise<StoreDropDto | null> {
  const sql = baseDropSelect(`
    where d.id = :dropId::uuid
      and d.neighbourhood_id = :neighbourhoodId::uuid
      and d.deleted_at is null
      and m.deleted_at is null
    limit 1
  `);
  const values = {
    dropId,
    householdId: context.household.id,
    neighbourhoodId: context.neighbourhood.id,
  };
  const result = transaction
    ? await execTx<DropRow>(transaction, sql, values)
    : await executeSql<DropRow>({ sql, parameters: params(values) });
  const row = result.rows[0];

  return row ? storeDropDtoFromRow(row) : null;
}

async function lockDropForReservation(
  context: TransactionContext,
  dropId: string,
  actor: DemoActorContext,
): Promise<DropLockRow> {
  const result = await execTx<DropLockRow>(
    context,
    `
      select
        id::text as id,
        status::text as status,
        quantity_total::text as quantity_total,
        unit,
        pickup_window_end::text as pickup_window_end,
        deleted_at::text as deleted_at
      from store_drops
      where id = :dropId::uuid
        and neighbourhood_id = :neighbourhoodId::uuid
      for update
    `,
    { dropId, neighbourhoodId: actor.neighbourhood.id },
  );

  const row = result.rows[0];
  if (!row || row.deleted_at) {
    throw new StoreDropRuntimeError(404, "Store drop not found.");
  }

  return row;
}

async function activeReservedQuantity(
  context: TransactionContext,
  dropId: string,
): Promise<number> {
  const result = await execTx<ReservedAggregateRow>(
    context,
    `
      select coalesce(sum(quantity), 0)::text as reserved_quantity
      from store_drop_reservations
      where store_drop_id = :dropId::uuid
        and status = 'active'
    `,
    { dropId },
  );

  return numberFromNumeric(result.rows[0]?.reserved_quantity);
}

async function currentHouseholdReservation(
  context: TransactionContext,
  dropId: string,
  householdId: string,
): Promise<ReservationRow | null> {
  const result = await execTx<ReservationRow>(
    context,
    `
      select id::text as id, quantity::text as quantity, status::text as status
      from store_drop_reservations
      where store_drop_id = :dropId::uuid
        and household_id = :householdId::uuid
        and status = 'active'
      for update
    `,
    { dropId, householdId },
  );

  return result.rows[0] ?? null;
}

function assertDropReservable(drop: DropLockRow) {
  if (drop.status !== "published") {
    throw new StoreDropRuntimeError(
      409,
      `Store drop is ${drop.status} and cannot accept reservations.`,
    );
  }

  if (new Date(drop.pickup_window_end).getTime() <= Date.now()) {
    throw new StoreDropRuntimeError(
      409,
      "Store drop pickup window has ended and cannot accept reservations.",
    );
  }
}

function asCompletedMutation(value: unknown): StoreDropMutationResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    ...(value as StoreDropMutationResponse),
    idempotent: true,
  };
}

async function writeReservationAudit(
  context: TransactionContext,
  input: {
    actor: DemoActorContext;
    dropId: string;
    action: string;
    sourceRoute: string;
    idempotencyKey: string;
    afterState: Record<string, unknown>;
  },
) {
  await execTx(
    context,
    `
      insert into audit_events (
        actor_user_id, actor_household_id, entity_type, entity_id, action,
        source, source_route, idempotency_key, after_state, metadata,
        demo_scope_id, is_demo
      )
      values (
        :userId::uuid, :householdId::uuid, 'store_drop', :dropId::uuid,
        :action, 'store_drop_api', :sourceRoute, :idempotencyKey,
        :afterState::jsonb, :metadata::jsonb, :demoScope, true
      )
    `,
    {
      userId: input.actor.user.id,
      householdId: input.actor.household.id,
      dropId: input.dropId,
      action: input.action,
      sourceRoute: input.sourceRoute,
      idempotencyKey: input.idempotencyKey,
      afterState: input.afterState,
      metadata: {
        demoScope: input.actor.demoScope,
        paymentDeferred: true,
      },
      demoScope: input.actor.demoScope,
    },
  );
}

export async function listStoreDrops(context: DemoActorContext) {
  await ensureStoreDropRuntimeAvailable();

  const result = await executeSql<DropRow>({
    sql: `${baseDropSelect(`
      where d.neighbourhood_id = :neighbourhoodId::uuid
        and d.deleted_at is null
        and m.deleted_at is null
        and d.status in ('published', 'paused', 'closed', 'expired')
      order by
        case d.status when 'published' then 0 else 1 end,
        d.pickup_window_start asc,
        d.created_at desc
    `)}`,
    parameters: params({
      householdId: context.household.id,
      neighbourhoodId: context.neighbourhood.id,
    }),
  });

  return {
    ok: true as const,
    status: "ready" as const,
    drops: result.rows.map(storeDropDtoFromRow),
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

export async function getStoreDrop(dropId: string, context: DemoActorContext) {
  await ensureStoreDropRuntimeAvailable();

  const drop = await loadDropDetail(dropId, context);
  if (!drop) {
    throw new StoreDropRuntimeError(404, "Store drop not found.");
  }

  return {
    ok: true as const,
    status: "ready" as const,
    drop,
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

export async function reserveStoreDrop(
  dropId: string,
  context: DemoActorContext,
  input: StoreDropReserveInput,
): Promise<StoreDropMutationResponse> {
  await ensureStoreDropRuntimeAvailable();

  const scope = "store-drop-reserve";
  const key = namespaceKey(
    scope,
    input.idempotencyKey ?? autoIdempotencyKey(scope, context, dropId, input),
  );
  const hash = requestHash({
    dropId,
    householdId: context.household.id,
    quantity: input.quantity,
    note: input.note ?? null,
  });

  return withTransaction(async (transaction) => {
    const completed = asCompletedMutation(
      await beginIdempotentMutation(transaction, key, scope, hash),
    );
    if (completed) {
      return completed;
    }

    const drop = await lockDropForReservation(transaction, dropId, context);
    assertDropReservable(drop);

    const existing = await currentHouseholdReservation(
      transaction,
      dropId,
      context.household.id,
    );
    const reserved = await activeReservedQuantity(transaction, dropId);
    const existingQuantity = numberFromNumeric(existing?.quantity);
    const availableForHousehold =
      numberFromNumeric(drop.quantity_total) - (reserved - existingQuantity);

    if (input.quantity > availableForHousehold) {
      throw new StoreDropRuntimeError(
        409,
        `Only ${numericString(Math.max(0, availableForHousehold))} ${drop.unit} remaining for this drop.`,
      );
    }

    let reservationId: string;
    if (existing) {
      reservationId = existing.id;
      await execTx(
        transaction,
        `
          update store_drop_reservations
          set quantity = :quantity::numeric,
              unit = :unit,
              idempotency_key = :idempotencyKey,
              expires_at = :expiresAt::timestamp with time zone,
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :reservationId::uuid
        `,
        {
          reservationId,
          quantity: input.quantity,
          unit: drop.unit,
          idempotencyKey: key,
          expiresAt: drop.pickup_window_end,
          metadata: {
            note: input.note ?? null,
            updatedFromActiveReservation: true,
          },
        },
      );
    } else {
      const inserted = await execTx<{ id: string }>(
        transaction,
        `
          insert into store_drop_reservations (
            store_drop_id, household_id, status, quantity, unit,
            idempotency_key, reserved_at, expires_at, metadata,
            demo_scope_id, is_demo
          )
          values (
            :dropId::uuid, :householdId::uuid, 'active',
            :quantity::numeric, :unit, :idempotencyKey, now(),
            :expiresAt::timestamp with time zone, :metadata::jsonb,
            :demoScope, true
          )
          returning id::text as id
        `,
        {
          dropId,
          householdId: context.household.id,
          quantity: input.quantity,
          unit: drop.unit,
          idempotencyKey: key,
          expiresAt: drop.pickup_window_end,
          metadata: {
            note: input.note ?? null,
            paymentDeferred: true,
          },
          demoScope: context.demoScope,
        },
      );
      const insertedReservationId = inserted.rows[0]?.id;
      if (!insertedReservationId) {
        throw new StoreDropRuntimeError(500, "Store drop reservation was not created.");
      }
      reservationId = insertedReservationId;
    }

    const detail = await loadDropDetail(dropId, context, transaction);
    if (!detail) {
      throw new StoreDropRuntimeError(404, "Store drop not found.");
    }

    await writeReservationAudit(transaction, {
      actor: context,
      dropId,
      action: existing
        ? "store_drop.reservation_updated"
        : "store_drop.reservation_created",
      sourceRoute: `/api/store-drops/${dropId}/reserve`,
      idempotencyKey: key,
      afterState: {
        reservationId,
        quantity: input.quantity,
        remaining: detail.quantity.remaining,
      },
    });

    const response: StoreDropMutationResponse = {
      ok: true as const,
      idempotent: false,
      drop: detail,
      reservation: detail.currentHouseholdReservation,
      paymentNotice: STORE_DROP_PAYMENT_NOTICE,
    };
    await completeIdempotentMutation(transaction, key, response);

    return response;
  });
}

export async function cancelStoreDropReservation(
  dropId: string,
  context: DemoActorContext,
  input: StoreDropCancelReservationInput,
): Promise<StoreDropMutationResponse> {
  await ensureStoreDropRuntimeAvailable();

  const scope = "store-drop-cancel-reservation";
  const key = namespaceKey(
    scope,
    input.idempotencyKey ?? autoIdempotencyKey(scope, context, dropId, input),
  );
  const hash = requestHash({
    dropId,
    householdId: context.household.id,
    reservationId: input.reservationId ?? null,
    reason: input.reason ?? null,
  });

  return withTransaction(async (transaction) => {
    const completed = asCompletedMutation(
      await beginIdempotentMutation(transaction, key, scope, hash),
    );
    if (completed) {
      return completed;
    }

    await lockDropForReservation(transaction, dropId, context);

    const reservationResult = await execTx<ReservationRow>(
      transaction,
      `
        select id::text as id, quantity::text as quantity, status::text as status
        from store_drop_reservations
        where store_drop_id = :dropId::uuid
          and household_id = :householdId::uuid
          and status = 'active'
          and (:reservationId = '' or id = :reservationId::uuid)
        for update
      `,
      {
        dropId,
        householdId: context.household.id,
        reservationId: input.reservationId ?? "",
      },
    );
    const reservation = reservationResult.rows[0];
    if (!reservation) {
      throw new StoreDropRuntimeError(404, "No active reservation found for this store drop.");
    }

    await execTx(
      transaction,
      `
        update store_drop_reservations
        set status = 'cancelled',
            cancelled_at = now(),
            idempotency_key = :idempotencyKey,
            metadata = metadata || :metadata::jsonb,
            updated_at = now()
        where id = :reservationId::uuid
      `,
      {
        reservationId: reservation.id,
        idempotencyKey: key,
        metadata: {
          reason: input.reason ?? null,
          paymentDeferred: true,
        },
      },
    );

    const detail = await loadDropDetail(dropId, context, transaction);
    if (!detail) {
      throw new StoreDropRuntimeError(404, "Store drop not found.");
    }

    await writeReservationAudit(transaction, {
      actor: context,
      dropId,
      action: "store_drop.reservation_cancelled",
      sourceRoute: `/api/store-drops/${dropId}/cancel-reservation`,
      idempotencyKey: key,
      afterState: {
        reservationId: reservation.id,
        releasedQuantity: reservation.quantity,
        remaining: detail.quantity.remaining,
      },
    });

    const response: StoreDropMutationResponse = {
      ok: true as const,
      idempotent: false,
      drop: detail,
      reservation: null,
      paymentNotice: STORE_DROP_PAYMENT_NOTICE,
    };
    await completeIdempotentMutation(transaction, key, response);

    return response;
  });
}

export async function listStoreDropReservations(context: DemoActorContext) {
  await ensureStoreDropRuntimeAvailable();

  const result = await executeSql<ReservationListRow>({
    sql: `
      select
        r.id::text as id,
        r.store_drop_id::text as drop_id,
        d.title as drop_title,
        m.name as merchant_name,
        coalesce(ml.name, 'Merchant pickup area') as pickup_area_label,
        r.status::text as status,
        r.quantity::text as quantity,
        r.unit,
        r.reserved_at::text as reserved_at,
        r.cancelled_at::text as cancelled_at,
        r.expires_at::text as expires_at,
        r.updated_at::text as updated_at
      from store_drop_reservations r
      join store_drops d on d.id = r.store_drop_id
      join merchants m on m.id = d.merchant_id
      left join merchant_locations ml on ml.id = d.merchant_location_id
      where r.household_id = :householdId::uuid
        and d.neighbourhood_id = :neighbourhoodId::uuid
        and d.deleted_at is null
      order by
        case r.status when 'active' then 0 else 1 end,
        r.reserved_at desc
    `,
    parameters: params({
      householdId: context.household.id,
      neighbourhoodId: context.neighbourhood.id,
    }),
  });

  return {
    ok: true as const,
    status: "ready" as const,
    reservations: result.rows.map(reservationDtoFromListRow),
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
  };
}

export async function storeDropRuntimeUnavailableReason(): Promise<string | null> {
  try {
    await ensureStoreDropRuntimeAvailable();
    return null;
  } catch (error) {
    if (isStoreDropRuntimeError(error)) {
      return error.message;
    }
    return publicErrorMessage(error);
  }
}
