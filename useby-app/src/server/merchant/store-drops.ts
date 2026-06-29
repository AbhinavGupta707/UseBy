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
import { sanitizePublicLocationText } from "../locations/privacy";
import type { MerchantActorContext } from "./context";
import {
  CP7_STORE_DROP_TABLE_CONTRACTS,
  STORE_DROP_PAYMENT_NOTICE,
  checkTableContracts,
  merchantStoreDropCreateSchema,
  unavailableStoreDropReason,
  type MerchantStoreDropCreateInput,
  type StoreDropStatus,
} from "../store-drops/contracts";
import {
  MerchantRuntimeError,
  publicMerchantLocation,
  type MerchantRuntimeStatus,
} from "./runtime";

type StoreDropRow = {
  id: string;
  merchant_id: string;
  merchant_location_id: string | null;
  merchant_location_name: string | null;
  merchant_public_address: string | null;
  neighbourhood_id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  total_quantity: string;
  reserved_quantity: string;
  active_reservation_count: number;
  unit: string;
  price_cents: number;
  currency: string;
  pickup_window_start: string;
  pickup_window_end: string;
  available_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  paused_at: string | null;
  closed_at: string | null;
  sold_out_at: string | null;
  safety_notes: string | null;
  created_at: string;
  updated_at: string;
};

type ReservationRow = {
  id: string;
  store_drop_id: string;
  household_public_label: string;
  household_coarse_location_label: string;
  status: string;
  quantity: string;
  unit: string;
  reserved_at: string;
  expires_at: string | null;
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

async function ensureStoreDropRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new MerchantRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  const contracts = await checkTableContracts(CP7_STORE_DROP_TABLE_CONTRACTS);
  if (!contracts.available) {
    throw new MerchantRuntimeError(503, unavailableStoreDropReason(contracts));
  }
}

function dropDto(row: StoreDropRow, reservations: ReservationRow[] = []) {
  const totalQuantity = numberFrom(row.total_quantity);
  const reservedQuantity = numberFrom(row.reserved_quantity);
  const remainingQuantity = Math.max(0, totalQuantity - reservedQuantity);

  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantLocationId: row.merchant_location_id,
    merchantLocationName: row.merchant_location_name,
    pickupAddress: null,
    neighbourhoodId: row.neighbourhood_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    totalQuantity,
    reservedQuantity,
    remainingQuantity,
    activeReservationCount: row.active_reservation_count,
    unit: row.unit,
    priceCents: row.price_cents,
    currency: row.currency,
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    availableAt: row.available_at,
    expiresAt: row.expires_at,
    publishedAt: row.published_at,
    pausedAt: row.paused_at,
    closedAt: row.closed_at,
    soldOutAt: row.sold_out_at,
    safetyNotes: row.safety_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservations: reservations.map((reservation) => ({
      id: reservation.id,
      storeDropId: reservation.store_drop_id,
      household: {
        publicLabel: reservation.household_public_label,
        coarseLocationLabel: reservation.household_coarse_location_label,
      },
      status: reservation.status,
      quantity: numberFrom(reservation.quantity),
      unit: reservation.unit,
      reservedAt: reservation.reserved_at,
      expiresAt: reservation.expires_at,
      privacy: {
        exactHouseholdCoordinates: false,
        directContact: false,
      },
    })),
    paymentNotice: STORE_DROP_PAYMENT_NOTICE,
    privacy: {
      householdLocations: "coarse labels only",
      pickupArea: sanitizePublicLocationText(row.merchant_location_name ?? "Merchant pickup area"),
      directContact: false,
    },
  };
}

