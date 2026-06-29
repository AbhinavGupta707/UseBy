import { z } from "zod";

import {
  lendingAvailabilityStatusValues,
  lendingConditionEventTypeValues,
  lendingReservationStatusValues,
  reviewRatingValues,
} from "../../db/schema";
import {
  CP3_BOOKING_TABLE_CONTRACTS,
  type BookingStatus,
  type HandoffStatus,
} from "../bookings/contracts";
import { getTableAvailability } from "../db/introspection";

export const LENDING_ELIGIBLE_CATEGORIES = ["fashion", "household"] as const;
export const LENDING_LISTABLE_ITEM_STATES = ["listed"] as const;
export const LENDING_ACTIVE_RESERVATION_STATUSES = ["active"] as const;

export const CP4_LENDING_TABLE_CONTRACTS = [
  ...CP3_BOOKING_TABLE_CONTRACTS,
  {
    table: "lending_availability_windows",
    requiredColumns: [
      "id",
      "item_instance_id",
      "owner_household_id",
      "status",
      "window_start",
      "window_end",
      "note",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "lending_reservations",
    requiredColumns: [
      "id",
      "booking_id",
      "item_instance_id",
      "requester_household_id",
      "owner_household_id",
      "window_start",
      "window_end",
      "status",
      "accepted_at",
      "released_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "lending_condition_events",
    requiredColumns: [
      "id",
      "booking_id",
      "item_instance_id",
      "actor_household_id",
      "actor_user_id",
      "event_type",
      "condition_label",
      "note",
      "photo_file_ids",
      "occurred_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
] as const;

export async function checkLendingContracts() {
  const checks = await Promise.all(
    CP4_LENDING_TABLE_CONTRACTS.map(async (contract) => {
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

export function unavailableLendingReason(
  contracts: Awaited<ReturnType<typeof checkLendingContracts>>,
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

const optionalNote = z.string().trim().max(1000).optional().nullable();
const metadataSchema = z.record(z.string(), z.unknown()).default({});
const conditionPayloadSchema = z.object({
  conditionLabel: z.string().trim().max(120).optional().nullable(),
  note: optionalNote,
  photoFileIds: z.array(z.string().uuid()).max(8).default([]),
});

export const lendingRequestSchema = z
  .object({
    itemId: z.string().uuid(),
    borrowWindowStart: z.string().datetime({ offset: true }),
    borrowWindowEnd: z.string().datetime({ offset: true }),
    note: optionalNote,
    condition: conditionPayloadSchema.optional(),
    termsAccepted: z.literal(true),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    metadata: metadataSchema,
  })
  .refine(
    (input) =>
      new Date(input.borrowWindowEnd).getTime() >
      new Date(input.borrowWindowStart).getTime(),
    {
      message: "borrowWindowEnd must be after borrowWindowStart.",
      path: ["borrowWindowEnd"],
    },
  );

export const lendingReasonSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  condition: conditionPayloadSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: metadataSchema,
});

export const lendingSchedulePickupSchema = z
  .object({
    pickupWindowStart: z.string().datetime({ offset: true }),
    pickupWindowEnd: z.string().datetime({ offset: true }),
    coarsePickupHint: z.string().trim().min(1).max(300).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    metadata: metadataSchema,
  })
  .refine(
    (input) =>
      new Date(input.pickupWindowEnd).getTime() >
      new Date(input.pickupWindowStart).getTime(),
    {
      message: "pickupWindowEnd must be after pickupWindowStart.",
      path: ["pickupWindowEnd"],
    },
  );

export const lendingCompleteSchema = z.object({
  note: optionalNote,
  condition: conditionPayloadSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: metadataSchema,
});

export const lendingReviewSchema = z.object({
  rating: z.enum(reviewRatingValues),
  note: optionalNote,
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: metadataSchema,
});

export type LendingRequestInput = z.infer<typeof lendingRequestSchema>;
export type LendingReasonInput = z.infer<typeof lendingReasonSchema>;
export type LendingSchedulePickupInput = z.infer<typeof lendingSchedulePickupSchema>;
export type LendingCompleteInput = z.infer<typeof lendingCompleteSchema>;
export type LendingReviewInput = z.infer<typeof lendingReviewSchema>;
export type LendingAvailabilityStatus = (typeof lendingAvailabilityStatusValues)[number];
export type LendingReservationStatus = (typeof lendingReservationStatusValues)[number];
export type LendingConditionEventType = (typeof lendingConditionEventTypeValues)[number];
export type LendingCategory = (typeof LENDING_ELIGIBLE_CATEGORIES)[number];

export type LendingTermsDto = {
  conditionNote: string | null;
  returnExpectations: string | null;
  cleaningOrHandlingNote: string | null;
  pickupHint: string | null;
  ownerTerms: string | null;
  depositPreferenceNote: string | null;
  paymentDeferredNotice: string;
};

export type LendingListingDto = {
  id: string;
  title: string;
  category: LendingCategory;
  description: string | null;
  quantity: string;
  unit: string;
  size: string | null;
  condition: string | null;
  availabilityNote: string | null;
  owner: {
    householdId: string;
    coarseLocationLabel: string;
  };
  terms: LendingTermsDto;
  activeReservations: Array<{
    windowStart: string;
    windowEnd: string;
    status: "active";
  }>;
};

export type LendingBookingDto = {
  id: string;
  status: BookingStatus;
  item: {
    id: string;
    title: string;
    category: LendingCategory;
    state: string;
    condition: string | null;
    size: string | null;
  };
  reservation: {
    id: string;
    status: LendingReservationStatus;
    borrowWindowStart: string;
    borrowWindowEnd: string;
    acceptedAt: string | null;
    releasedAt: string | null;
  };
  owner: {
    householdId: string;
    coarseLocationLabel: string;
  };
  requester: {
    householdId: string;
    coarseLocationLabel: string;
  };
  handoff: {
    id: string;
    status: HandoffStatus;
    pickupWindowStart: string | null;
    pickupWindowEnd: string | null;
    coarsePickupHint: string | null;
    completionNote: string | null;
  } | null;
  requestNote: string | null;
  terms: LendingTermsDto;
  timeline: {
    requestedAt: string;
    acceptedAt: string | null;
    reservedAt: string | null;
    declinedAt: string | null;
    cancelledAt: string | null;
    pickedUpAt: string | null;
    returnedAt: string | null;
    completedAt: string | null;
    reviewedAt: string | null;
    updatedAt: string;
  };
};
