import { z } from "zod";

export const moderationCategorySchema = z.enum([
  "safety",
  "no_show",
  "harassment",
  "spam",
  "damaged_item",
  "other",
]);

export const reportCreateSchema = z.object({
  category: moderationCategorySchema,
  reason: z.string().trim().min(8).max(240),
  details: z.string().trim().max(2000).optional().nullable(),
  targetHouseholdId: z.string().uuid().optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
  bookingId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const blockCreateSchema = z.object({
  blockedHouseholdId: z.string().uuid(),
  reason: z.string().trim().max(240).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type BlockCreateInput = z.infer<typeof blockCreateSchema>;

export type ReportDto = {
  id: string | null;
  category: string;
  reason: string;
  status: string;
  reporterHouseholdId: string;
  targetHouseholdId: string | null;
  bookingId: string | null;
  itemId: string | null;
  createdAt: string;
};

export type BlockDto = {
  id: string | null;
  blockerHouseholdId: string;
  blockedHouseholdId: string;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type RelationshipBlockCheck =
  | { status: "available"; blocked: boolean; block: BlockDto | null }
  | { status: "unavailable"; blocked: false; block: null; reason: string };
