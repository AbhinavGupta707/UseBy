import { z } from "zod";

import {
  storeDropReservationStatusValues,
  storeDropStatusValues,
} from "../../db/schema";
import { getTableAvailability } from "../db/introspection";

export const STORE_DROP_PAYMENT_NOTICE =
  "Unpaid demo pickup intent only. No card, deposit, payment authorization, ledger entry, or captured charge is created.";

export const STORE_DROP_SAFETY_NOTICE =
  "Merchant-packed surplus. Pickup is user/merchant confirmed; UseBy does not guarantee freshness, ingredients, or allergens.";

export const RESERVABLE_STORE_DROP_STATUSES = ["published"] as const;
export const ACTIVE_STORE_DROP_RESERVATION_STATUSES = ["active"] as const;
export const BLOCKED_STORE_DROP_STATUSES = [
  "draft",
  "paused",
  "closed",
  "expired",
  "unavailable",
] as const;

export type TableContract = {
  table: string;
  requiredColumns: readonly string[];
};

export const CP7_STORE_DROP_TABLE_CONTRACTS = [
  {
    table: "store_drops",
    requiredColumns: [
      "id",
      "merchant_id",
      "merchant_location_id",
      "neighbourhood_id",
      "catalog_item_id",
      "title",
      "description",
      "status",
      "quantity_total",
      "unit",
      "price_cents",
      "currency",
      "pickup_window_start",
      "pickup_window_end",
      "safety_notes",
      "pickup_location",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "store_drop_reservations",
    requiredColumns: [
      "id",
      "store_drop_id",
      "household_id",
      "status",
      "quantity",
      "unit",
      "idempotency_key",
      "reserved_at",
      "cancelled_at",
      "expires_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "merchants",
    requiredColumns: ["id", "name", "category", "deleted_at"],
  },
  {
    table: "merchant_locations",
    requiredColumns: [
      "id",
      "merchant_id",
      "neighbourhood_id",
      "name",
      "public_address",
      "pickup_notes",
      "location",
      "is_active",
      "deleted_at",
    ],
  },
  {
    table: "idempotency_keys",
    requiredColumns: [
      "key",
      "scope",
      "request_hash",
      "status",
      "response_json",
      "locked_at",
      "expires_at",
    ],
  },
  {
    table: "audit_events",
    requiredColumns: [
      "actor_user_id",
      "actor_household_id",
      "actor_merchant_id",
      "entity_type",
      "entity_id",
      "action",
      "source",
      "source_route",
      "idempotency_key",
      "metadata",
      "demo_scope_id",
    ],
  },
] as const satisfies readonly TableContract[];

export const CP7_HEATMAP_TABLE_CONTRACTS = [
  ...CP7_STORE_DROP_TABLE_CONTRACTS,
  {
    table: "needs",
    requiredColumns: [
      "id",
      "household_id",
      "neighbourhood_id",
      "category",
      "quantity",
      "status",
      "location",
      "metadata",
      "deleted_at",
    ],
  },
] as const satisfies readonly TableContract[];

export type ContractCheck = {
  table: string;
  available: boolean;
  exists: boolean;
  missingColumns: string[];
};

export type StoreDropStatus = (typeof storeDropStatusValues)[number];
export type StoreDropReservationStatus =
  (typeof storeDropReservationStatusValues)[number];

export type StoreDropReservationDto = {
  id: string;
  dropId: string;
  status: StoreDropReservationStatus;
  quantity: string;
  unit: string;
  reservedAt: string;
  cancelledAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  dropTitle?: string;
  merchantName?: string;
  pickupAreaLabel?: string;
  paymentNotice: typeof STORE_DROP_PAYMENT_NOTICE;
};

export type StoreDropDto = {
  id: string;
  title: string;
  description: string | null;
  status: StoreDropStatus;
  merchant: {
    id: string;
    displayName: string;
    category: string;
  };
  pickup: {
    areaLabel: string;
    publicAddress: string | null;
    windowStart: string;
    windowEnd: string;
    notes: string | null;
  };
  quantity: {
    total: string;
    reserved: string;
    remaining: string;
    unit: string;
    soldOut: boolean;
  };
  price: {
    amountCents: number;
    currency: string;
    display: string;
  };
  safety: {
    notes: string | null;
    notice: typeof STORE_DROP_SAFETY_NOTICE;
  };
  currentHouseholdReservation: StoreDropReservationDto | null;
  timeline: {
    createdAt: string;
    updatedAt: string;
  };
  paymentNotice: typeof STORE_DROP_PAYMENT_NOTICE;
};

export type StoreDropAvailability = {
  quantityTotal: number;
  quantityReserved: number;
  quantityRemaining: number;
  soldOut: boolean;
};

const optionalMetadata = z.record(z.string(), z.unknown()).default({});
const optionalIdempotencyKey = z.string().trim().min(8).max(200).optional().nullable();
const optionalNote = z.string().trim().max(1000).optional().nullable();
const optionalTrimmedText = z.string().trim().max(1000).optional().nullable();

export const storeDropReserveSchema = z
  .object({
    quantity: z.number().positive().max(999),
    idempotencyKey: optionalIdempotencyKey,
    note: optionalNote,
    metadata: optionalMetadata,
  })
  .strip();

export const storeDropCancelReservationSchema = z
  .object({
    reservationId: z.string().uuid().optional(),
    idempotencyKey: optionalIdempotencyKey,
    reason: optionalNote,
  })
  .strip();

export const merchantStoreDropCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: optionalTrimmedText,
    category: z.string().trim().min(1).max(80).default("grocery"),
    totalQuantity: z.number().positive().max(99999),
    unit: z.string().trim().min(1).max(32).default("bundle"),
    priceCents: z.number().int().nonnegative().max(1_000_000).default(0),
    currency: z.string().trim().length(3).default("GBP"),
    pickupWindowStart: z.string().datetime({ offset: true }),
    pickupWindowEnd: z.string().datetime({ offset: true }),
    availableAt: z.string().datetime({ offset: true }).optional().nullable(),
    expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
    safetyNotes: optionalTrimmedText,
    merchantLocationId: z.string().uuid().optional().nullable(),
    metadata: optionalMetadata,
  })
  .superRefine((value, context) => {
    if (Date.parse(value.pickupWindowEnd) <= Date.parse(value.pickupWindowStart)) {
      context.addIssue({
        code: "custom",
        path: ["pickupWindowEnd"],
        message: "Pickup window end must be after start.",
      });
    }

    if (value.expiresAt && Date.parse(value.expiresAt) > Date.parse(value.pickupWindowEnd)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Drop expiry cannot be after pickup window end.",
      });
    }
  });

