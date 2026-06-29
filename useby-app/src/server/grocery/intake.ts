import { z } from "zod";

import { recordAuditEvent } from "../audit/events";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import { uploadPrivateFile, type PrivateUploadResult } from "../storage/private-files";
import {
  parseGroceryDocument,
  type GroceryParsedDocument,
  type TextractIntakeKind,
} from "../textract/grocery-parser";
import {
  groceryImportSchema,
  groceryItemUpdateSchema,
  type GroceryImportInput,
  type GroceryItemUpdateInput,
} from "./contracts";
import {
  importGroceryItems,
  isGroceryRuntimeError,
  updateGroceryItem,
} from "./runtime";

export const groceryFileIntakeSchema = z
  .object({
    kind: z.enum(["receipt", "expiry_label"]),
    fileName: z.string().trim().min(1).max(180).default("grocery-intake.txt"),
    contentType: z.string().trim().min(3).max(120).default("text/plain"),
    contentBase64: z.string().trim().max(10_000_000).optional().nullable(),
    rawText: z.string().trim().max(8000).optional().nullable(),
    parse: z.boolean().default(true),
    apply: z.boolean().default(false),
    allowFixture: z.boolean().default(true),
    itemId: z.string().uuid().optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(200).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    if (!value.contentBase64 && !value.rawText) {
      context.addIssue({
        code: "custom",
        message: "Provide contentBase64 or rawText for grocery intake.",
        path: ["contentBase64"],
      });
    }

    if (value.kind === "expiry_label" && value.apply && !value.itemId) {
      context.addIssue({
        code: "custom",
        message: "Applying an expiry label requires itemId.",
        path: ["itemId"],
      });
    }
  });

export type GroceryFileIntakeInput = z.infer<typeof groceryFileIntakeSchema>;

export type GroceryFileIntakeResponse = {
  ok: true;
  idempotent: boolean;
  intake: {
    id: string;
    kind: TextractIntakeKind;
    status: "upload_unavailable" | "uploaded" | "parse_unavailable" | "parsed" | "applied" | "failed";
    fileId: string | null;
    access: "private_server_mediated" | "unavailable";
  };
  storage: {
    provider: "s3";
    mode: "live" | "unavailable";
    available: boolean;
    reason: string | null;
  };
  parse: {
    requested: boolean;
    provider: "textract";
    mode: GroceryParsedDocument["mode"];
    status: GroceryParsedDocument["status"] | "not_requested";
    fixture: boolean;
    reason: string | null;
    lineCount: number;
    payload: GroceryParsedDocument | null;
  };
  apply: {
    requested: boolean;
    applied: boolean;
    receiptImportId: string | null;
    itemId: string | null;
    result: unknown | null;
    reason: string | null;
  };
};

