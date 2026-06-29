import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import {
  checkLocationContracts,
  publicGeocodeDto,
  type HouseholdLocationUpdateInput,
  type PublicGeocodeDto,
  unavailableLocationReason,
} from "../geocoding/contracts";
import { geocodeAddress, geocodingProviderState } from "../geocoding/provider";

export class LocationRuntimeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LocationRuntimeError";
    this.status = status;
  }
}

export function isLocationRuntimeError(error: unknown): error is LocationRuntimeError {
  return error instanceof LocationRuntimeError;
}

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

async function ensureLocationRuntimeAvailable() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    throw new LocationRuntimeError(503, `Aurora env missing: ${env.missing.join(", ")}`);
  }

  try {
    const contracts = await checkLocationContracts();
    if (!contracts.available) {
      throw new LocationRuntimeError(503, unavailableLocationReason(contracts));
    }
  } catch (error) {
    if (isLocationRuntimeError(error)) {
      throw error;
    }

    throw new LocationRuntimeError(503, publicErrorMessage(error));
  }
}

export async function previewGeocode(input: HouseholdLocationUpdateInput) {
  const result = await geocodeAddress(input);
  if (!result.ok) {
    throw new LocationRuntimeError(503, result.reason);
  }

  return {
    ...publicGeocodeDto(result),
    providerState: geocodingProviderState(),
  };
}

export async function updateHouseholdLocation(
  context: DemoActorContext,
  input: HouseholdLocationUpdateInput,
): Promise<PublicGeocodeDto & { updated: true; household: { id: string; publicLabel: string; coarseLocationLabel: string } }> {
  await ensureLocationRuntimeAvailable();

  const result = await geocodeAddress(input);
  if (!result.ok) {
    throw new LocationRuntimeError(503, result.reason);
  }

  const updateResult = await executeSql<{ id: string; public_label: string; coarse_location_label: string }>({
    sql: `
      update households
      set home_location = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
          coarse_location_label = :coarseLabel,
          updated_at = now()
      where id = :householdId::uuid
        and neighbourhood_id = :neighbourhoodId::uuid
        and deleted_at is null
      returning id::text, public_label, coarse_location_label
    `,
    parameters: params({
      longitude: result.point.longitude,
      latitude: result.point.latitude,
      coarseLabel: result.coarseLabel,
      householdId: context.household.id,
      neighbourhoodId: context.neighbourhood.id,
    }),
  });

  const row = updateResult.rows[0];
  if (!row) {
    throw new LocationRuntimeError(404, "Demo household is not available for location update.");
  }

  await executeSql({
    sql: `
      insert into audit_events (
        actor_user_id, actor_household_id, entity_type, entity_id, action,
        source, source_route, idempotency_key, after_state, metadata,
        demo_scope_id, is_demo
      )
      values (
        :actorUserId::uuid, :actorHouseholdId::uuid, 'household',
        :householdId::uuid, 'household.location_geocoded', 'api',
        '/api/locations/household', nullif(:idempotencyKey, ''),
        :afterState::jsonb, :metadata::jsonb, :demoScope, true
      )
    `,
    parameters: params({
      actorUserId: context.user.id,
      actorHouseholdId: context.household.id,
      householdId: context.household.id,
      idempotencyKey: input.idempotencyKey ?? "",
      afterState: {
        coarseLocationLabel: row.coarse_location_label,
        provider: result.provider,
        mode: result.mode,
      },
      metadata: {
        exactGeographyWrittenInternally: true,
        rawAddressStored: false,
        directContactStored: false,
      },
      demoScope: context.demoScope,
    }),
  });

  return {
    ...publicGeocodeDto(result),
    updated: true,
    household: {
      id: row.id,
      publicLabel: row.public_label,
      coarseLocationLabel: row.coarse_location_label,
    },
  };
}

export async function locationRuntimeUnavailableReason(): Promise<string | null> {
  try {
    await ensureLocationRuntimeAvailable();
    const state = geocodingProviderState();
    return state.configured ? null : state.reason;
  } catch (error) {
    if (isLocationRuntimeError(error)) {
      return error.message;
    }
    return publicErrorMessage(error);
  }
}
