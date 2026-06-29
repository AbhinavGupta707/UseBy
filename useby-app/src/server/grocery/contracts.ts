import { z } from "zod";

import {
  expiryConfidenceValues,
  expiryObservationSourceValues,
  itemStateValues,
  safetyStatusValues,
  storageStateValues,
} from "../../db/schema";

export const groceryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date")
  .optional()
  .nullable();

export const groceryImportLineSchema = z.object({
  title: z.string().trim().min(1).max(160),
  rawText: z.string().trim().max(500).optional(),
  quantity: z.number().positive().max(9999).default(1),
  unit: z.string().trim().min(1).max(32).default("each"),
  priceCents: z.number().int().min(0).max(999999).optional().nullable(),
  catalogItemId: z.string().uuid().optional().nullable(),
  storageState: z.enum(storageStateValues).default("cupboard"),
  safetyStatus: z.enum(safetyStatusValues).default("unknown"),
  useByDate: groceryDateSchema,
  bestBeforeDate: groceryDateSchema,
  expiryConfidence: z.enum(expiryConfidenceValues).default("medium"),
  labelRawText: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const groceryImportSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  source: z.enum(["manual", "receipt"]).default("manual"),
  merchantName: z.string().trim().max(160).optional().nullable(),
  purchaseDate: groceryDateSchema,
  rawText: z.string().trim().max(8000).optional().nullable(),
  subtotalCents: z.number().int().min(0).max(99999999).optional().nullable(),
  taxCents: z.number().int().min(0).max(99999999).optional().nullable(),
  totalCents: z.number().int().min(0).max(99999999).optional().nullable(),
  currency: z.string().trim().length(3).default("GBP"),
  lines: z.array(groceryImportLineSchema).min(1).max(80),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const groceryItemUpdateSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  storageState: z.enum(storageStateValues).optional(),
  itemState: z.enum(itemStateValues).optional(),
  safetyStatus: z.enum(safetyStatusValues).optional(),
  quantity: z.number().positive().max(9999).optional(),
  useByDate: groceryDateSchema,
  bestBeforeDate: groceryDateSchema,
  expiryConfidence: z.enum(expiryConfidenceValues).default("medium"),
  expirySource: z.enum(expiryObservationSourceValues).default("manual"),
  labelRawText: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type GroceryImportInput = z.infer<typeof groceryImportSchema>;
export type GroceryImportLineInput = z.infer<typeof groceryImportLineSchema>;
export type GroceryItemUpdateInput = z.infer<typeof groceryItemUpdateSchema>;

export type GroceryItemDto = {
  id: string;
  title: string;
  quantity: string;
  unit: string;
  itemState: string;
  storageState: string;
  safetyStatus: string;
  useByDate: string | null;
  bestBeforeDate: string | null;
  expiresAt: string | null;
  sourceType: string;
  household: {
    id: string;
    publicLabel: string;
    coarseLocationLabel: string;
  };
};

export type GroceryRecomputeNote = {
  invoked: false;
  contract: "checkpoint-2-lane-2b";
  note: string;
  affectedItemIds: string[];
};
