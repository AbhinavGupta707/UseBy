import { createHash } from "node:crypto";

import { publicErrorMessage } from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import type {
  GroceryImportInput,
  GroceryItemDto,
  GroceryItemUpdateInput,
  GroceryRecomputeNote,
} from "./contracts";

type IdempotencyRow = {
  status: string;
  request_hash: string;
  response_json: unknown | null;
};

type ItemRow = {
  id: string;
  title: string;
  quantity: string;
  unit: string;
  item_state: string;
  storage_state: string;
  safety_status: string;
  use_by_date: string | null;
  best_before_date: string | null;
  expires_at: string | null;
  source_type: string;
  public_label: string;
  coarse_location_label: string;
};

type ImportItem = GroceryItemDto & {
  receiptLineItemId: string;
};

type GroceryImportResponse = {
  ok: true;
  idempotent: boolean;
  receiptImport: {
    id: string;
    status: "applied";
    source: string;
    merchantName: string | null;
    purchaseDate: string | null;
  };
  items: ImportItem[];
  recompute: GroceryRecomputeNote;
};

type GroceryUpdateResponse = {
  ok: true;
  idempotent: boolean;
  item: GroceryItemDto;
  changedFields: string[];
  recompute: GroceryRecomputeNote;
};

export class GroceryRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GroceryRuntimeError";
    this.status = status;
  }
}

export function isGroceryRuntimeError(error: unknown): error is GroceryRuntimeError {
  return error instanceof GroceryRuntimeError;
}

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

