import { z } from "zod";

import {
  bidStatusValues,
  commitmentStatusValues,
  pickupTaskStatusValues,
  poolOrderStatusValues,
  poolStatusValues,
} from "../../db/schema";
import { getTableAvailability } from "../db/introspection";

export const DEMAND_POOL_PAYMENT_NOTICE =
  "Unpaid demo intent only. No card, deposit, payment authorization, ledger entry, or captured charge is created.";

export const CP6_DEMAND_POOL_TABLE_CONTRACTS = [
  {
    table: "demand_pools",
    requiredColumns: [
      "id",
      "neighbourhood_id",
      "created_by_household_id",
      "catalog_item_id",
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
      "opens_at",
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
      "idempotency_key",
      "committed_at",
      "cancelled_at",
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
    table: "pool_orders",
    requiredColumns: [
      "id",
      "demand_pool_id",
      "commitment_id",
      "household_id",
      "merchant_bid_id",
      "merchant_id",
      "merchant_location_id",
      "status",
      "quantity",
      "unit",
      "price_cents",
      "currency",
      "pickup_window_start",
      "pickup_window_end",
      "ready_at",
      "collected_at",
      "fulfilled_at",
      "cancelled_at",
      "status_evidence",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "pickup_tasks",
    requiredColumns: [
      "id",
      "pool_order_id",
      "demand_pool_id",
      "household_id",
      "merchant_id",
      "merchant_location_id",
      "status",
      "coarse_pickup_label",
      "pickup_window_start",
      "pickup_window_end",
      "ready_at",
      "collected_at",
      "cancelled_at",
      "evidence",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
] as const;

export async function checkDemandPoolContracts() {
  const checks = await Promise.all(
    CP6_DEMAND_POOL_TABLE_CONTRACTS.map(async (contract) => {
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

export function unavailableDemandPoolReason(
  contracts: Awaited<ReturnType<typeof checkDemandPoolContracts>>,
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

const optionalMetadata = z.record(z.string(), z.unknown()).default({});
const optionalNote = z.string().trim().max(1000).optional().nullable();
const optionalIdempotencyKey = z.string().trim().min(8).max(200).optional();
const optionalMaxPricePence = z.number().int().nonnegative().max(1_000_000).optional().nullable();

export const demandPoolCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    requestedItems: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    unit: z.string().trim().min(1).max(32).default("bundle"),
    thresholdQuantity: z.number().positive().max(9999).optional(),
    thresholdHouseholds: z.number().int().positive().max(500).default(3),
    closesAt: z.string().datetime({ offset: true }),
    maxPricePencePerHousehold: optionalMaxPricePence,
    pickupRadiusMeters: z.number().int().positive().max(10_000).default(1500),
    idempotencyKey: optionalIdempotencyKey,
    metadata: optionalMetadata,
  })
  .refine((input) => new Date(input.closesAt).getTime() > Date.now(), {
    message: "closesAt must be in the future.",
    path: ["closesAt"],
  });

export const demandPoolCommitSchema = z.object({
  quantity: z.number().positive().max(9999),
  maxPricePence: optionalMaxPricePence,
  note: optionalNote,
  idempotencyKey: optionalIdempotencyKey,
  metadata: optionalMetadata,
});

export const demandPoolCancelCommitmentSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: optionalIdempotencyKey,
  metadata: optionalMetadata,
});

export type DemandPoolCreateInput = z.infer<typeof demandPoolCreateSchema>;
export type DemandPoolCommitInput = z.infer<typeof demandPoolCommitSchema>;
export type DemandPoolCancelCommitmentInput = z.infer<typeof demandPoolCancelCommitmentSchema>;

export type PoolStatus = (typeof poolStatusValues)[number];
export type CommitmentStatus = (typeof commitmentStatusValues)[number];
export type BidStatus = (typeof bidStatusValues)[number];
export type PoolOrderStatus = (typeof poolOrderStatusValues)[number];
export type PickupTaskStatus = (typeof pickupTaskStatusValues)[number];

export type DemandPoolCommitmentDto = {
  id: string;
  status: CommitmentStatus;
  quantity: string;
  unit: string;
  maxPricePence: number | null;
  note: string | null;
  committedAt: string;
  cancelledAt: string | null;
  updatedAt: string;
  paymentNotice: typeof DEMAND_POOL_PAYMENT_NOTICE;
};

export type DemandPoolBidSummaryDto = {
  id: string;
  status: BidStatus;
  merchantName: string;
  priceCents: number;
  currency: string;
  availableQuantity: string;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  terms: string | null;
  submittedAt: string;
};

export type DemandPoolDto = {
  id: string;
  title: string;
  description: string | null;
  status: PoolStatus;
  unit: string;
  requestedItems: string[];
  pickupAreaLabel: string;
  pickupRadiusMeters: number | null;
  threshold: {
    quantity: string;
    households: number;
  };
  committed: {
    quantity: string;
    households: number;
  };
  progress: {
    quantityPercent: number;
    householdsPercent: number;
    thresholdMet: boolean;
  };
  currentHouseholdCommitment: DemandPoolCommitmentDto | null;
  bidSummary?: {
    submitted: number;
    winningBidId: string | null;
  };
  bids?: DemandPoolBidSummaryDto[];
  awardedBidId: string | null;
  timeline: {
    opensAt: string;
    closesAt: string;
    biddingOpensAt: string | null;
    awardedAt: string | null;
    updatedAt: string;
  };
  paymentNotice: typeof DEMAND_POOL_PAYMENT_NOTICE;
};

export type DemandPoolOrderDto = {
  id: string;
  poolId: string;
  poolTitle: string;
  status: PoolOrderStatus;
  quantity: string;
  unit: string;
  priceCents: number | null;
  currency: string;
  merchant: {
    id: string | null;
    name: string | null;
    pickupAreaLabel: string | null;
  };
  pickup: {
    taskId: string | null;
    status: PickupTaskStatus | null;
    coarsePickupLabel: string | null;
    pickupWindowStart: string | null;
    pickupWindowEnd: string | null;
    readyAt: string | null;
    collectedAt: string | null;
  };
  timeline: {
    createdAt: string;
    updatedAt: string;
    fulfilledAt: string | null;
    cancelledAt: string | null;
  };
  paymentNotice: typeof DEMAND_POOL_PAYMENT_NOTICE;
};

export function nextPoolStatusAfterRecompute(input: {
  currentStatus: PoolStatus;
  committedQuantity: number;
  committedHouseholds: number;
  thresholdQuantity: number;
  thresholdHouseholds: number;
}): PoolStatus {
  const thresholdMet =
    input.committedQuantity >= input.thresholdQuantity ||
    input.committedHouseholds >= input.thresholdHouseholds;

  if (input.currentStatus === "gathering" && thresholdMet) {
    return "threshold_met";
  }

  if (input.currentStatus === "threshold_met" && !thresholdMet) {
    return "gathering";
  }

  return input.currentStatus;
}

export function assertDemandPoolDtoIsPrivacySafe(pool: DemandPoolDto) {
  const serialized = JSON.stringify(pool);
  const forbidden = [
    "homeLocation",
    "targetLocation",
    "latitude",
    "longitude",
    "lat",
    "lng",
    "email",
    "phone",
    "address",
  ];

  return forbidden.filter((field) => serialized.includes(field));
}
