import { createHash } from "node:crypto";

import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import { distanceBandMeters } from "../locations/privacy";
import type { MerchantActorContext } from "../merchant/context";
import {
  CP7_HEATMAP_TABLE_CONTRACTS,
  checkTableContracts,
  unavailableStoreDropReason,
} from "../store-drops/contracts";
import {
  MerchantRuntimeError,
  publicMerchantLocation,
  type MerchantRuntimeStatus,
} from "../merchant/runtime";

const DEFAULT_GRID_DEGREES = 0.01;
const MIN_HOUSEHOLDS_PER_CELL = 2;

type HeatmapRow = {
  cell_key: string;
  neighbourhood_id: string;
  category: string;
  need_count: number;
  need_quantity: string;
  published_drop_count: number;
  published_drop_quantity: string;
  active_reservation_count: number;
  active_reservation_quantity: string;
  distinct_households: number;
  nearest_merchant_distance_meters: number | null;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function numberFrom(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicCellKey(raw: string) {
  return `cell_${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

async function ensureHeatmapAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new MerchantRuntimeError(
      503,
      `Aurora env missing: ${env.missing.join(", ")}`,
    );
  }

  const contracts = await checkTableContracts(CP7_HEATMAP_TABLE_CONTRACTS);
  if (!contracts.available) {
    throw new MerchantRuntimeError(503, unavailableStoreDropReason(contracts));
  }
}

export function heatmapPrivacyKeys() {
  return [
    "cellId",
    "category",
    "needCount",
    "publishedDropCount",
    "activeReservationCount",
    "distinctHouseholds",
    "nearestMerchantDistanceBandMeters",
  ];
}

function heatmapCellDto(row: HeatmapRow) {
  return {
    cellId: publicCellKey(`${row.neighbourhood_id}:${row.cell_key}`),
    neighbourhoodId: row.neighbourhood_id,
    category: row.category,
    needCount: row.need_count,
    needQuantity: numberFrom(row.need_quantity),
    publishedDropCount: row.published_drop_count,
    publishedDropQuantity: numberFrom(row.published_drop_quantity),
    activeReservationCount: row.active_reservation_count,
    activeReservationQuantity: numberFrom(row.active_reservation_quantity),
    distinctHouseholds: row.distinct_households,
    nearestMerchantDistanceBandMeters: distanceBandMeters(
      row.nearest_merchant_distance_meters,
    ),
  };
}

export async function getMerchantHeatmap(context: MerchantActorContext) {
  await ensureHeatmapAvailable();

  try {
    const result = await executeSql<HeatmapRow>({
      sql: `
        with merchant_scope as (
          select
            ml.id,
            ml.neighbourhood_id,
            ml.location,
            coalesce(n.service_radius_meters, 1500) as service_radius_meters
          from merchant_locations ml
          left join neighbourhoods n on n.id = ml.neighbourhood_id
          where ml.merchant_id = :merchantId::uuid
            and ml.is_active = true
            and ml.deleted_at is null
        ),
        demand_points as (
          select
            n.neighbourhood_id,
            n.category::text as category,
            n.quantity,
            n.household_id,
            n.location
          from needs n
          join merchant_scope ms
            on ms.neighbourhood_id = n.neighbourhood_id
            and ST_DWithin(ms.location, n.location, ms.service_radius_meters)
          where n.status = 'open'
            and n.deleted_at is null
        ),
        drop_points as (
          select
            d.neighbourhood_id,
            coalesce(d.metadata->>'category', 'surplus') as category,
            d.quantity_total as quantity,
            null::uuid as household_id,
            ml.location
          from store_drops d
          join merchant_locations ml on ml.id = d.merchant_location_id
          join merchant_scope ms
            on ms.neighbourhood_id = d.neighbourhood_id
            and ST_DWithin(ms.location, ml.location, ms.service_radius_meters)
          where d.status = 'published'
            and d.deleted_at is null
        ),
        reservation_points as (
          select
            d.neighbourhood_id,
            coalesce(d.metadata->>'category', 'surplus') as category,
            r.quantity,
            r.household_id,
            h.home_location as location
          from store_drop_reservations r
          join store_drops d on d.id = r.store_drop_id
          join households h on h.id = r.household_id
          join merchant_scope ms
            on ms.neighbourhood_id = d.neighbourhood_id
            and ST_DWithin(ms.location, h.home_location, ms.service_radius_meters)
          where r.status = 'active'
            and d.deleted_at is null
            and h.deleted_at is null
        ),
        events as (
          select
            'need' as source,
            neighbourhood_id,
            category,
            quantity,
            household_id,
            location
          from demand_points
          union all
          select
            'drop' as source,
            neighbourhood_id,
            category,
            quantity,
            household_id,
            location
          from drop_points
          union all
          select
            'reservation' as source,
            neighbourhood_id,
            category,
            quantity,
            household_id,
            location
          from reservation_points
        ),
        bucketed as (
          select
            md5(ST_AsText(ST_SnapToGrid(location::geometry, :gridDegrees))) as cell_key,
            neighbourhood_id,
            category,
            source,
            quantity,
            household_id,
            location
          from events
        )
        select
          b.cell_key,
          b.neighbourhood_id::text,
          b.category,
          count(*) filter (where b.source = 'need')::int as need_count,
          coalesce(sum(b.quantity) filter (where b.source = 'need'), 0)::text as need_quantity,
          count(*) filter (where b.source = 'drop')::int as published_drop_count,
          coalesce(sum(b.quantity) filter (where b.source = 'drop'), 0)::text as published_drop_quantity,
          count(*) filter (where b.source = 'reservation')::int as active_reservation_count,
          coalesce(sum(b.quantity) filter (where b.source = 'reservation'), 0)::text as active_reservation_quantity,
          count(distinct b.household_id) filter (where b.household_id is not null)::int as distinct_households,
          min(ST_Distance(ms.location, b.location))::float as nearest_merchant_distance_meters
        from bucketed b
        join merchant_scope ms on ms.neighbourhood_id = b.neighbourhood_id
        group by b.cell_key, b.neighbourhood_id, b.category
        having count(distinct b.household_id) filter (where b.household_id is not null) >= :minHouseholds
           or count(*) filter (where b.source = 'drop') > 0
        order by
          (count(*) filter (where b.source in ('need', 'reservation'))) desc,
          b.category asc,
          b.cell_key asc
        limit 80
      `,
      parameters: params({
        merchantId: context.merchant.id,
        gridDegrees: DEFAULT_GRID_DEGREES,
        minHouseholds: MIN_HOUSEHOLDS_PER_CELL,
      }),
    });

    return {
      ok: true as const,
      status: "ok" as MerchantRuntimeStatus,
      merchant: context.merchant,
      location: publicMerchantLocation(context.location),
      grid: {
        type: "coarse_hash",
        approximateCellSizeMeters: 1000,
        minHouseholdsPerDemandCell: MIN_HOUSEHOLDS_PER_CELL,
      },
      cells: result.rows.map(heatmapCellDto),
      privacy: {
        exactHouseholdCoordinates: false,
        householdUnitLabels: false,
        directContact: false,
        rawHouseholdNeedLocations: false,
      },
    };
  } catch (error) {
    if (error instanceof MerchantRuntimeError) {
      throw error;
    }

    throw new MerchantRuntimeError(503, publicErrorMessage(error));
  }
}