async function execTx<Row extends QueryRow = QueryRow>(
  context: TransactionContext,
  sql: string,
  values: Record<string, SqlValue> = {},
) {
  return executeSql<Row>({
    sql,
    parameters: params(values),
    transactionId: context.transactionId,
    config: context.config,
    client: context.client,
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function jsonField(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function namespaceKey(scope: string, rawKey: string): string {
  const trimmed = rawKey.trim();
  return trimmed.startsWith(`${scope}:`) ? trimmed : `${scope}:${trimmed}`;
}

function autoIdempotencyKey(scope: string, context: DemoActorContext, input: unknown): string {
  return `${scope}:auto:${requestHash({
    householdId: context.household.id,
    input,
  })}`;
}

function endOfDateIso(date: string | null | undefined): string | null {
  if (!date) {
    return null;
  }

  return `${date}T23:59:59.000Z`;
}

function recomputePlaceholder(affectedItemIds: string[]): GroceryRecomputeNote {
  return {
    invoked: false,
    contract: "checkpoint-2-lane-2b",
    note:
      "Action-card and match recompute is owned by Lane 2B; this mutation returned affected item ids for that contract.",
    affectedItemIds,
  };
}

function dtoFromItemRow(row: ItemRow, context: DemoActorContext): GroceryItemDto {
  return {
    id: row.id,
    title: row.title,
    quantity: row.quantity,
    unit: row.unit,
    itemState: row.item_state,
    storageState: row.storage_state,
    safetyStatus: row.safety_status,
    useByDate: row.use_by_date,
    bestBeforeDate: row.best_before_date,
    expiresAt: row.expires_at,
    sourceType: row.source_type,
    household: {
      id: context.household.id,
      publicLabel: row.public_label,
      coarseLocationLabel: row.coarse_location_label,
    },
  };
}

async function beginIdempotentMutation(
  context: TransactionContext,
  key: string,
  scope: string,
  hash: string,
): Promise<unknown | null> {
  const existing = await execTx<IdempotencyRow>(
    context,
    `
      select status, request_hash, response_json
      from idempotency_keys
      where key = :key
      for update
    `,
    { key },
  );

  const row = existing.rows[0];
  if (!row) {
    await execTx(
      context,
      `
        insert into idempotency_keys (
          key, scope, request_hash, status, locked_at, expires_at,
          created_at, updated_at
        )
        values (
          :key, :scope, :requestHash, 'started', now(),
          now() + interval '24 hours', now(), now()
        )
      `,
      { key, scope, requestHash: hash },
    );
    return null;
  }

  if (row.request_hash !== hash) {
    throw new GroceryRuntimeError(
      409,
      "Idempotency key already exists for a different grocery request.",
    );
  }

  if (row.status === "completed" && row.response_json) {
    return jsonField(row.response_json);
  }

  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'started',
          locked_at = now(),
          expires_at = now() + interval '24 hours',
          updated_at = now()
      where key = :key
    `,
    { key },
  );

  return null;
}

async function completeIdempotentMutation(
  context: TransactionContext,
  key: string,
  response: unknown,
) {
  await execTx(
    context,
    `
      update idempotency_keys
      set status = 'completed',
          response_json = :response::jsonb,
          locked_at = null,
          updated_at = now()
      where key = :key
    `,
    { key, response: response as Record<string, unknown> },
  );
}

async function findOrCreateCatalogItem(
  context: TransactionContext,
  demoContext: DemoActorContext,
  input: {
    catalogItemId?: string | null;
    title: string;
    storageState: string;
    safetyStatus: string;
  },
): Promise<string> {
  if (input.catalogItemId) {
    const existing = await execTx<{ id: string }>(
      context,
      `
        select id::text as id
        from item_catalog
        where id = :catalogItemId::uuid
          and category = 'grocery'
          and deleted_at is null
        limit 1
      `,
      { catalogItemId: input.catalogItemId },
    );

    if (!existing.rows[0]) {
      throw new GroceryRuntimeError(400, "catalogItemId is not a grocery catalog item.");
    }

    return existing.rows[0].id;
  }

  const existing = await execTx<{ id: string }>(
    context,
    `
      select id::text as id
      from item_catalog
      where category = 'grocery'
        and lower(name) = lower(:title)
        and deleted_at is null
        and (demo_scope_id = :demoScope or demo_scope_id is null)
      order by demo_scope_id nulls last, created_at asc
      limit 1
    `,
    {
      title: input.title,
      demoScope: demoContext.demoScope,
    },
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const created = await execTx<{ id: string }>(
    context,
    `
      insert into item_catalog (
        category, name, default_storage_state, default_safety_status,
        metadata, demo_scope_id, is_demo
      )
      values (
        'grocery', :title, :storageState::storage_state,
        :safetyStatus::safety_status, :metadata::jsonb, :demoScope, true
      )
      returning id::text as id
    `,
    {
      title: input.title,
      storageState: input.storageState,
      safetyStatus: input.safetyStatus,
      metadata: {
        createdBy: "grocery_import",
      },
      demoScope: demoContext.demoScope,
    },
  );

  return created.rows[0].id;
}

export async function importGroceryItems(
  demoContext: DemoActorContext,
  input: GroceryImportInput,
): Promise<GroceryImportResponse> {
  const scope = "grocery.import";
  const key = input.idempotencyKey
    ? namespaceKey(scope, input.idempotencyKey)
    : autoIdempotencyKey(scope, demoContext, input);
  const hash = requestHash({ demoContext: demoContext.household.id, input });

  try {
    return await withTransaction(async (transaction) => {
      const existing = await beginIdempotentMutation(transaction, key, scope, hash);
      if (existing) {
        return {
          ...(existing as GroceryImportResponse),
          idempotent: true,
        };
      }

      const receipt = await execTx<{
        id: string;
        status: "applied";
        source: string;
        merchant_name: string | null;
        purchase_date: string | null;
      }>(
        transaction,
        `
          insert into receipt_imports (
            household_id, actor_user_id, neighbourhood_id, merchant_name,
            purchase_date, source, status, idempotency_key, raw_text,
            subtotal_cents, tax_cents, total_cents, currency, metadata,
            demo_scope_id, is_demo
          )
          values (
            :householdId::uuid, :userId::uuid, :neighbourhoodId::uuid,
            nullif(:merchantName, ''), nullif(:purchaseDate, '')::date,
            :source, 'applied', :idempotencyKey, nullif(:rawText, ''),
            :subtotalCents, :taxCents, :totalCents, :currency,
            :metadata::jsonb, :demoScope, true
          )
          returning
            id::text as id,
            status::text as status,
            source,
            merchant_name,
            purchase_date::text as purchase_date
        `,
        {
          householdId: demoContext.household.id,
          userId: demoContext.user.id,
          neighbourhoodId: demoContext.neighbourhood.id,
          merchantName: input.merchantName ?? "",
          purchaseDate: input.purchaseDate ?? "",
          source: input.source,
          idempotencyKey: key,
          rawText: input.rawText ?? "",
          subtotalCents: input.subtotalCents ?? null,
          taxCents: input.taxCents ?? null,
          totalCents: input.totalCents ?? null,
          currency: input.currency.toUpperCase(),
          metadata: {
            ...input.metadata,
            demoActor: "explicit_demo_context",
          },
          demoScope: demoContext.demoScope,
        },
      );

      const receiptRow = receipt.rows[0];
      const items: ImportItem[] = [];

      for (const [lineIndex, line] of input.lines.entries()) {
        const catalogItemId = await findOrCreateCatalogItem(transaction, demoContext, line);
        const useByDate = line.useByDate ?? null;
        const bestBeforeDate = line.bestBeforeDate ?? null;
        const expiresAt = endOfDateIso(useByDate ?? bestBeforeDate);

        const item = await execTx<ItemRow>(
          transaction,
          `
            insert into item_instances (
              catalog_item_id, owner_household_id, neighbourhood_id, category,
              title, quantity, unit, item_state, storage_state, safety_status,
              expires_at, use_by_date, best_before_date, location, source_type,
              source_ref, metadata, demo_scope_id, is_demo
            )
            values (
              :catalogItemId::uuid, :householdId::uuid, :neighbourhoodId::uuid,
              'grocery', :title, :quantity, :unit, 'private',
              :storageState::storage_state, :safetyStatus::safety_status,
              :expiresAt::timestamp with time zone,
              :useByDate::date, :bestBeforeDate::date,
              (select home_location from households where id = :householdId::uuid),
              :sourceType, :sourceRef, :metadata::jsonb, :demoScope, true
            )
            returning
              id::text as id,
              title,
              quantity::text as quantity,
              unit,
              item_state::text as item_state,
              storage_state::text as storage_state,
              safety_status::text as safety_status,
              use_by_date::text as use_by_date,
              best_before_date::text as best_before_date,
              expires_at::text as expires_at,
              source_type,
              :publicLabel as public_label,
              :coarseLocationLabel as coarse_location_label
          `,
          {
            catalogItemId,
            householdId: demoContext.household.id,
            neighbourhoodId: demoContext.neighbourhood.id,
            title: line.title,
            quantity: line.quantity,
            unit: line.unit,
            storageState: line.storageState,
            safetyStatus: line.safetyStatus,
            expiresAt,
            useByDate,
            bestBeforeDate,
            sourceType: input.source,
            sourceRef: receiptRow.id,
            metadata: {
              ...line.metadata,
              receiptImportId: receiptRow.id,
              lineIndex,
            },
            demoScope: demoContext.demoScope,
            publicLabel: demoContext.household.publicLabel,
            coarseLocationLabel: demoContext.household.coarseLocationLabel,
          },
        );

        const itemRow = item.rows[0];

        const receiptLine = await execTx<{ id: string }>(
          transaction,
          `
            insert into receipt_line_items (
              receipt_import_id, catalog_item_id, item_instance_id, line_index,
              raw_text, normalized_title, quantity, unit, price_cents,
              currency, metadata, demo_scope_id, is_demo
            )
            values (
              :receiptImportId::uuid, :catalogItemId::uuid, :itemInstanceId::uuid,
              :lineIndex, :rawText, :normalizedTitle, :quantity, :unit,
              :priceCents, :currency, :metadata::jsonb, :demoScope, true
            )
            returning id::text as id
          `,
          {
            receiptImportId: receiptRow.id,
            catalogItemId,
            itemInstanceId: itemRow.id,
            lineIndex,
            rawText: line.rawText ?? line.title,
            normalizedTitle: line.title,
            quantity: line.quantity,
            unit: line.unit,
            priceCents: line.priceCents ?? null,
            currency: input.currency.toUpperCase(),
            metadata: {
              source: input.source,
            },
            demoScope: demoContext.demoScope,
          },
        );

        await execTx(
          transaction,
          `
            insert into inventory_events (
              item_instance_id, actor_user_id, household_id, event_type,
              delta_quantity, to_state, metadata
            )
            values (
              :itemInstanceId::uuid, :userId::uuid, :householdId::uuid,
              'created', :quantity, 'private', :metadata::jsonb
            )
          `,
          {
            itemInstanceId: itemRow.id,
            userId: demoContext.user.id,
            householdId: demoContext.household.id,
            quantity: line.quantity,
            metadata: {
              receiptImportId: receiptRow.id,
              receiptLineItemId: receiptLine.rows[0].id,
              idempotencyKey: key,
            },
          },
        );

        if (useByDate || bestBeforeDate || line.labelRawText || line.note) {
          await execTx(
            transaction,
            `
              insert into expiry_observations (
                item_instance_id, household_id, observed_by_user_id,
                receipt_import_id, source, confidence, use_by_date,
                best_before_date, expires_at, raw_text, note, metadata,
                demo_scope_id, is_demo
              )
              values (
                :itemInstanceId::uuid, :householdId::uuid, :userId::uuid,
                :receiptImportId::uuid, :expirySource::expiry_observation_source,
                :confidence::expiry_confidence,
                :useByDate::date, :bestBeforeDate::date,
                :expiresAt::timestamp with time zone, nullif(:rawText, ''),
                nullif(:note, ''), :metadata::jsonb, :demoScope, true
              )
            `,
            {
              itemInstanceId: itemRow.id,
              householdId: demoContext.household.id,
              userId: demoContext.user.id,
              receiptImportId: receiptRow.id,
              expirySource: input.source,
              confidence: line.expiryConfidence,
              useByDate,
              bestBeforeDate,
              expiresAt,
              rawText: line.labelRawText ?? "",
              note: line.note ?? "",
              metadata: {
                source: input.source,
                receiptLineItemId: receiptLine.rows[0].id,
              },
              demoScope: demoContext.demoScope,
            },
          );
        }

        await execTx(
          transaction,
          `
            insert into audit_events (
              actor_user_id, actor_household_id, entity_type, entity_id,
              action, source, source_route, idempotency_key, after_state,
              metadata, demo_scope_id, is_demo
            )
            values (
              :userId::uuid, :householdId::uuid, 'item_instance',
              :itemInstanceId::uuid, 'grocery.item_created',
              'api', '/api/grocery/import', :idempotencyKey,
              :afterState::jsonb, :metadata::jsonb, :demoScope, true
            )
          `,
          {
            userId: demoContext.user.id,
            householdId: demoContext.household.id,
            itemInstanceId: itemRow.id,
            idempotencyKey: key,
            afterState: dtoFromItemRow(itemRow, demoContext),
            metadata: {
              receiptImportId: receiptRow.id,
              receiptLineItemId: receiptLine.rows[0].id,
            },
            demoScope: demoContext.demoScope,
          },
        );

        items.push({
          ...dtoFromItemRow(itemRow, demoContext),
          receiptLineItemId: receiptLine.rows[0].id,
        });
      }

      const response: GroceryImportResponse = {
        ok: true,
        idempotent: false,
        receiptImport: {
          id: receiptRow.id,
          status: "applied",
          source: receiptRow.source,
          merchantName: receiptRow.merchant_name,
          purchaseDate: receiptRow.purchase_date,
        },
        items,
        recompute: recomputePlaceholder(items.map((item) => item.id)),
      };

      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_user_id, actor_household_id, entity_type, entity_id,
            action, source, source_route, idempotency_key, after_state,
            metadata, demo_scope_id, is_demo
          )
          values (
            :userId::uuid, :householdId::uuid, 'receipt_import',
            :receiptImportId::uuid, 'grocery.receipt_imported',
            'api', '/api/grocery/import', :idempotencyKey,
            :afterState::jsonb, :metadata::jsonb, :demoScope, true
          )
        `,
        {
          userId: demoContext.user.id,
          householdId: demoContext.household.id,
          receiptImportId: receiptRow.id,
          idempotencyKey: key,
          afterState: response,
          metadata: {
            itemCount: items.length,
          },
          demoScope: demoContext.demoScope,
        },
      );

      await completeIdempotentMutation(transaction, key, response);
      return response;
    });
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      throw error;
    }

    throw new GroceryRuntimeError(503, publicErrorMessage(error));
  }
}

