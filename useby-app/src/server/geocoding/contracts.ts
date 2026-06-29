import { z } from "zod";

import { getTableAvailability } from "../db/introspection";

export type ExactGeocodePoint = {
  latitude: number;
  longitude: number;
};

export type GeocodeProviderName = "mapbox" | "fixture" | "unavailable";

export type GeocodeProviderState = {
  configured: boolean;
  provider: GeocodeProviderName;
  mode: "live" | "fixture" | "unavailable";
  reason: string | null;
};

export type GeocodeResult = {
  ok: true;
  provider: "mapbox" | "fixture";
  mode: "live" | "fixture";
  point: ExactGeocodePoint;
  neighbourhoodName: string | null;
  coarseLabel: string;
  confidence: "high" | "medium" | "fixture";
};

export type GeocodeUnavailable = {
  ok: false;
  status: "unavailable";
  provider: "unavailable";
  reason: string;
};

export type PublicGeocodeDto = {
  ok: true;
  status: "ready" | "fixture";
  provider: "mapbox" | "fixture";
  mode: "live" | "fixture";
  coarseLocation: {
    areaLabel: string;
    neighbourhood: string | null;
  };
  confidence: GeocodeResult["confidence"];
  privacy: {
    exactCoordinatesReturned: false;
    rawAddressReturned: false;
    unitLabelReturned: false;
    directContactReturned: false;
  };
};

const geocodeInputShape = {
  address: z.string().trim().min(3).max(240).optional(),
  postcode: z.string().trim().min(2).max(24).optional(),
  countryCode: z.string().trim().length(2).default("GB"),
  fixtureOnly: z.boolean().default(false),
};

const hasAddressOrPostcode = (input: { address?: string; postcode?: string }) => Boolean(input.address || input.postcode);

export const geocodePreviewSchema = z
  .object({
    ...geocodeInputShape,
  })
  .refine(hasAddressOrPostcode, {
    message: "Provide an address or postcode.",
    path: ["address"],
  });

export const householdLocationUpdateSchema = z
  .object({
    ...geocodeInputShape,
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .refine(hasAddressOrPostcode, {
    message: "Provide an address or postcode.",
    path: ["address"],
  });

export type GeocodePreviewInput = z.infer<typeof geocodePreviewSchema>;
export type HouseholdLocationUpdateInput = z.infer<typeof householdLocationUpdateSchema>;

export const CP8_LOCATION_TABLE_CONTRACTS = [
  {
    table: "households",
    requiredColumns: [
      "id",
      "neighbourhood_id",
      "home_location",
      "coarse_location_label",
      "updated_at",
      "deleted_at",
    ],
  },
  {
    table: "neighbourhoods",
    requiredColumns: ["id", "name", "center_location", "service_radius_meters"],
  },
  {
    table: "audit_events",
    requiredColumns: [
      "actor_user_id",
      "actor_household_id",
      "entity_type",
      "entity_id",
      "action",
      "source",
      "source_route",
      "idempotency_key",
      "after_state",
      "metadata",
      "demo_scope_id",
      "is_demo",
    ],
  },
] as const;

export async function checkLocationContracts() {
  const checks = await Promise.all(
    CP8_LOCATION_TABLE_CONTRACTS.map(async (contract) => {
      const availability = await getTableAvailability(contract.table);
      const missingColumns = contract.requiredColumns.filter((column) => !availability.columns.has(column));

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

export function unavailableLocationReason(contracts: Awaited<ReturnType<typeof checkLocationContracts>>): string {
  return contracts.checks
    .filter((check) => !check.available)
    .map((check) =>
      check.exists
        ? `${check.table} missing columns: ${check.missingColumns.join(", ")}`
        : `${check.table} table is not available`,
    )
    .join("; ");
}

export function publicGeocodeDto(result: GeocodeResult): PublicGeocodeDto {
  return {
    ok: true,
    status: result.mode === "fixture" ? "fixture" : "ready",
    provider: result.provider,
    mode: result.mode,
    coarseLocation: {
      areaLabel: result.coarseLabel,
      neighbourhood: result.neighbourhoodName,
    },
    confidence: result.confidence,
    privacy: {
      exactCoordinatesReturned: false,
      rawAddressReturned: false,
      unitLabelReturned: false,
      directContactReturned: false,
    },
  };
}
