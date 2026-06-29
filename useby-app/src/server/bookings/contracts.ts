import { z } from "zod";

import {
  bookingStatusValues,
  handoffStatusValues,
  reviewRatingValues,
} from "../../db/schema";
import { getTableAvailability } from "../db/introspection";

export const BOOKING_ACTIVE_RESERVATION_STATUSES = [
  "accepted",
  "reserved",
  "pickup_scheduled",
  "picked_up",
  "returned",
  "disputed",
] as const;

export const CP3_BOOKING_TABLE_CONTRACTS = [
  {
    table: "bookings",
    requiredColumns: [
      "id",
      "item_instance_id",
      "match_id",
      "need_id",
      "requester_household_id",
      "owner_household_id",
      "neighbourhood_id",
      "requested_by_user_id",
      "owner_actor_user_id",
      "status",
      "quantity",
      "unit",
      "request_note",
      "decline_reason",
      "cancel_reason",
      "safety_acknowledgement_id",
      "idempotency_key",
      "requested_at",
      "accepted_at",
      "reserved_at",
      "declined_at",
      "cancelled_at",
      "picked_up_at",
      "returned_at",
      "completed_at",
      "reviewed_at",
      "metadata",
      "demo_scope_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "handoffs",
    requiredColumns: [
      "id",
      "booking_id",
      "status",
      "pickup_window_start",
      "pickup_window_end",
      "coarse_pickup_hint",
      "scheduled_by_user_id",
      "picked_up_by_user_id",
      "completed_by_user_id",
      "scheduled_at",
      "picked_up_at",
      "returned_at",
      "completed_at",
      "completion_note",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "safety_acknowledgements",
    requiredColumns: [
      "id",
      "household_id",
      "actor_user_id",
      "neighbourhood_id",
      "acknowledgement_type",
      "version",
      "acknowledged_at",
      "expires_at",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "trust_events",
    requiredColumns: [
      "id",
      "booking_id",
      "household_id",
      "actor_household_id",
      "actor_user_id",
      "event_type",
      "delta",
      "rationale",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "reviews",
    requiredColumns: [
      "id",
      "booking_id",
      "reviewer_household_id",
      "reviewee_household_id",
      "reviewer_user_id",
      "rating",
      "note",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "reports",
    requiredColumns: [
      "id",
      "reporter_household_id",
      "reported_household_id",
      "reporter_user_id",
      "booking_id",
      "status",
      "reason",
      "details",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "blocks",
    requiredColumns: [
      "id",
      "blocker_household_id",
      "blocked_household_id",
      "blocker_user_id",
      "status",
      "reason",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
] as const;

export async function checkBookingContracts() {
  const checks = await Promise.all(
    CP3_BOOKING_TABLE_CONTRACTS.map(async (contract) => {
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

export function unavailableBookingReason(
  contracts: Awaited<ReturnType<typeof checkBookingContracts>>,
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

export const bookingRequestSchema = z
  .object({
    matchId: z.string().uuid().optional().nullable(),
    itemId: z.string().uuid().optional().nullable(),
    needId: z.string().uuid().optional().nullable(),
    quantity: z.number().positive().max(9999).default(1),
    unit: z.string().trim().min(1).max(32).optional(),
    note: optionalNote,
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((input) => Boolean(input.matchId || input.itemId), {
    message: "Provide either matchId or itemId.",
    path: ["itemId"],
  });

export const bookingReasonSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const bookingSchedulePickupSchema = z
  .object({
    pickupWindowStart: z.string().datetime({ offset: true }),
    pickupWindowEnd: z.string().datetime({ offset: true }),
    coarsePickupHint: z.string().trim().min(1).max(300).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
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

export const bookingCompleteSchema = z.object({
  note: optionalNote,
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const bookingReviewSchema = z.object({
  rating: z.enum(reviewRatingValues),
  note: optionalNote,
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
export type BookingReasonInput = z.infer<typeof bookingReasonSchema>;
export type BookingSchedulePickupInput = z.infer<typeof bookingSchedulePickupSchema>;
export type BookingCompleteInput = z.infer<typeof bookingCompleteSchema>;
export type BookingReviewInput = z.infer<typeof bookingReviewSchema>;

export type BookingStatus = (typeof bookingStatusValues)[number];
export type HandoffStatus = (typeof handoffStatusValues)[number];

export type BookingDto = {
  id: string;
  status: BookingStatus;
  item: {
    id: string;
    title: string;
    category: string;
    quantity: string;
    unit: string;
    state: string;
    safetyStatus: string;
    storageState: string;
  };
  matchId: string | null;
  needId: string | null;
  quantity: string;
  unit: string;
  requestNote: string | null;
  owner: {
    householdId: string;
    publicLabel: string;
    coarseLocationLabel: string;
  };
  requester: {
    householdId: string;
    publicLabel: string;
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

export type BookingRecomputeNote = {
  invoked: false;
  contract: "checkpoint-2-lane-2b";
  note: string;
  affectedItemIds: string[];
  affectedMatchIds: string[];
};