export async function listGroceryInventory(
  demoContext: DemoActorContext,
): Promise<{ ok: true; items: GroceryItemDto[]; recompute: GroceryRecomputeNote }> {
  try {
    const result = await executeSql<ItemRow>({
      sql: `
        select
          i.id::text as id,
          i.title,
          i.quantity::text as quantity,
          i.unit,
          i.item_state::text as item_state,
          i.storage_state::text as storage_state,
          i.safety_status::text as safety_status,
          i.use_by_date::text as use_by_date,
          i.best_before_date::text as best_before_date,
          i.expires_at::text as expires_at,
          i.source_type,
          h.public_label,
          h.coarse_location_label
        from item_instances i
        join households h on h.id = i.owner_household_id
        where i.owner_household_id = :householdId::uuid
          and i.category = 'grocery'
          and i.deleted_at is null
        order by i.expires_at asc nulls last, i.created_at desc
        limit 200
      `,
      parameters: params({
        householdId: demoContext.household.id,
      }),
    });

    const items = result.rows.map((row) => dtoFromItemRow(row, demoContext));
    return {
      ok: true,
      items,
      recompute: recomputePlaceholder(items.map((item) => item.id)),
    };
  } catch (error) {
    throw new GroceryRuntimeError(503, publicErrorMessage(error));
  }
}

