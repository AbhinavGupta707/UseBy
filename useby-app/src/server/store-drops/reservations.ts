import {
  ACTIVE_STORE_DROP_RESERVATION_STATUSES,
  blockedDropReason,
  STORE_DROP_PAYMENT_NOTICE,
  type StoreDropReserveInput,
} from "./contracts";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import { publicErrorMessage } from "../db/introspection";
import { MerchantRuntimeError, type MerchantRuntimeStatus } from "../merchant/runtime";

export type ReservationActor = {
  householdId: string;
  userId?: string | null;
  demoScope: string;
};

type ReservationPolicyRow = {
  drop_id: string;
  merchant_id: string;
  merchant_location_id: string;
  neighbourhood_id: string;
  status: string;
  title: string;
  total_quantity: string;
  unit: string;
  pickup_window_end: string | null;
  expires_at: string | null;
  active_reserved_quantity: string;
  existing_reservation_id: string | null;
  existing_reservation_quantity: string | null;
  existing_idempotency_key: string | null;
};

type ReservationRow = {
  id: string;
  store_drop_id: string;
  household_id: string;
  status: string;
  quantity: string;
  unit: string;
  idempotency_key: string | null;
  reserved_at: string;
  expires_at: string | null;
  metadata: unknown;
};

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

function numberFrom(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function activeReservationStatusSql() {
  return ACTIVE_STORE_DROP_RESERVATION_STATUSES.map((status) => `'${status}'`).join(", ");
}

export function buildReservationPolicyLockSql() {
  return `
    select
      d.id::text as drop_id,
      d.merchant_id::text,
      d.merchant_location_id::text,
      d.neighbourhood_id::text,
      d.status::text,
      d.title,
      d.total_quantity::text,
      d.unit,
      d.pickup_window_end::text,
      d.expires_at::text,
      coalesce(active_reserved.quantity, 0)::text as active_reserved_quantity,
      existing.id::text as existing_reservation_id,
      existing.quantity::text as existing_reservation_quantity,
      existing.idempotency_key as existing_idempotency_key
    from store_drops d
    left join lateral (
      select coalesce(sum(r.quantity), 0) as quantity
      from store_drop_reservations r
      where r.store_drop_id = d.id
        and r.status in (${activeReservationStatusSql()})
    ) active_reserved on true
    left join lateral (
      select r.id, r.quantity, r.idempotency_key
      from store_drop_reservations r
      where r.store_drop_id = d.id
        and r.household_id = :householdId::uuid
        and r.status in (${activeReservationStatusSql()})
      order by r.created_at asc
      limit 1
      for update
    ) existing on true
    where d.id = :dropId::uuid
      and d.deleted_at is null
    for update of d
  `;
}

function reservationDto(row: ReservationRow) {
  return {
    id: row.id,
    storeDropId: row.store_drop_id,
    householdId: row.household_id,
    status: row.status,
    quantity: numberFrom(row.quantity),
    unit: row.unit,
    idempotencyKey: row.idempotency_key,
    reservedAt: row.reserved_at,
    expiresAt: row.expires_at,
  };
}

async function writeReservationAudit(
  transaction: TransactionContext,
  input: {
    actor: ReservationActor;
    reservationId: string;
    dropId: string;
    action: string;
    route: string;
    afterState: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
) {
  await execTx(
    transaction,
    `
      insert into audit_events (
        actor_user_id, actor_household_id, entity_type, entity_id, action,
        source, source_route, after_state, metadata, demo_scope_id, is_demo
      )
      values (
        nullif(:actorUserId, '')::uuid, :householdId::uuid,
        'store_drop_reservation', :reservationId::uuid, :action,
        'api', :route, :afterState::jsonb, :metadata::jsonb, :demoScope, true
      )
    `,
    {
      actorUserId: input.actor.userId ?? "",
      householdId: input.actor.householdId,
      reservationId: input.reservationId,
      action: input.action,
      route: input.route,
      afterState: input.afterState,
      metadata: {
        ...input.metadata,
        storeDropId: input.dropId,
        payment: "deferred_demo_no_charge",
      },
      demoScope: input.actor.demoScope,
    },
  );
}

export async function reserveStoreDropTransaction(
  dropId: string,
  actor: ReservationActor,
  input: StoreDropReserveInput,
) {
  try {
    return await withTransaction(async (transaction) => {
      const policy = await execTx<ReservationPolicyRow>(
        transaction,
        buildReservationPolicyLockSql(),
        {
          dropId,
          householdId: actor.householdId,
        },
      );

      const row = policy.rows[0];
      if (!row) {
        throw new MerchantRuntimeError(404, "Store drop is not available.");
      }

      const totalQuantity = numberFrom(row.total_quantity);
      const activeReserved = numberFrom(row.active_reserved_quantity);
      const existingQuantity = numberFrom(row.existing_reservation_quantity);
      const remainingQuantity = totalQuantity - activeReserved;
      const reason = blockedDropReason({
        status: row.status,
        remainingQuantity: remainingQuantity + existingQuantity,
        pickupWindowEnd: row.pickup_window_end,
        expiresAt: row.expires_at,
      });
      if (reason) {
        throw new MerchantRuntimeError(409, reason);
      }

      if (
        input.idempotencyKey &&
        row.existing_reservation_id &&
        row.existing_idempotency_key === input.idempotencyKey
      ) {
        const existing = await execTx<ReservationRow>(
          transaction,
          `
            select
              id::text,
              store_drop_id::text,
              household_id::text,
              status::text,
              quantity::text,
              unit,
              idempotency_key,
              reserved_at::text,
              expires_at::text,
              metadata
            from store_drop_reservations
            where id = :reservationId::uuid
          `,
          { reservationId: row.existing_reservation_id },
        );

        return {
          ok: true as const,
          status: "ok" as MerchantRuntimeStatus,
          idempotent: true,
          remainingQuantity,
          paymentNotice: STORE_DROP_PAYMENT_NOTICE,
          reservation: reservationDto(existing.rows[0]),
        };
      }

      const activeReservedWithoutExisting = Math.max(0, activeReserved - existingQuantity);
      const availableForRequested = totalQuantity - activeReservedWithoutExisting;
      if (input.quantity > availableForRequested) {
        throw new MerchantRuntimeError(
          409,
          `Requested quantity exceeds remaining drop capacity (${availableForRequested}).`,
        );
      }

      const reservation = row.existing_reservation_id
        ? await execTx<ReservationRow>(
            transaction,
            `
              update store_drop_reservations
              set
                quantity = :quantity,
                idempotency_key = nullif(:idempotencyKey, ''),
                expires_at = :expiresAt::timestamp with time zone,
                metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb,
                updated_at = now()
              where id = :reservationId::uuid
              returning
                id::text,
                store_drop_id::text,
                household_id::text,
                status::text,
                quantity::text,
                unit,
                idempotency_key,
                reserved_at::text,
                expires_at::text,
                metadata
            `,
            {
              reservationId: row.existing_reservation_id,
              quantity: input.quantity,
              idempotencyKey: input.idempotencyKey ?? "",
              expiresAt: row.expires_at ?? row.pickup_window_end,
              metadata: {
                ...input.metadata,
                note: input.note ?? null,
                policy: "updated_existing_active_reservation",
              },
            },
          )
        : await execTx<ReservationRow>(
            transaction,
            `
              insert into store_drop_reservations (
                store_drop_id, household_id, reserved_by_user_id, status,
                quantity, unit, idempotency_key, reserved_at, expires_at,
                metadata, demo_scope_id, is_demo
              )
              values (
                :dropId::uuid, :householdId::uuid, nullif(:actorUserId, '')::uuid,
                'active', :quantity, :unit, nullif(:idempotencyKey, ''),
                now(), :expiresAt::timestamp with time zone,
                :metadata::jsonb, :demoScope, true
              )
              returning
                id::text,
                store_drop_id::text,
                household_id::text,
                status::text,
                quantity::text,
                unit,
                idempotency_key,
                reserved_at::text,
                expires_at::text,
                metadata
            `,
            {
              dropId,
              householdId: actor.householdId,
              actorUserId: actor.userId ?? "",
              quantity: input.quantity,
              unit: row.unit,
              idempotencyKey: input.idempotencyKey ?? "",
              expiresAt: row.expires_at ?? row.pickup_window_end,
              metadata: {
                ...input.metadata,
                note: input.note ?? null,
                payment: "deferred_demo_no_charge",
              },
              demoScope: actor.demoScope,
            },
          );

      const reservationRow = reservation.rows[0];
      const remainingAfterReservation = totalQuantity - activeReservedWithoutExisting - input.quantity;
      if (remainingAfterReservation <= 0) {
        await execTx(
          transaction,
          `
            update store_drops
            set
              status = 'sold_out',
              sold_out_at = coalesce(sold_out_at, now()),
              updated_at = now()
            where id = :dropId::uuid
              and status = 'published'
          `,
          { dropId },
        );
      }

      await writeReservationAudit(transaction, {
        actor,
        reservationId: reservationRow.id,
        dropId,
        action: row.existing_reservation_id
          ? "store_drop.reservation.updated"
          : "store_drop.reservation.created",
        route: "/api/store-drops/:dropId/reserve",
        afterState: {
          status: "active",
          quantity: input.quantity,
          remainingQuantity: Math.max(0, remainingAfterReservation),
        },
        metadata: {
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        idempotent: false,
        remainingQuantity: Math.max(0, remainingAfterReservation),
        paymentNotice: STORE_DROP_PAYMENT_NOTICE,
        reservation: reservationDto(reservationRow),
      };
    });
  } catch (error) {
    if (error instanceof MerchantRuntimeError) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