async function selectMerchantDropRows(context: MerchantActorContext) {
  return executeSql<StoreDropRow>({
    sql: `
      select
        d.id::text,
        d.merchant_id::text,
        d.merchant_location_id::text,
        ml.name as merchant_location_name,
        ml.public_address as merchant_public_address,
        d.neighbourhood_id::text,
        d.title,
        d.description,
        coalesce(d.metadata->>'category', 'surplus') as category,
        d.status::text,
        d.quantity_total::text as total_quantity,
        coalesce(sum(r.quantity) filter (where r.status = 'active'), 0)::text as reserved_quantity,
        count(r.id) filter (where r.status = 'active')::int as active_reservation_count,
        d.unit,
        d.price_cents,
        d.currency,
        d.pickup_window_start::text,
        d.pickup_window_end::text,
        d.metadata->>'availableAt' as available_at,
        d.metadata->>'expiresAt' as expires_at,
        d.metadata->>'publishedAt' as published_at,
        d.metadata->>'pausedAt' as paused_at,
        d.metadata->>'closedAt' as closed_at,
        null::text as sold_out_at,
        d.safety_notes,
        d.created_at::text,
        d.updated_at::text
      from store_drops d
      join merchant_locations ml on ml.id = d.merchant_location_id
      left join store_drop_reservations r
        on r.store_drop_id = d.id
        and r.status = 'active'
      where d.merchant_id = :merchantId::uuid
        and d.deleted_at is null
      group by d.id, ml.name, ml.public_address
      order by
        case d.status
          when 'published' then 0
          when 'draft' then 1
          when 'paused' then 2
          when 'closed' then 3
          else 5
        end,
        d.pickup_window_start asc,
        d.created_at desc
    `,
    parameters: params({ merchantId: context.merchant.id }),
  });
}

async function selectReservationRows(context: MerchantActorContext) {
  return executeSql<ReservationRow>({
    sql: `
      select
        r.id::text,
        r.store_drop_id::text,
        h.public_label as household_public_label,
        h.coarse_location_label as household_coarse_location_label,
        r.status::text,
        r.quantity::text,
        r.unit,
        r.reserved_at::text,
        r.expires_at::text
      from store_drop_reservations r
      join store_drops d on d.id = r.store_drop_id
      join households h on h.id = r.household_id
      where d.merchant_id = :merchantId::uuid
        and d.deleted_at is null
        and r.status = 'active'
      order by r.reserved_at asc
    `,
    parameters: params({ merchantId: context.merchant.id }),
  });
}