type IntakeRow = {
  id: string;
  status: GroceryFileIntakeResponse["intake"]["status"];
  file_id: string | null;
  parsed_payload: string | Record<string, unknown> | null;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function decodeBase64(contentBase64: string | null | undefined): Uint8Array | null {
  if (!contentBase64) {
    return null;
  }

  const normalized = contentBase64.includes(",")
    ? contentBase64.slice(contentBase64.indexOf(",") + 1)
    : contentBase64;
  return Buffer.from(normalized, "base64");
}

function rawTextBytes(input: GroceryFileIntakeInput): Uint8Array | null {
  const decoded = decodeBase64(input.contentBase64);
  if (decoded) {
    return decoded;
  }

  return input.rawText ? Buffer.from(input.rawText, "utf8") : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function findExistingIntake(
  context: DemoActorContext,
  idempotencyKey: string | null | undefined,
): Promise<IntakeRow | null> {
  if (!idempotencyKey) {
    return null;
  }

  const result = await executeSql<IntakeRow>({
    sql: `
      select
        id::text as id,
        status::text as status,
        file_id::text as file_id,
        parsed_payload::text as parsed_payload
      from file_intakes
      where idempotency_key = :idempotencyKey
        and owner_household_id = :householdId::uuid
        and deleted_at is null
      limit 1
    `,
    parameters: params({
      idempotencyKey,
      householdId: context.household.id,
    }),
  });

  return result.rows[0] ?? null;
}

async function insertFileRow(
  context: DemoActorContext,
  input: GroceryFileIntakeInput,
  upload: Extract<PrivateUploadResult, { ok: true }>,
): Promise<string> {
  const result = await executeSql<{ id: string }>({
    sql: `
      insert into files (
        owner_household_id, uploader_user_id, role, bucket, object_key,
        content_type, byte_size, sha256, metadata, demo_scope_id, is_demo
      )
      values (
        :householdId::uuid, :userId::uuid, :role::file_role, :bucket, :objectKey,
        :contentType, :byteSize, :sha256, :metadata::jsonb, :demoScope, true
      )
      returning id::text as id
    `,
    parameters: params({
      householdId: context.household.id,
      userId: context.user.id,
      role: input.kind,
      bucket: upload.bucket,
      objectKey: upload.objectKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      sha256: upload.sha256,
      metadata: {
        ...input.metadata,
        access: "private_server_mediated",
        provider: "s3",
      },
      demoScope: context.demoScope,
    }),
  });

  return result.rows[0].id;
}

async function insertIntakeRow(
  context: DemoActorContext,
  input: GroceryFileIntakeInput,
  upload: PrivateUploadResult,
  fileId: string | null,
): Promise<IntakeRow> {
  const uploadStatus = upload.ok ? "uploaded" : "upload_unavailable";
  const result = await executeSql<IntakeRow>({
    sql: `
      insert into file_intakes (
        file_id, owner_household_id, actor_user_id, neighbourhood_id, kind,
        status, storage_provider, storage_status, parse_provider, parse_status,
        raw_text, error_message, idempotency_key, metadata, demo_scope_id, is_demo
      )
      values (
        :fileId::uuid, :householdId::uuid, :userId::uuid, :neighbourhoodId::uuid,
        :kind::file_intake_kind, :status::file_intake_status, 's3',
        :storageStatus::provider_run_mode, 'textract', 'unavailable',
        nullif(:rawText, ''), nullif(:errorMessage, ''), nullif(:idempotencyKey, ''),
        :metadata::jsonb, :demoScope, true
      )
      returning id::text as id, status::text as status, file_id::text as file_id, parsed_payload::text as parsed_payload
    `,
    parameters: params({
      fileId,
      householdId: context.household.id,
      userId: context.user.id,
      neighbourhoodId: context.neighbourhood.id,
      kind: input.kind,
      status: uploadStatus,
      storageStatus: upload.ok ? "live" : "unavailable",
      rawText: input.rawText ?? "",
      errorMessage: upload.ok ? "" : upload.reason,
      idempotencyKey: input.idempotencyKey ?? "",
      metadata: {
        ...input.metadata,
        route: "/api/grocery/intake",
        fileName: input.fileName,
        contentType: input.contentType,
      },
      demoScope: context.demoScope,
    }),
  });

  return result.rows[0];
}

async function updateParsedIntake(
  intakeId: string,
  parsed: GroceryParsedDocument,
): Promise<void> {
  const status = parsed.status === "parsed" ? "parsed" : "parse_unavailable";
  await executeSql({
    sql: `
      update file_intakes
      set status = :status::file_intake_status,
          parse_status = :parseStatus::provider_run_mode,
          raw_parse = :rawParse::jsonb,
          parsed_payload = :parsedPayload::jsonb,
          raw_text = coalesce(nullif(:rawText, ''), raw_text),
          error_message = nullif(:errorMessage, ''),
          parsed_at = case when :status = 'parsed' then now() else parsed_at end,
          updated_at = now()
      where id = :intakeId::uuid
    `,
    parameters: params({
      intakeId,
      status,
      parseStatus: parsed.mode,
      rawParse: parsed.rawProviderPayload ?? {},
      parsedPayload: parsed,
      rawText: parsed.rawText,
      errorMessage: parsed.reason ?? "",
    }),
  });
}

async function markAppliedIntake(
  intakeId: string,
  values: {
    receiptImportId?: string | null;
    targetItemId?: string | null;
  },
): Promise<void> {
  await executeSql({
    sql: `
      update file_intakes
      set status = 'applied',
          receipt_import_id = coalesce(:receiptImportId::uuid, receipt_import_id),
          target_item_instance_id = coalesce(:targetItemId::uuid, target_item_instance_id),
          applied_at = now(),
          updated_at = now()
      where id = :intakeId::uuid
    `,
    parameters: params({
      intakeId,
      receiptImportId: values.receiptImportId ?? null,
      targetItemId: values.targetItemId ?? null,
    }),
  });
}

function importInputFromParsed(
  context: DemoActorContext,
  input: GroceryFileIntakeInput,
  intakeId: string,
  fileId: string | null,
  parsed: GroceryParsedDocument,
): GroceryImportInput {
  const candidate = {
    idempotencyKey: input.idempotencyKey
      ? `grocery-intake-apply:${input.idempotencyKey}`
      : `grocery-intake-apply:${intakeId}`,
    source: "receipt",
    merchantName: parsed.merchantName,
    purchaseDate: parsed.purchaseDate,
    rawText: parsed.rawText,
    currency: "GBP",
    lines: parsed.lines.map((line) => ({
      title: line.title,
      rawText: line.rawText,
      quantity: line.quantity,
      unit: line.unit,
      priceCents: line.priceCents,
      useByDate: line.useByDate,
      bestBeforeDate: line.bestBeforeDate,
      expiryConfidence: parsed.mode === "live" ? "medium" : "low",
      labelRawText: line.labelRawText,
      metadata: {
        fileIntakeId: intakeId,
        fileId,
        parseMode: parsed.mode,
        actorHouseholdId: context.household.id,
      },
    })),
    metadata: {
      sourceRoute: "/api/grocery/intake",
      fileIntakeId: intakeId,
      fileId,
      parseMode: parsed.mode,
      fixture: parsed.fixture,
    },
  };

  return groceryImportSchema.parse(candidate);
}

function itemUpdateFromParsed(
  input: GroceryFileIntakeInput,
  intakeId: string,
  fileId: string | null,
  parsed: GroceryParsedDocument,
): GroceryItemUpdateInput {
  const line = parsed.lines[0];
  const candidate = {
    idempotencyKey: input.idempotencyKey
      ? `grocery-label-apply:${input.idempotencyKey}`
      : `grocery-label-apply:${intakeId}`,
    useByDate: line?.useByDate ?? null,
    bestBeforeDate: line?.bestBeforeDate ?? null,
    expiryConfidence: parsed.mode === "live" ? "high" : "low",
    expirySource: "label",
    labelRawText: line?.labelRawText ?? parsed.rawText,
    note: parsed.fixture ? "Fixture/dry-run label parse; verify before relying on this date." : null,
    metadata: {
      sourceRoute: "/api/grocery/intake",
      fileIntakeId: intakeId,
      fileId,
      parseMode: parsed.mode,
      fixture: parsed.fixture,
    },
  };

  return groceryItemUpdateSchema.parse(candidate);
}

async function audit(
  context: DemoActorContext,
  eventType: string,
  intakeId: string,
  metadata: Record<string, unknown>,
) {
  await recordAuditEvent({
    eventType,
    actorType: "user",
    actorId: context.user.id,
    source: "/api/grocery/intake",
    entityType: "file_intake",
    entityId: intakeId,
    idempotencyKey: typeof metadata.idempotencyKey === "string" ? metadata.idempotencyKey : null,
    metadata: {
      ...metadata,
      householdId: context.household.id,
      neighbourhoodId: context.neighbourhood.id,
    },
  });
}

export async function runGroceryFileIntake(
  context: DemoActorContext,
  input: GroceryFileIntakeInput,
): Promise<GroceryFileIntakeResponse> {
  const existing = await findExistingIntake(context, input.idempotencyKey);
  if (existing) {
    return {
      ok: true,
      idempotent: true,
      intake: {
        id: existing.id,
        kind: input.kind,
        status: existing.status,
        fileId: existing.file_id,
        access: existing.file_id ? "private_server_mediated" : "unavailable",
      },
      storage: {
        provider: "s3",
        mode: existing.file_id ? "live" : "unavailable",
        available: Boolean(existing.file_id),
        reason: existing.file_id ? null : "Existing intake has no private file.",
      },
      parse: {
        requested: input.parse,
        provider: "textract",
        mode: "dry_run",
        status: existing.status === "parsed" || existing.status === "applied" ? "parsed" : "not_requested",
        fixture: true,
        reason: "Idempotent response restored from existing file_intakes row.",
        lineCount: 0,
        payload: null,
      },
      apply: {
        requested: input.apply,
        applied: existing.status === "applied",
        receiptImportId: null,
        itemId: input.itemId ?? null,
        result: jsonObject(existing.parsed_payload),
        reason: "Idempotent response restored from existing file_intakes row.",
      },
    };
  }

  const bytes = rawTextBytes(input);
  const upload = bytes
    ? await uploadPrivateFile({
        householdId: context.household.id,
        demoScope: context.demoScope,
        role: input.kind,
        fileName: input.fileName,
        contentType: input.contentType,
        bytes,
      })
    : ({
        ok: false,
        provider: "s3",
        mode: "unavailable",
        bucket: null,
        reason: "No upload bytes supplied.",
      } as const);

  let fileId: string | null = null;
  try {
    if (upload.ok) {
      fileId = await insertFileRow(context, input, upload);
    }

    const intake = await insertIntakeRow(context, input, upload, fileId);
    await audit(context, upload.ok ? "grocery.file_uploaded" : "grocery.file_upload_unavailable", intake.id, {
      idempotencyKey: input.idempotencyKey ?? null,
      kind: input.kind,
      fileId,
      provider: "s3",
      mode: upload.mode,
      reason: upload.ok ? null : upload.reason,
    });

    let parsed: GroceryParsedDocument | null = null;
    if (input.parse) {
      parsed = await parseGroceryDocument({
        kind: input.kind,
        bucket: upload.ok ? upload.bucket : null,
        objectKey: upload.ok ? upload.objectKey : null,
        rawText: input.rawText,
        allowFixture: input.allowFixture,
      });
      await updateParsedIntake(intake.id, parsed);
      await audit(context, parsed.status === "parsed" ? "grocery.file_parsed" : "grocery.file_parse_unavailable", intake.id, {
        idempotencyKey: input.idempotencyKey ?? null,
        kind: input.kind,
        provider: "textract",
        mode: parsed.mode,
        fixture: parsed.fixture,
        reason: parsed.reason ?? null,
        lineCount: parsed.lines.length,
      });
    }

    let applyResult: GroceryFileIntakeResponse["apply"] = {
      requested: input.apply,
      applied: false,
      receiptImportId: null,
      itemId: input.itemId ?? null,
      result: null,
      reason: input.apply ? null : "Apply not requested.",
    };

    if (input.apply) {
      if (!parsed || parsed.status !== "parsed") {
        applyResult = {
          ...applyResult,
          reason: "Cannot apply because parse did not produce parsed grocery data.",
        };
      } else if (input.kind === "receipt") {
        if (parsed.lines.length === 0) {
          applyResult = {
            ...applyResult,
            reason: "Cannot apply receipt because no line items were parsed.",
          };
        } else {
          const applied = await importGroceryItems(
            context,
            importInputFromParsed(context, input, intake.id, fileId, parsed),
          );
          await markAppliedIntake(intake.id, {
            receiptImportId: applied.receiptImport.id,
          });
          applyResult = {
            requested: true,
            applied: true,
            receiptImportId: applied.receiptImport.id,
            itemId: null,
            result: applied,
            reason: null,
          };
        }
      } else if (input.itemId) {
        const applied = await updateGroceryItem(
          context,
          input.itemId,
          itemUpdateFromParsed(input, intake.id, fileId, parsed),
        );
        await markAppliedIntake(intake.id, {
          targetItemId: input.itemId,
        });
        applyResult = {
          requested: true,
          applied: true,
          receiptImportId: null,
          itemId: input.itemId,
          result: applied,
          reason: null,
        };
      }

      await audit(context, applyResult.applied ? "grocery.file_parse_applied" : "grocery.file_apply_skipped", intake.id, {
        idempotencyKey: input.idempotencyKey ?? null,
        kind: input.kind,
        applied: applyResult.applied,
        receiptImportId: applyResult.receiptImportId,
        itemId: applyResult.itemId,
        reason: applyResult.reason,
      });
    }

    return {
      ok: true,
      idempotent: false,
      intake: {
        id: intake.id,
        kind: input.kind,
        status: applyResult.applied
          ? "applied"
          : parsed?.status === "parsed"
            ? "parsed"
            : upload.ok
              ? "uploaded"
              : "upload_unavailable",
        fileId,
        access: fileId ? "private_server_mediated" : "unavailable",
      },
      storage: {
        provider: "s3",
        mode: upload.ok ? "live" : "unavailable",
        available: upload.ok,
        reason: upload.ok ? null : upload.reason,
      },
      parse: {
        requested: input.parse,
        provider: "textract",
        mode: parsed?.mode ?? "unavailable",
        status: parsed?.status ?? "not_requested",
        fixture: parsed?.fixture ?? false,
        reason: parsed?.reason ?? null,
        lineCount: parsed?.lines.length ?? 0,
        payload: parsed,
      },
      apply: applyResult,
    };
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      throw error;
    }

    throw new Error(publicErrorMessage(error));
  }
}