export type StoreDropReserveInput = z.infer<typeof storeDropReserveSchema>;
export type StoreDropCancelReservationInput = z.infer<
  typeof storeDropCancelReservationSchema
>;
export type MerchantStoreDropCreateInput = z.infer<
  typeof merchantStoreDropCreateSchema
>;

export async function checkTableContracts(contracts: readonly TableContract[]) {
  const checks = await Promise.all(
    contracts.map(async (contract) => {
      const availability = await getTableAvailability(contract.table);
      const missingColumns = contract.requiredColumns.filter(
        (column) => !availability.columns.has(column),
      );

      return {
        table: contract.table,
        available: availability.exists && missingColumns.length === 0,
        exists: availability.exists,
        missingColumns,
      };
    }),
  );

  return {
    available: checks.every((check) => check.available),
    checks,
  };
}

export async function checkStoreDropContracts() {
  return checkTableContracts(CP7_STORE_DROP_TABLE_CONTRACTS);
}

export function unavailableStoreDropReason(input: { checks: ContractCheck[] }): string {
  return input.checks
    .filter((check) => !check.available)
    .map((check) =>
      check.exists
        ? `${check.table} missing columns: ${check.missingColumns.join(", ")}`
        : `${check.table} table is not available`,
    )
    .join("; ");
}

export function computeStoreDropAvailability(input: {
  quantityTotal: number;
  quantityReserved: number;
}): StoreDropAvailability {
  const quantityTotal = Math.max(0, input.quantityTotal);
  const quantityReserved = Math.max(0, input.quantityReserved);
  const quantityRemaining = Math.max(0, quantityTotal - quantityReserved);

  return {
    quantityTotal,
    quantityReserved,
    quantityRemaining,
    soldOut: quantityRemaining <= 0,
  };
}

export function formatStoreDropPrice(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

export function isReservableDropStatus(status: string | null | undefined) {
  return status === "published";
}

export function blockedDropReason(input: {
  status: string | null | undefined;
  remainingQuantity: number;
  pickupWindowEnd?: string | null;
  expiresAt?: string | null;
  now?: Date;
}) {
  const status = input.status ?? "unavailable";
  if (!isReservableDropStatus(status)) {
    return `Drop is ${status}, not open for reservations.`;
  }

  if (input.remainingQuantity <= 0) {
    return "Drop is sold out.";
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const expiry = input.expiresAt ?? input.pickupWindowEnd;
  if (expiry && Date.parse(expiry) <= nowMs) {
    return "Drop pickup window has expired.";
  }

  return null;
}

export function assertStoreDropDtoIsPrivacySafe(dto: StoreDropDto): string[] {
  const serialized = JSON.stringify(dto).toLowerCase();
  const forbiddenNeedles = [
    "home_location",
    "unit_label",
    "unitlabel",
    "email",
    "phone",
    "lat",
    "lng",
    "longitude",
    "latitude",
  ];

  return forbiddenNeedles.filter((needle) => serialized.includes(needle));
}
