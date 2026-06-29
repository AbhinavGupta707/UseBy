import { z } from "zod";

export const safetyAcknowledgementTypeSchema = z
  .enum(["food_handoff"])
  .default("food_handoff");

export const safetyAcknowledgementCreateSchema = z.object({
  acknowledgementType: safetyAcknowledgementTypeSchema,
  itemId: z.string().uuid().optional().nullable(),
  bookingId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200).optional().nullable(),
  acknowledgedNotice: z
    .boolean()
    .refine((value) => value, "Food handoff acknowledgement must be explicit."),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SafetyAcknowledgementCreateInput = z.infer<
  typeof safetyAcknowledgementCreateSchema
>;

export type SafetyAcknowledgementDto = {
  id: string | null;
  acknowledgementType: "food_handoff" | string;
  householdId: string;
  actorUserId: string | null;
  itemId: string | null;
  bookingId: string | null;
  acknowledgedAt: string;
};

export type SafetyAcknowledgementCheckInput = {
  householdId: string;
  acknowledgementType?: "food_handoff" | string;
  itemId?: string | null;
  bookingId?: string | null;
};

export type SafetyAcknowledgementCheckResult =
  | {
      status: "available";
      acknowledged: boolean;
      acknowledgement: SafetyAcknowledgementDto | null;
    }
  | {
      status: "unavailable";
      acknowledged: false;
      acknowledgement: null;
      reason: string;
    };
