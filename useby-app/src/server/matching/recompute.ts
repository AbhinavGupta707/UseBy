import { ACTION_ENGINE_ID, type RecomputeScope } from "../actions/recompute";
import {
  getTableAvailability,
  publicErrorMessage,
  type TableAvailability,
} from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type SqlValue,
  type TransactionContext,
  withTransaction,
} from "../db/sql";

export type RecomputeMatchesResult = {
  status: "succeeded" | "failed";
  generated: number;
  deleted: number;
  reason?: string;
};

export type GroceryMatchDto = {
  id: string;
  status: string;
  score: number;
  distanceMeters: number;
  rationale: string;
  need: {
    id: string;
    title: string;
    quantity: number;
    unit: string;
    neededBy: string | null;
    requesterHouseholdId: string;
    requesterCoarseLocation: string | null;
  };
  item: {
    id: string;
    title: string;
    quantity: number;
    unit: string;
    safetyStatus: string;
    storageState: string;
    itemState: string;
    ownerHouseholdId: string;
    ownerCoarseLocation: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export type GroceryMatchesResponse =
  | {
      status: "available";
      matches: GroceryMatchDto[];
      count: number;
    }
  | {
      status: "unavailable";
      matches: [];
      count: 0;
      reason: string;
    };

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function expiryObservationSql(availability: TableAvailability) {
  const hasTable = availability.exists && availability.columns.has("item_instance_id");
  if (!hasTable) {
    return {
      joinSql: "",
      expiryDateSql: "coalesce(i.expires_at::date, i.use_by_date, i.best_before_date)",
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
    expiryDateSql:
      "coalesce(latest_expiry.expires_at::date, latest_expiry.use_by_date, latest_expiry.best_before_date, i.expires_at::date, i.use_by_date, i.best_before_date)",
  };
}

async function execTx(
  context: TransactionContext,
  sql: string,
  parameters: ReturnType<typeof sqlParam>[] = [],
) {
  return executeSql({
    sql,
    parameters,
    transactionId: context.transactionId,
    config: context.config,
    client: context.client,
  });
}

export async function recomputeGroceryMatches(
  scope: RecomputeScope = {},
): Promise<RecomputeMatchesResult> {
  try {
    const expiryAvailability = await getTableAvailability("expiry_observations");
    const expiry = expiryObservationSql(expiryAvailability);

    return await withTransaction(async (context) => {
      const deleteResult = await execTx(
        context,
        `
          delete from matches
          where metadata->>'engine' = :engine
            and (:neighbourhoodId = '' or neighbourhood_id = :neighbourhoodId::uuid)
            and (
              :householdId = ''
              or requester_household_id = :householdId::uuid
              or owner_household_id = :householdId::uuid
            )
        `,
        params({
          engine: ACTION_ENGINE_ID,
          neighbourhoodId: scope.neighbourhoodId ?? "",
          householdId: scope.householdId ?? "",
        }),
      );

      const insertResult = await execTx(
        context,
        `
          with eligible_items as (
            select
              i.id,
              i.owner_household_id,
              i.neighbourhood_id,
              i.title,
              i.quantity,
              i.unit,
              coalesce(i.location, owner.home_location) as match_location
            from item_instances i
            join households owner on owner.id = i.owner_household_id
            ${expiry.joinSql}
            where i.category = 'grocery'
              and i.quantity > 0
              and i.owner_household_id is not null
              and i.safety_status = 'eligible'
              and i.storage_state in ('sealed', 'cupboard', 'fridge', 'freezer')
              and i.storage_state not in ('opened', 'cooked')
              and i.item_state not in (
                'reserved',
                'picked_up',
                'handed_off',
                'returned',
                'completed',
                'consumed',
                'expired',
                'cancelled',
                'disputed'
              )
              and (
                ${expiry.expiryDateSql} is null
                or ${expiry.expiryDateSql} >= current_date
              )
              and (:neighbourhoodId = '' or i.neighbourhood_id = :neighbourhoodId::uuid)
              and (:householdId = '' or i.owner_household_id = :householdId::uuid)
          ),
          candidate_matches as (
            select
              n.id as need_id,
              e.id as item_instance_id,
              n.neighbourhood_id,
              n.household_id as requester_household_id,
              e.owner_household_id,
              n.title as need_title,
              e.title as item_title,
              n.quantity as need_quantity,
              e.quantity as item_quantity,
              n.needed_by,
              ST_Distance(n.location, e.match_location) as distance_meters,
              greatest(
                similarity(lower(n.title), lower(e.title)),
                case
                  when lower(n.title) like '%' || lower(e.title) || '%'
                    or lower(e.title) like '%' || lower(n.title) || '%'
                    then 0.85
                  else 0
                end
              ) as text_similarity
            from needs n
            join neighbourhoods nb on nb.id = n.neighbourhood_id
            join eligible_items e on e.neighbourhood_id = n.neighbourhood_id
            where n.category = 'grocery'
              and n.status = 'open'
              and n.household_id <> e.owner_household_id
              and (:neighbourhoodId = '' or n.neighbourhood_id = :neighbourhoodId::uuid)
              and (:householdId = '' or n.household_id = :householdId::uuid)
              and ST_DWithin(
                n.location,
                e.match_location,
                coalesce(nullif(n.metadata->>'radiusMeters', '')::int, nb.service_radius_meters, 1500)
              )
          ),
          scored as (
            select
              *,
              round(
                (
                  least(greatest(text_similarity, 0), 1) * 45
                  + greatest(0, least(1, 1 - (distance_meters / 1500.0))) * 25
                  + case
                      when item_quantity >= need_quantity then 12
                      else greatest(0, least(1, item_quantity / nullif(need_quantity, 0))) * 12
                    end
                  + case
                      when needed_by is null then 6
                      when needed_by <= now() + interval '6 hours' then 18
                      when needed_by <= now() + interval '24 hours' then 14
                      when needed_by <= now() + interval '72 hours' then 10
                      else 6
                    end
                )::numeric,
                1
              ) as score,
              row_number() over (
                partition by need_id
                order by
                  (
                    least(greatest(text_similarity, 0), 1) * 45
                    + greatest(0, least(1, 1 - (distance_meters / 1500.0))) * 25
                    + case
                        when item_quantity >= need_quantity then 12
                        else greatest(0, least(1, item_quantity / nullif(need_quantity, 0))) * 12
                      end
                  ) desc,
                  distance_meters asc
              ) as rank_for_need
            from candidate_matches
            where text_similarity >= 0.12
          )
          insert into matches (
            id,
            need_id,
            item_instance_id,
            neighbourhood_id,
            requester_household_id,
            owner_household_id,
            status,
            distance_meters,
            score,
            rationale,
            metadata,
            recompute_key,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            need_id,
            item_instance_id,
            neighbourhood_id,
            requester_household_id,
            owner_household_id,
            'proposed',
            distance_meters,
            score,
            jsonb_build_object(
              'explanation',
              item_title || ' matches "' || need_title || '" within '
                || round(distance_meters)::text
                || 'm. Package-safe grocery filters passed; exact coordinates are not exposed.',
              'privacy',
              'coarse_locations_only',
              'safetyRule',
              'eligible sealed/package-safe grocery only'
            ),
            jsonb_build_object(
              'engine', :engine,
              'textSimilarity', text_similarity,
              'rankForNeed', rank_for_need,
              'privacy', 'coarse_locations_only',
              'safetyRule', 'eligible sealed/package-safe grocery only'
            ),
            :engine || ':match:' || need_id::text || ':' || item_instance_id::text,
            now(),
            now()
          from scored
          where rank_for_need <= 5
          returning id
        `,
        params({
          engine: ACTION_ENGINE_ID,
          neighbourhoodId: scope.neighbourhoodId ?? "",
          householdId: scope.householdId ?? "",
        }),
      );

      return {
        status: "succeeded",
        generated: insertResult.rows.length,
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

export async function listGroceryMatches(
  scope: RecomputeScope = {},
): Promise<GroceryMatchesResponse> {
  try {
    const result = await executeSql<{
      id: string;
      status: string;
      score: string | number;
      distance_meters: string | number;
      rationale: string;
      need_id: string;
      need_title: string;
      need_quantity: string;
      need_unit: string;
      needed_by: string | null;
      requester_household_id: string;
      requester_coarse_location: string | null;
      item_instance_id: string;
      item_title: string;
      item_quantity: string;
      item_unit: string;
      item_safety_status: string;
      item_storage_state: string;
      item_state: string;
      owner_household_id: string;
      owner_coarse_location: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>({
      sql: `
        select
          m.id::text as id,
          m.status::text as status,
          m.score::text as score,
          m.distance_meters::text as distance_meters,
          coalesce(m.rationale->>'explanation', m.rationale::text) as rationale,
          n.id::text as need_id,
          n.title as need_title,
          n.quantity::text as need_quantity,
          n.unit as need_unit,
          n.needed_by::text as needed_by,
          requester.id::text as requester_household_id,
          requester.coarse_location_label as requester_coarse_location,
          i.id::text as item_instance_id,
          i.title as item_title,
          i.quantity::text as item_quantity,
          i.unit as item_unit,
          i.safety_status::text as item_safety_status,
          i.storage_state::text as item_storage_state,
          i.item_state::text as item_state,
          owner.id::text as owner_household_id,
          owner.coarse_location_label as owner_coarse_location,
          m.created_at::text as created_at,
          m.updated_at::text as updated_at
        from matches m
        join needs n on n.id = m.need_id
        join households requester on requester.id = m.requester_household_id
        join item_instances i on i.id = m.item_instance_id
        join households owner on owner.id = m.owner_household_id
        where m.status in ('proposed', 'active')
          and n.category = 'grocery'
          and (:neighbourhoodId = '' or m.neighbourhood_id = :neighbourhoodId::uuid)
          and (
            :householdId = ''
            or m.requester_household_id = :householdId::uuid
            or m.owner_household_id = :householdId::uuid
          )
        order by m.score desc, m.distance_meters asc, m.created_at desc
        limit 50
      `,
      parameters: params({
        neighbourhoodId: scope.neighbourhoodId ?? "",
        householdId: scope.householdId ?? "",
      }),
    });

    const matches = result.rows.map<GroceryMatchDto>((row) => ({
      id: row.id,
      status: row.status,
      score: Number(row.score),
      distanceMeters: Number(row.distance_meters),
      rationale: row.rationale,
      need: {
        id: row.need_id,
        title: row.need_title,
        quantity: Number(row.need_quantity),
        unit: row.need_unit,
        neededBy: row.needed_by,
        requesterHouseholdId: row.requester_household_id,
        requesterCoarseLocation: row.requester_coarse_location,
      },
      item: {
        id: row.item_instance_id,
        title: row.item_title,
        quantity: Number(row.item_quantity),
        unit: row.item_unit,
        safetyStatus: row.item_safety_status,
        storageState: row.item_storage_state,
        itemState: row.item_state,
        ownerHouseholdId: row.owner_household_id,
        ownerCoarseLocation: row.owner_coarse_location,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      status: "available",
      matches,
      count: matches.length,
    };
  } catch (error) {
    return {
      status: "unavailable",
      matches: [],
      count: 0,
      reason: publicErrorMessage(error),
    };
  }
}
