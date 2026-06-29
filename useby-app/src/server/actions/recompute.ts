import {
  getTableAvailability,
  publicErrorMessage,
  type TableAvailability,
} from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";
import { actionCardsForItem, type GroceryItemForRules } from "./rules";

export const ACTION_ENGINE_ID = "useby-cp2-action-engine";

export type RecomputeScope = {
  neighbourhoodId?: string | null;
  householdId?: string | null;
};

export type RecomputeActionCardsResult = {
  status: "succeeded" | "failed";
  generated: number;
  deleted: number;
  reason?: string;
};

export type ActionCardDto = {
  id: string;
  type: string;
  status: string;
  priority: number;
  title: string;
  body: string;
  rationale: string;
  item: {
    id: string | null;
    title: string | null;
    quantity: number | null;
    unit: string | null;
    expiryBand: string | null;
    shareEligible: boolean | null;
  };
  neighbourhoodId: string | null;
  householdId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ActionCardsResponse =
  | {
      status: "available";
      cards: ActionCardDto[];
      count: number;
    }
  | {
      status: "unavailable";
      cards: [];
      count: 0;
      reason: string;
    };

type ItemRow = {
  id: string;
  owner_household_id: string | null;
  neighbourhood_id: string;
  category: string;
  title: string;
  quantity: number | string;
  unit: string;
  item_state: string;
  storage_state: string | null;
  safety_status: string | null;
  expires_at: string | null;
  use_by_date: string | null;
  best_before_date: string | null;
  metadata: string | Record<string, unknown> | null;
};

type ExpiryObservationProjection = {
  joinSql: string;
  expiresAtSql: string;
  useByDateSql: string;
  bestBeforeDateSql: string;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function safeJson(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toRuleItem(row: ItemRow): GroceryItemForRules {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    quantity: Number(row.quantity),
    itemState: row.item_state,
    storageState: row.storage_state,
    safetyStatus: row.safety_status,
    expiresAt: row.expires_at,
    useByDate: row.use_by_date,
    bestBeforeDate: row.best_before_date,
    metadata: safeJson(row.metadata),
  };
}

function expiryObservationProjection(
  availability: TableAvailability,
): ExpiryObservationProjection {
  const hasTable = availability.exists && availability.columns.has("item_instance_id");
  if (!hasTable) {
    return {
      joinSql: "",
      expiresAtSql: "i.expires_at",
      useByDateSql: "i.use_by_date",
      bestBeforeDateSql: "i.best_before_date",
    };
  }

  const expiresAt = availability.columns.has("expires_at")
    ? "eo.expires_at"
    : "null::timestamp with time zone";
  const useByDate = availability.columns.has("use_by_date")
    ? "eo.use_by_date"
    : "null::date";
  const bestBeforeDate = availability.columns.has("best_before_date")
    ? "eo.best_before_date"
    : "null::date";
  const orderBy = availability.columns.has("observed_at")
    ? "eo.observed_at desc nulls last"
    : "eo.item_instance_id";

  return {
    joinSql: `
      left join lateral (
        select
          ${expiresAt} as expires_at,
          ${useByDate} as use_by_date,
          ${bestBeforeDate} as best_before_date
        from expiry_observations eo
        where eo.item_instance_id = i.id
        order by ${orderBy}
        limit 1
      ) latest_expiry on true
    `,
    expiresAtSql: "coalesce(latest_expiry.expires_at, i.expires_at)",
    useByDateSql: "coalesce(latest_expiry.use_by_date, i.use_by_date)",
    bestBeforeDateSql:
      "coalesce(latest_expiry.best_before_date, i.best_before_date)",
  };
}

async function execTx<Row extends QueryRow = QueryRow>(
  context: TransactionContext,
  sql: string,
  parameters: ReturnType<typeof sqlParam>[] = [],
) {
  return executeSql<Row>({
    sql,
    parameters,
    transactionId: context.transactionId,
    config: context.config,
    client: context.client,
  });
}

async function loadGroceryItems(
  context: TransactionContext,
  scope: RecomputeScope,
  expiryProjection: ExpiryObservationProjection,
): Promise<ItemRow[]> {
  const result = await execTx<ItemRow>(
    context,
    `
      select
        i.id::text as id,
        i.owner_household_id::text as owner_household_id,
        i.neighbourhood_id::text as neighbourhood_id,
        i.category::text as category,
        i.title,
        i.quantity::text as quantity,
        i.unit,
        i.item_state::text as item_state,
        i.storage_state::text as storage_state,
        i.safety_status::text as safety_status,
        ${expiryProjection.expiresAtSql}::text as expires_at,
        ${expiryProjection.useByDateSql}::text as use_by_date,
        ${expiryProjection.bestBeforeDateSql}::text as best_before_date,
        i.metadata::text as metadata
      from item_instances i
      ${expiryProjection.joinSql}
      where i.category = 'grocery'
        and i.quantity > 0
        and (:neighbourhoodId = '' or i.neighbourhood_id = :neighbourhoodId::uuid)
        and (:householdId = '' or i.owner_household_id = :householdId::uuid)
      order by i.title asc
    `,
    params({
      neighbourhoodId: scope.neighbourhoodId ?? "",
      householdId: scope.householdId ?? "",
    }),
  );

  return result.rows;
}

export async function recomputeActionCards(
  scope: RecomputeScope = {},
): Promise<RecomputeActionCardsResult> {
  try {
    const expiryAvailability = await getTableAvailability("expiry_observations");
    const expiryProjection = expiryObservationProjection(expiryAvailability);

    return await withTransaction(async (context) => {
      const deleteResult = await execTx(
        context,
        `
          delete from action_cards
          where metadata->>'engine' = :engine
            and (:neighbourhoodId = '' or neighbourhood_id = :neighbourhoodId::uuid)
            and (:householdId = '' or household_id = :householdId::uuid)
        `,
        params({
          engine: ACTION_ENGINE_ID,
          neighbourhoodId: scope.neighbourhoodId ?? "",
          householdId: scope.householdId ?? "",
        }),
      );

      const rows = await loadGroceryItems(context, scope, expiryProjection);
      let generated = 0;
      const now = new Date();

      for (const row of rows) {
        if (!row.owner_household_id) {
          continue;
        }

        const item = toRuleItem(row);
        const cards = actionCardsForItem(item, now);

        for (const card of cards) {
          const idempotencyKey = [
            ACTION_ENGINE_ID,
            "action-card",
            row.id,
            card.type,
          ].join(":");

          await execTx(
            context,
            `
              insert into action_cards (
                id,
                household_id,
                item_instance_id,
                neighbourhood_id,
                card_type,
                status,
                priority,
                title,
                body,
                rationale,
                metadata,
                idempotency_key,
                created_at,
                updated_at
              )
              values (
                gen_random_uuid(),
                :householdId::uuid,
                :itemInstanceId::uuid,
                :neighbourhoodId::uuid,
                :cardType,
                'active',
                :priority,
                :title,
                :body,
                :rationale,
                :metadata::jsonb,
                :idempotencyKey,
                now(),
                now()
              )
            `,
            params({
              householdId: row.owner_household_id,
              itemInstanceId: row.id,
              neighbourhoodId: row.neighbourhood_id,
              cardType: card.type,
              priority: card.priority,
              title: card.title,
              body: card.body,
              rationale: card.rationale,
              metadata: {
                ...card.metadata,
                engine: ACTION_ENGINE_ID,
                itemTitle: row.title,
                itemUnit: row.unit,
                itemQuantity: Number(row.quantity),
                recomputedAt: now.toISOString(),
              },
              idempotencyKey,
            }),
          );
          generated += 1;
        }
      }

      return {
        status: "succeeded",
        generated,
        deleted: deleteResult.recordsUpdated,
      };
    });
  } catch (error) {
    return {
      status: "failed",
      generated: 0,
      deleted: 0,
      reason: publicErrorMessage(error),
    };
  }
}

export async function listActionCards(
  scope: RecomputeScope = {},
): Promise<ActionCardsResponse> {
  try {
    const result = await executeSql<{
      id: string;
      card_type: string;
      status: string;
      priority: number;
      title: string;
      body: string;
      rationale: string;
      item_instance_id: string | null;
      item_title: string | null;
      item_quantity: string | null;
      item_unit: string | null;
      neighbourhood_id: string | null;
      household_id: string | null;
      created_at: string | null;
      updated_at: string | null;
      metadata: string | null;
    }>({
      sql: `
        select
          c.id::text as id,
          c.card_type::text as card_type,
          c.status::text as status,
          c.priority::int as priority,
          c.title,
          c.body,
          c.rationale,
          c.item_instance_id::text as item_instance_id,
          i.title as item_title,
          i.quantity::text as item_quantity,
          i.unit as item_unit,
          c.neighbourhood_id::text as neighbourhood_id,
          c.household_id::text as household_id,
          c.created_at::text as created_at,
          c.updated_at::text as updated_at,
          c.metadata::text as metadata
        from action_cards c
        left join item_instances i on i.id = c.item_instance_id
        where c.status = 'active'
          and (:neighbourhoodId = '' or c.neighbourhood_id = :neighbourhoodId::uuid)
          and (:householdId = '' or c.household_id = :householdId::uuid)
        order by c.priority desc, c.updated_at desc, c.created_at desc
        limit 50
      `,
      parameters: params({
        neighbourhoodId: scope.neighbourhoodId ?? "",
        householdId: scope.householdId ?? "",
      }),
    });

    const cards = result.rows.map<ActionCardDto>((row) => {
      const metadata = safeJson(row.metadata);

      return {
        id: row.id,
        type: row.card_type,
        status: row.status,
        priority: Number(row.priority),
        title: row.title,
        body: row.body,
        rationale: row.rationale,
        item: {
          id: row.item_instance_id,
          title: row.item_title,
          quantity:
            row.item_quantity === null ? null : Number(row.item_quantity),
          unit: row.item_unit,
          expiryBand:
            typeof metadata.expiryBand === "string" ? metadata.expiryBand : null,
          shareEligible:
            typeof metadata.shareEligible === "boolean"
              ? metadata.shareEligible
              : null,
        },
        neighbourhoodId: row.neighbourhood_id,
        householdId: row.household_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return {
      status: "available",
      cards,
      count: cards.length,
    };
  } catch (error) {
    return {
      status: "unavailable",
      cards: [],
      count: 0,
      reason: publicErrorMessage(error),
    };
  }
}