function changedFieldNames(before: ItemRow, input: GroceryItemUpdateInput) {
  const changed: string[] = [];

  if (input.storageState && input.storageState !== before.storage_state) {
    changed.push("storageState");
  }
  if (input.itemState && input.itemState !== before.item_state) {
    changed.push("itemState");
  }
  if (input.safetyStatus && input.safetyStatus !== before.safety_status) {
    changed.push("safetyStatus");
  }
  if (input.quantity !== undefined && String(input.quantity) !== before.quantity) {
    changed.push("quantity");
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "useByDate") &&
    (input.useByDate ?? null) !== before.use_by_date
  ) {
    changed.push("useByDate");
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "bestBeforeDate") &&
    (input.bestBeforeDate ?? null) !== before.best_before_date
  ) {
    changed.push("bestBeforeDate");
  }
  if (input.labelRawText || input.note) {
    changed.push("expiryObservation");
  }

  return changed;
}

export async function updateGroceryItem(
  demoContext: DemoActorContext,
  itemId: string,
  input: GroceryItemUpdateInput,
): Promise<GroceryUpdateResponse> {
  const scope = "grocery.item-update";
  const key = input.idempotencyKey
    ? namespaceKey(scope, input.idempotencyKey)
    : autoIdempotencyKey(scope, demoContext, { itemId, input });
  const hash = requestHash({ itemId, householdId: demoContext.household.id, input });

  try {
    return await withTransaction(async (transaction) => {
      const existing = await beginIdempotentMutation(transaction, key, scope, hash);
      if (existing) {
        return {
          ...(existing as GroceryUpdateResponse),
          idempotent: true,
        };
      }

      const beforeResult = await execTx<ItemRow>(
        transaction,
        `
          select
            i.id::text as id,
            i.title,
            i.quantity::text as quantity,
            i.unit,
            i.item_state::text as item_state,
            i.storage_state::text as storage_state,
            i.safety_status::text as safety_status,
            i.use_by_date::text as use_by_date,
            i.best_before_date::text as best_before_date,
            i.expires_at::text as expires_at,
            i.source_type,
            h.public_label,
            h.coarse_location_label
          from item_instances i
          join households h on h.id = i.owner_household_id
          where i.id = :itemId::uuid
            and i.owner_household_id = :householdId::uuid
            and i.category = 'grocery'
            and i.deleted_at is null
          for update
        `,
        {
          itemId,
          householdId: demoContext.household.id,
        },
      );

      const before = beforeResult.rows[0];
      if (!before) {
        throw new GroceryRuntimeError(404, "Grocery item not found for this demo household.");
      }

      const hasUseByDate = Object.prototype.hasOwnProperty.call(input, "useByDate");
      const hasBestBeforeDate = Object.prototype.hasOwnProperty.call(input, "bestBeforeDate");
      const nextUseByDate = hasUseByDate ? input.useByDate ?? null : before.use_by_date;
      const nextBestBeforeDate = hasBestBeforeDate
        ? input.bestBeforeDate ?? null
        : before.best_before_date;
      const nextExpiresAt = endOfDateIso(nextUseByDate ?? nextBestBeforeDate);
      const changedFields = changedFieldNames(before, input);

      const updated = await execTx<ItemRow>(
        transaction,
        `
          update item_instances
          set storage_state = case
                when :hasStorageState then :storageState::storage_state
                else storage_state
              end,
              item_state = case
                when :hasItemState then :itemState::item_state
                else item_state
              end,
              safety_status = case
                when :hasSafetyStatus then :safetyStatus::safety_status
                else safety_status
              end,
              quantity = case
                when :hasQuantity then :quantity
                else quantity
              end,
              use_by_date = case
                when :hasUseByDate then :useByDate::date
                else use_by_date
              end,
              best_before_date = case
                when :hasBestBeforeDate then :bestBeforeDate::date
                else best_before_date
              end,
              expires_at = case
                when :hasUseByDate or :hasBestBeforeDate
                then :expiresAt::timestamp with time zone
                else expires_at
              end,
              metadata = metadata || :metadata::jsonb,
              updated_at = now()
          where id = :itemId::uuid
          returning
            id::text as id,
            title,
            quantity::text as quantity,
            unit,
            item_state::text as item_state,
            storage_state::text as storage_state,
            safety_status::text as safety_status,
            use_by_date::text as use_by_date,
            best_before_date::text as best_before_date,
            expires_at::text as expires_at,
            source_type,
            :publicLabel as public_label,
            :coarseLocationLabel as coarse_location_label
        `,
        {
          itemId,
          hasStorageState: Boolean(input.storageState),
          storageState: input.storageState ?? before.storage_state,
          hasItemState: Boolean(input.itemState),
          itemState: input.itemState ?? before.item_state,
          hasSafetyStatus: Boolean(input.safetyStatus),
          safetyStatus: input.safetyStatus ?? before.safety_status,
          hasQuantity: input.quantity !== undefined,
          quantity: input.quantity ?? Number(before.quantity),
          hasUseByDate,
          useByDate: nextUseByDate,
          hasBestBeforeDate,
          bestBeforeDate: nextBestBeforeDate,
          expiresAt: nextExpiresAt,
          metadata: {
            ...input.metadata,
            lastGroceryUpdateAt: new Date().toISOString(),
          },
          publicLabel: demoContext.household.publicLabel,
          coarseLocationLabel: demoContext.household.coarseLocationLabel,
        },
      );

      const item = dtoFromItemRow(updated.rows[0], demoContext);

      if (hasUseByDate || hasBestBeforeDate || input.labelRawText || input.note) {
        await execTx(
          transaction,
          `
            insert into expiry_observations (
              item_instance_id, household_id, observed_by_user_id,
              source, confidence, use_by_date, best_before_date,
              expires_at, raw_text, note, metadata, demo_scope_id, is_demo
            )
            values (
              :itemId::uuid, :householdId::uuid, :userId::uuid,
              :source::expiry_observation_source, :confidence::expiry_confidence,
              :useByDate::date, :bestBeforeDate::date,
              :expiresAt::timestamp with time zone, nullif(:rawText, ''),
              nullif(:note, ''), :metadata::jsonb, :demoScope, true
            )
          `,
          {
            itemId,
            householdId: demoContext.household.id,
            userId: demoContext.user.id,
            source: input.expirySource,
            confidence: input.expiryConfidence,
            useByDate: nextUseByDate,
            bestBeforeDate: nextBestBeforeDate,
            expiresAt: nextExpiresAt,
            rawText: input.labelRawText ?? "",
            note: input.note ?? "",
            metadata: input.metadata,
            demoScope: demoContext.demoScope,
          },
        );
      }

      await execTx(
        transaction,
        `
          insert into inventory_events (
            item_instance_id, actor_user_id, household_id, event_type,
            delta_quantity, from_state, to_state, metadata
          )
          values (
            :itemId::uuid, :userId::uuid, :householdId::uuid,
            :eventType::inventory_event_type, :deltaQuantity,
            :fromState::item_state, :toState::item_state, :metadata::jsonb
          )
        `,
        {
          itemId,
          userId: demoContext.user.id,
          householdId: demoContext.household.id,
          eventType: input.itemState && input.itemState !== before.item_state
            ? "state_changed"
            : input.quantity !== undefined && String(input.quantity) !== before.quantity
              ? "quantity_adjusted"
              : "observed",
          deltaQuantity: input.quantity !== undefined
            ? input.quantity - Number(before.quantity)
            : null,
          fromState: before.item_state,
          toState: item.itemState,
          metadata: {
            changedFields,
            idempotencyKey: key,
          },
        },
      );

      const response: GroceryUpdateResponse = {
        ok: true,
        idempotent: false,
        item,
        changedFields,
        recompute: recomputePlaceholder([item.id]),
      };

      await execTx(
        transaction,
        `
          insert into audit_events (
            actor_user_id, actor_household_id, entity_type, entity_id,
            action, source, source_route, idempotency_key, before_state,
            after_state, metadata, demo_scope_id, is_demo
          )
          values (
            :userId::uuid, :householdId::uuid, 'item_instance',
            :itemId::uuid, 'grocery.item_updated', 'api',
            '/api/grocery/items/[itemId]', :idempotencyKey,
            :beforeState::jsonb, :afterState::jsonb, :metadata::jsonb,
            :demoScope, true
          )
        `,
        {
          userId: demoContext.user.id,
          householdId: demoContext.household.id,
          itemId,
          idempotencyKey: key,
          beforeState: dtoFromItemRow(before, demoContext),
          afterState: response,
          metadata: {
            changedFields,
          },
          demoScope: demoContext.demoScope,
        },
      );

      await completeIdempotentMutation(transaction, key, response);
      return response;
    });
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      throw error;
    }

    throw new GroceryRuntimeError(503, publicErrorMessage(error));
  }
}
