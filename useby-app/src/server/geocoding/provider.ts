import {
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../fixtures/demo-world";
import { sanitizePublicLocationText } from "../locations/privacy";
import type {
  GeocodePreviewInput,
  GeocodeProviderState,
  GeocodeResult,
  GeocodeUnavailable,
} from "./contracts";

type MapboxFeature = {
  center?: [number, number];
  place_name?: string;
  text?: string;
  context?: Array<{ id?: string; text?: string }>;
  relevance?: number;
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

const DEMO_POSTCODE_PREFIXES = ["rq", "rq1", "se1"];

function configuredMapboxToken(source: Record<string, string | undefined> = process.env): string | null {
  const token = source.MAPBOX_ACCESS_TOKEN?.trim();
  return token ? token : null;
}

export function geocodingProviderState(source: Record<string, string | undefined> = process.env): GeocodeProviderState {
  if (configuredMapboxToken(source)) {
    return {
      configured: true,
      provider: "mapbox",
      mode: "live",
      reason: null,
    };
  }

  return {
    configured: false,
    provider: "unavailable",
    mode: "unavailable",
    reason: "MAPBOX_ACCESS_TOKEN is not configured; only deterministic demo fixtures can be resolved.",
  };
}

function normalizedQuery(input: GeocodePreviewInput): string {
  return [input.address, input.postcode, input.countryCode]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .toLowerCase();
}

function fixtureForInput(input: GeocodePreviewInput): GeocodeResult | null {
  const query = normalizedQuery(input);
  const postcode = input.postcode?.replace(/\s+/g, "").toLowerCase() ?? "";
  const neighbourhood = RIVERSIDE_QUARTER_DEMO_WORLD.neighbourhood;

  for (const household of RIVERSIDE_QUARTER_DEMO_WORLD.households) {
    const aliases = [household.demoId, household.displayName, household.building]
      .map((alias) => alias.toLowerCase());
    if (aliases.some((alias) => query.includes(alias))) {
      return {
        ok: true,
        provider: "fixture",
        mode: "fixture",
        point: {
          latitude: household.location.lat,
          longitude: household.location.lng,
        },
        neighbourhoodName: neighbourhood.name,
        coarseLabel: sanitizePublicLocationText(`${household.building} area`),
        confidence: "fixture",
      };
    }
  }

  for (const merchant of RIVERSIDE_QUARTER_DEMO_WORLD.merchants) {
    const aliases = [merchant.demoId, merchant.displayName, merchant.locationName]
      .map((alias) => alias.toLowerCase());
    if (aliases.some((alias) => query.includes(alias))) {
      return {
        ok: true,
        provider: "fixture",
        mode: "fixture",
        point: {
          latitude: merchant.location.lat,
          longitude: merchant.location.lng,
        },
        neighbourhoodName: neighbourhood.name,
        coarseLabel: sanitizePublicLocationText(`${merchant.locationName} area`),
        confidence: "fixture",
      };
    }
  }

  if (
    query.includes("riverside quarter") ||
    DEMO_POSTCODE_PREFIXES.some((prefix) => postcode.startsWith(prefix))
  ) {
    return {
      ok: true,
      provider: "fixture",
      mode: "fixture",
      point: {
        latitude: neighbourhood.center.lat,
        longitude: neighbourhood.center.lng,
      },
      neighbourhoodName: neighbourhood.name,
      coarseLabel: neighbourhood.name,
      confidence: "fixture",
    };
  }

  return null;
}

async function mapboxGeocode(input: GeocodePreviewInput, token: string): Promise<GeocodeResult | GeocodeUnavailable> {
  const query = encodeURIComponent([input.address, input.postcode].filter(Boolean).join(" "));
  const country = encodeURIComponent(input.countryCode.toLowerCase());
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?country=${country}&limit=1&types=address,postcode,place,locality,neighborhood&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });

  if (!response.ok) {
    return {
      ok: false,
      status: "unavailable",
      provider: "unavailable",
      reason: `Mapbox geocoding returned HTTP ${response.status}.`,
    };
  }

  const body = (await response.json().catch(() => ({}))) as MapboxResponse;
  const feature = body.features?.[0];
  const center = feature?.center;
  if (!center || center.length !== 2) {
    return {
      ok: false,
      status: "unavailable",
      provider: "unavailable",
      reason: "Mapbox geocoding returned no usable result.",
    };
  }

  const contextLabel =
    feature.context?.find((entry) => entry.id?.startsWith("neighborhood"))?.text ??
    feature.context?.find((entry) => entry.id?.startsWith("place"))?.text ??
    feature.text ??
    "Mapped area";

  return {
    ok: true,
    provider: "mapbox",
    mode: "live",
    point: {
      latitude: center[1],
      longitude: center[0],
    },
    neighbourhoodName: contextLabel,
    coarseLabel: sanitizePublicLocationText(contextLabel),
    confidence: (feature.relevance ?? 0) >= 0.8 ? "high" : "medium",
  };
}

export async function geocodeAddress(input: GeocodePreviewInput): Promise<GeocodeResult | GeocodeUnavailable> {
  const fixture = fixtureForInput(input);
  if (fixture) {
    return fixture;
  }

  if (input.fixtureOnly) {
    return {
      ok: false,
      status: "unavailable",
      provider: "unavailable",
      reason: "No deterministic demo geocoding fixture matched this address or postcode.",
    };
  }

  const token = configuredMapboxToken();
  if (!token) {
    return {
      ok: false,
      status: "unavailable",
      provider: "unavailable",
      reason: "MAPBOX_ACCESS_TOKEN is not configured and no deterministic demo fixture matched.",
    };
  }

  return mapboxGeocode(input, token);
}