export async function listMerchantStoreDrops(context: MerchantActorContext) {
  await ensureStoreDropRuntimeAvailable();

  try {
    const [drops, reservations] = await Promise.all([
      selectMerchantDropRows(context),
      selectReservationRows(context),
    ]);
    const reservationsByDrop = new Map<string, ReservationRow[]>();
    for (const reservation of reservations.rows) {
      const bucket = reservationsByDrop.get(reservation.store_drop_id) ?? [];
      bucket.push(reservation);
      reservationsByDrop.set(reservation.store_drop_id, bucket);
    }

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      location: publicMerchantLocation(context.location),
      drops: drops.rows.map((drop) => dropDto(drop, reservationsByDrop.get(drop.id))),
    };
  } catch (error) {
    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function createMerchantStoreDrop(
  context: MerchantActorContext,
  input: MerchantStoreDropCreateInput,
) {
  await ensureStoreDropRuntimeAvailable();

  const parsed = merchantStoreDropCreateSchema.parse(input);
  const merchantLocationId = parsed.merchantLocationId ?? context.location.id;

  try {
    return await withTransaction(async (transaction) => {
      const location = await execTx<{
        id: string;
        neighbourhood_id: string;
        name: string;
        public_address: string;
      }>(
        transaction,
        `
          select
            id::text,
            neighbourhood_id::text,
            name,
            public_address
          from merchant_locations
          where id = :merchantLocationId::uuid
            and merchant_id = :merchantId::uuid
            and is_active = true
            and deleted_at is null
          limit 1
        `,
        {
          merchantLocationId,
          merchantId: context.merchant.id,
        },
      );

      const locationRow = location.rows[0];
      if (!locationRow) {
        throw new MerchantRuntimeError(404, "Merchant location is not available for store drops.");
      }

      const result = await execTx<StoreDropRow>(
        transaction,
        `
          insert into store_drops (
            merchant_id, merchant_location_id, neighbourhood_id, title,
            description, status, quantity_total, unit, price_cents,
            currency, pickup_window_start, pickup_window_end, safety_notes,
            pickup_location, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, :merchantLocationId::uuid, :neighbourhoodId::uuid,
            :title, nullif(:description, ''), 'draft',
            :totalQuantity, :unit, :priceCents, :currency,
            :pickupWindowStart::timestamp with time zone,
            :pickupWindowEnd::timestamp with time zone,
            nullif(:safetyNotes, ''),
            (select location from merchant_locations where id = :merchantLocationId::uuid),
            :metadata::jsonb, :demoScope, true
          )
          returning
            id::text,
            merchant_id::text,
            merchant_location_id::text,
            :locationName as merchant_location_name,
            :publicAddress as merchant_public_address,
            neighbourhood_id::text,
            title,
            description,
            metadata->>'category' as category,
            status::text,
            quantity_total::text as total_quantity,
            '0'::text as reserved_quantity,
            0::int as active_reservation_count,
            unit,
            price_cents,
            currency,
            pickup_window_start::text,
            pickup_window_end::text,
            metadata->>'availableAt' as available_at,
            metadata->>'expiresAt' as expires_at,
            metadata->>'publishedAt' as published_at,
            metadata->>'pausedAt' as paused_at,
            metadata->>'closedAt' as closed_at,
            null::text as sold_out_at,
            safety_notes,
            created_at::text,
            updated_at::text
        `,
        {
          merchantId: context.merchant.id,
          merchantLocationId,
          neighbourhoodId: locationRow.neighbourhood_id,
          locationName: locationRow.name,
          publicAddress: locationRow.public_address,
          title: parsed.title,
          description: parsed.description ?? "",
          category: parsed.category,
          totalQuantity: parsed.totalQuantity,
          unit: parsed.unit,
          priceCents: parsed.priceCents,
          currency: parsed.currency.toUpperCase(),
          pickupWindowStart: parsed.pickupWindowStart,
          pickupWindowEnd: parsed.pickupWindowEnd,
          availableAt: parsed.availableAt ?? parsed.pickupWindowStart,
          expiresAt: parsed.expiresAt ?? parsed.pickupWindowEnd,
          safetyNotes:
            parsed.safetyNotes ??
            "Merchant packed surplus. Confirm pickup with the merchant; no freshness or allergen guarantee is provided by UseBy.",
          metadata: {
            ...parsed.metadata,
            category: parsed.category,
            availableAt: parsed.availableAt ?? parsed.pickupWindowStart,
            expiresAt: parsed.expiresAt ?? parsed.pickupWindowEnd,
            payment: "deferred_demo_no_charge",
          },
          demoScope: context.demoScope,
        },
      );

      const drop = result.rows[0];
      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'store_drop', :dropId::uuid,
            'store_drop.created', 'api', '/api/merchant/store-drops',
            :afterState::jsonb, :metadata::jsonb, :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          dropId: drop.id,
          afterState: { status: "draft", totalQuantity: parsed.totalQuantity },
          metadata: { payment: "deferred_demo_no_charge" },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        drop: dropDto(drop),
      };
    });
  } catch (error) {
    if (error instanceof MerchantRuntimeError) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

export async function updateMerchantStoreDrop(
  context: MerchantActorContext,
  dropId: string,
  input: MerchantStoreDropCreateInput,
) {
  await ensureStoreDropRuntimeAvailable();

  const parsed = merchantStoreDropCreateSchema.parse(input);
  const merchantLocationId = parsed.merchantLocationId ?? context.location.id;

  try {
    return await withTransaction(async (transaction) => {
      const before = await execTx<{
        id: string;
        status: string;
        reserved_quantity: string;
      }>(
        transaction,
        `
          select
            d.id::text,
            d.status::text,
            (
              select coalesce(sum(r.quantity), 0)::text
              from store_drop_reservations r
              where r.store_drop_id = d.id and r.status = 'active'
            ) as reserved_quantity
          from store_drops d
          where d.id = :dropId::uuid
            and d.merchant_id = :merchantId::uuid
            and d.deleted_at is null
          for update of d
        `,
        { dropId, merchantId: context.merchant.id },
      );

      const beforeRow = before.rows[0];
      if (!beforeRow) {
        throw new MerchantRuntimeError(404, "Store drop is not available for this merchant.");
      }

      if (!["draft", "paused"].includes(beforeRow.status)) {
        throw new MerchantRuntimeError(
          409,
          `Drop is ${beforeRow.status}, not editable. Pause it before editing active pickup details.`,
        );
      }

      const reservedQuantity = numberFrom(beforeRow.reserved_quantity);
      if (parsed.totalQuantity < reservedQuantity) {
        throw new MerchantRuntimeError(
          409,
          `Total quantity cannot be below the active reserved quantity (${reservedQuantity}).`,
        );
      }

      const location = await execTx<{
        id: string;
        neighbourhood_id: string;
        name: string;
        public_address: string;
      }>(
        transaction,
        `
          select
            id::text,
            neighbourhood_id::text,
            name,
            public_address
          from merchant_locations
          where id = :merchantLocationId::uuid
            and merchant_id = :merchantId::uuid
            and is_active = true
            and deleted_at is null
          limit 1
        `,
        {
          merchantLocationId,
          merchantId: context.merchant.id,
        },
      );

      const locationRow = location.rows[0];
      if (!locationRow) {
        throw new MerchantRuntimeError(404, "Merchant location is not available for store drops.");
      }

      const result = await execTx<StoreDropRow>(
        transaction,
        `
          update store_drops d
          set
            merchant_location_id = :merchantLocationId::uuid,
            neighbourhood_id = :neighbourhoodId::uuid,
            title = :title,
            description = nullif(:description, ''),
            quantity_total = :totalQuantity,
            unit = :unit,
            price_cents = :priceCents,
            currency = :currency,
            pickup_window_start = :pickupWindowStart::timestamp with time zone,
            pickup_window_end = :pickupWindowEnd::timestamp with time zone,
            safety_notes = nullif(:safetyNotes, ''),
            pickup_location = (
              select location from merchant_locations where id = :merchantLocationId::uuid
            ),
            metadata = coalesce(d.metadata, '{}'::jsonb) || :metadata::jsonb,
            updated_at = now()
          from merchant_locations ml
          where d.id = :dropId::uuid
            and d.merchant_id = :merchantId::uuid
            and ml.id = :merchantLocationId::uuid
          returning
            d.id::text,
            d.merchant_id::text,
            d.merchant_location_id::text,
            ml.name as merchant_location_name,
            ml.public_address as merchant_public_address,
            d.neighbourhood_id::text,
            d.title,
            d.description,
            coalesce(d.metadata->>'category', 'surplus') as category,
            d.status::text,
            d.quantity_total::text as total_quantity,
            (
              select coalesce(sum(r.quantity), 0)::text
              from store_drop_reservations r
              where r.store_drop_id = d.id and r.status = 'active'
            ) as reserved_quantity,
            (
              select count(r.id)::int
              from store_drop_reservations r
              where r.store_drop_id = d.id and r.status = 'active'
            ) as active_reservation_count,
            d.unit,
            d.price_cents,
            d.currency,
            d.pickup_window_start::text,
            d.pickup_window_end::text,
            d.metadata->>'availableAt' as available_at,
            d.metadata->>'expiresAt' as expires_at,
            d.metadata->>'publishedAt' as published_at,
            d.metadata->>'pausedAt' as paused_at,
            d.metadata->>'closedAt' as closed_at,
            null::text as sold_out_at,
            d.safety_notes,
            d.created_at::text,
            d.updated_at::text
        `,
        {
          dropId,
          merchantId: context.merchant.id,
          merchantLocationId,
          neighbourhoodId: locationRow.neighbourhood_id,
          title: parsed.title,
          description: parsed.description ?? "",
          totalQuantity: parsed.totalQuantity,
          unit: parsed.unit,
          priceCents: parsed.priceCents,
          currency: parsed.currency.toUpperCase(),
          pickupWindowStart: parsed.pickupWindowStart,
          pickupWindowEnd: parsed.pickupWindowEnd,
          safetyNotes:
            parsed.safetyNotes ??
            "Merchant packed surplus. Confirm pickup with the merchant; no freshness or allergen guarantee is provided by UseBy.",
          metadata: {
            ...parsed.metadata,
            category: parsed.category,
            availableAt: parsed.availableAt ?? parsed.pickupWindowStart,
            expiresAt: parsed.expiresAt ?? parsed.pickupWindowEnd,
            payment: "deferred_demo_no_charge",
          },
        },
      );

      const drop = result.rows[0];
      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, before_state, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'store_drop', :dropId::uuid,
            'store_drop.updated', 'api', '/api/merchant/store-drops/:dropId',
            :beforeState::jsonb, :afterState::jsonb, :metadata::jsonb,
            :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          dropId,
          beforeState: {
            status: beforeRow.status,
            reservedQuantity,
          },
          afterState: {
            status: drop.status,
            totalQuantity: parsed.totalQuantity,
          },
          metadata: { payment: "deferred_demo_no_charge" },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        drop: dropDto(drop),
      };
    });
  } catch (error) {
    if (error instanceof MerchantRuntimeError) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}

const TRANSITION_POLICY: Record<
  "publish" | "pause" | "close",
  {
    nextStatus: StoreDropStatus;
    allowed: StoreDropStatus[];
    action: string;
    timestampMetadataKey: "publishedAt" | "pausedAt" | "closedAt";
  }
> = {
  publish: {
    nextStatus: "published",
    allowed: ["draft", "paused"],
    action: "store_drop.published",
    timestampMetadataKey: "publishedAt",
  },
  pause: {
    nextStatus: "paused",
    allowed: ["published"],
    action: "store_drop.paused",
    timestampMetadataKey: "pausedAt",
  },
  close: {
    nextStatus: "closed",
    allowed: ["draft", "published", "paused"],
    action: "store_drop.closed",
    timestampMetadataKey: "closedAt",
  },
};

export async function transitionMerchantStoreDrop(
  context: MerchantActorContext,
  dropId: string,
  transition: "publish" | "pause" | "close",
) {
  await ensureStoreDropRuntimeAvailable();
  const policy = TRANSITION_POLICY[transition];

  try {
    return await withTransaction(async (transaction) => {
      const before = await execTx<{ id: string; status: string; pickup_window_end: string }>(
        transaction,
        `
          select id::text, status::text, pickup_window_end::text
          from store_drops
          where id = :dropId::uuid
            and merchant_id = :merchantId::uuid
            and deleted_at is null
          for update
        `,
        { dropId, merchantId: context.merchant.id },
      );

      const beforeRow = before.rows[0];
      if (!beforeRow) {
        throw new MerchantRuntimeError(404, "Store drop is not available for this merchant.");
      }

      if (!policy.allowed.includes(beforeRow.status as StoreDropStatus)) {
        throw new MerchantRuntimeError(
          409,
          `Drop is ${beforeRow.status}, not eligible for ${transition}.`,
        );
      }

      if (
        transition === "publish" &&
        Date.parse(beforeRow.pickup_window_end) <= Date.now()
      ) {
        throw new MerchantRuntimeError(409, "Expired pickup windows cannot be published.");
      }

      const result = await execTx<StoreDropRow>(
        transaction,
        `
          update store_drops d
          set
            status = :nextStatus::store_drop_status,
            metadata = coalesce(d.metadata, '{}'::jsonb) ||
              jsonb_build_object(
                :timestampMetadataKey,
                coalesce(d.metadata ->> :timestampMetadataKey, now()::text)
              ),
            updated_at = now()
          from merchant_locations ml
          where d.id = :dropId::uuid
            and d.merchant_id = :merchantId::uuid
            and ml.id = d.merchant_location_id
          returning
            d.id::text,
            d.merchant_id::text,
            d.merchant_location_id::text,
            ml.name as merchant_location_name,
            ml.public_address as merchant_public_address,
            d.neighbourhood_id::text,
            d.title,
            d.description,
            coalesce(d.metadata->>'category', 'surplus') as category,
            d.status::text,
            d.quantity_total::text as total_quantity,
            (
              select coalesce(sum(r.quantity), 0)::text
              from store_drop_reservations r
              where r.store_drop_id = d.id and r.status = 'active'
            ) as reserved_quantity,
            (
              select count(r.id)::int
              from store_drop_reservations r
              where r.store_drop_id = d.id and r.status = 'active'
            ) as active_reservation_count,
            d.unit,
            d.price_cents,
            d.currency,
            d.pickup_window_start::text,
            d.pickup_window_end::text,
            d.metadata->>'availableAt' as available_at,
            d.metadata->>'expiresAt' as expires_at,
            d.metadata->>'publishedAt' as published_at,
            d.metadata->>'pausedAt' as paused_at,
            d.metadata->>'closedAt' as closed_at,
            null::text as sold_out_at,
            d.safety_notes,
            d.created_at::text,
            d.updated_at::text
        `,
        {
          dropId,
          merchantId: context.merchant.id,
          nextStatus: policy.nextStatus,
          timestampMetadataKey: policy.timestampMetadataKey,
        },
      );

      const drop = result.rows[0];
      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_merchant_id, entity_type, entity_id, action, source,
            source_route, before_state, after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :merchantId::uuid, 'store_drop', :dropId::uuid, :action,
            'api', :route, :beforeState::jsonb, :afterState::jsonb,
            :metadata::jsonb, :demoScope, true
          )
        `,
        {
          merchantId: context.merchant.id,
          dropId,
          action: policy.action,
          route: `/api/merchant/store-drops/:dropId/${transition}`,
          beforeState: { status: beforeRow.status },
          afterState: { status: policy.nextStatus },
          metadata: { transition },
          demoScope: context.demoScope,
        },
      );

      return {
        ok: true as const,
        status: "ok" as MerchantRuntimeStatus,
        drop: dropDto(drop),
      };
    });
  } catch (error) {
    if (error instanceof MerchantRuntimeError) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}
