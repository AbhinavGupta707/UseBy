import { z } from "zod";

import { getTableAvailability } from "../db/introspection";

export const STORE_DROP_PAYMENT_NOTICE =
  "Unpaid demo reservation only. No card, deposit, payment authorization, ledger entry, or captured charge is created.";

export const storeDropStatusValues = [
  "draft",
  "published",
  "paused",
  "closed",
  "sold_out",
  "expired",
  "deleted",
] as const;

export const storeDropReservationStatusValues = [
  "active",
  "cancelled",
  "released",
  "expired",
  "fulfilled",
] as const;

export const RESERVABLE_STORE_DROP_STATUSES = ["published"] as const;
export const ACTIVE_STORE_DROP_RESERVATION_STATUSES = ["active"] as const;
export const BLOCKED_STORE_DROP_STATUSES = [
  "expired",
  "paused",
  "closed",
  "sold_out",
  "deleted",
  "unavailable",
] as const;

export type StoreDropStatus = (typeof storeDropStatusValues)[number];
export type StoreDropReservationStatus =
  (typeof storeDropReservationStatusValues)[number];

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
      "title",
      "description",
      "category",
      "status",
      "total_quantity",
      "unit",
      "price_cents",
      "currency",
      "pickup_window_start",
      "pickup_window_end",
      "available_at",
      "expires_at",
      "published_at",
      "paused_at",
      "closed_at",
      "sold_out_at",
      "safety_notes",
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
      "reserved_by_user_id",
      "status",
      "quantity",
      "unit",
      "idempotency_key",
      "reserved_at",
      "cancelled_at",
      "released_at",
      "expires_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
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
  {
    table: "merchant_locations",
    requiredColumns: [
      "id",
      "merchant_id",
      "neighbourhood_id",
      "location",
      "is_active",
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

export function unavailableStoreDropReason(input: { checks: ContractCheck[] }) {
  return input.checks
    .filter((check) => !check.available)
    .map((check) =>
      check.exists
        ? `${check.table} missing columns: ${check.missingColumns.join(", ")}`
        : `${check.table} table is not available`,
    )
    .join("; ");
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

const optionalMetadata = z.record(z.string(), z.unknown()).default({});
const optionalTrimmedText = z.string().trim().max(1000).optional().nullable();

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

export const storeDropReserveSchema = z.object({
  quantity: z.number().positive().max(99999).default(1),
  idempotencyKey: z.string().trim().min(8).max(200).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  metadata: optionalMetadata,
});

export type MerchantStoreDropCreateInput = z.infer<
  typeof merchantStoreDropCreateSchema
>;
export type StoreDropReserveInput = z.infer<typeof storeDropReserveSchema>;

