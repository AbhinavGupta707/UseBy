import { z } from "zod";

import { getTableAvailability } from "../db/introspection";

export const CP6_BASE_TABLE_CONTRACTS = [
  {
    table: "demand_pools",
    requiredColumns: [
      "id",
      "neighbourhood_id",
      "awarded_bid_id",
      "title",
      "description",
      "status",
      "target_location",
      "threshold_quantity",
      "committed_quantity",
      "threshold_households",
      "committed_households",
      "unit",
      "closes_at",
      "bidding_opens_at",
      "awarded_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "demand_pool_commitments",
    requiredColumns: [
      "id",
      "demand_pool_id",
      "household_id",
      "quantity",
      "unit",
      "status",
      "committed_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "merchant_bids",
    requiredColumns: [
      "id",
      "demand_pool_id",
      "merchant_id",
      "merchant_location_id",
      "status",
      "price_cents",
      "currency",
      "min_quantity",
      "available_quantity",
      "pickup_window_start",
      "pickup_window_end",
      "score",
      "terms",
      "submitted_at",
      "awarded_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "merchants",
    requiredColumns: [
      "id",
      "slug",
      "name",
      "category",
      "demo_scope_id",
      "is_demo",
      "deleted_at",
    ],
  },
  {
    table: "merchant_locations",
    requiredColumns: [
      "id",
      "merchant_id",
      "neighbourhood_id",
      "name",
      "public_address",
      "location",
      "pickup_notes",
      "is_active",
      "demo_scope_id",
      "is_demo",
      "deleted_at",
    ],
  },
] as const;

export const CP6_OUTPUT_TABLE_CONTRACTS = [
  {
    table: "pool_orders",
    requiredColumns: [
      "id",
      "demand_pool_id",
      "commitment_id",
      "household_id",
      "merchant_id",
      "merchant_bid_id",
      "status",
      "quantity",
      "unit",
      "price_cents",
      "currency",
      "coarse_pickup_hint",
      "ready_at",
      "collected_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "pickup_tasks",
    requiredColumns: [
      "id",
      "pool_order_id",
      "demand_pool_id",
      "merchant_id",
      "merchant_location_id",
      "status",
      "window_start",
      "window_end",
      "coarse_pickup_hint",
      "ready_at",
      "collected_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
] as const;

export async function checkCp6Contracts(
  contracts: readonly {
    table: string;
    requiredColumns: readonly string[];
  }[] = [...CP6_BASE_TABLE_CONTRACTS, ...CP6_OUTPUT_TABLE_CONTRACTS],
) {
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

export function unavailableCp6Reason(
  contracts: Awaited<ReturnType<typeof checkCp6Contracts>>,
): string {
  return contracts.checks
    .filter((check) => !check.available)
    .map((check) =>
      check.exists
        ? `${check.table} missing columns: ${check.missingColumns.join(", ")}`
        : `${check.table} table is not available`,
    )
    .join("; ");
}

export const merchantBidInputSchema = z
  .object({
    demandPoolId: z.string().uuid(),
    merchantLocationId: z.string().uuid().optional().nullable(),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().trim().length(3).default("GBP"),
    minQuantity: z.number().nonnegative().default(0),
    availableQuantity: z.number().positive(),
    pickupWindowStart: z.string().datetime({ offset: true }).optional().nullable(),
    pickupWindowEnd: z.string().datetime({ offset: true }).optional().nullable(),
    terms: z.string().trim().max(2000).optional().nullable(),
    substitutionPolicy: z.string().trim().max(1000).optional().nullable(),
    fulfilmentNotes: z.string().trim().max(1000).optional().nullable(),
    reliabilityEvidence: z.string().trim().max(1000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine(
    (input) =>
      !input.pickupWindowStart ||
      !input.pickupWindowEnd ||
      new Date(input.pickupWindowEnd).getTime() >
        new Date(input.pickupWindowStart).getTime(),
    {
      message: "pickupWindowEnd must be after pickupWindowStart.",
      path: ["pickupWindowEnd"],
    },
  );

export const merchantBidWithdrawSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const pickupTransitionSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type MerchantBidInput = z.infer<typeof merchantBidInputSchema>;
export type MerchantBidWithdrawInput = z.infer<typeof merchantBidWithdrawSchema>;
export type PickupTransitionInput = z.infer<typeof pickupTransitionSchema>;
