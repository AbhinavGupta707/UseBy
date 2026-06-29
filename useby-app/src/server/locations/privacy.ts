const COARSE_DISTANCE_BAND_METERS = 250;

const RAW_ADDRESS_PATTERNS = [
  /\b(flat|apartment|apt|unit|suite|room|stall|shop)\s*[a-z0-9-]+\b/gi,
  /\b\d+[a-z]?\s+[\w\s.'-]{2,}\s+(street|st|road|rd|lane|ln|avenue|ave|drive|dr|way|yard|market|arcade)\b/gi,
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,
  /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g,
  /\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
];

export type CoarseLocationDto = {
  areaLabel: string;
  neighbourhood: string | null;
  distanceBandMeters?: number | null;
  pickupAreaLabel?: string | null;
  privacy: {
    exactCoordinates: false;
    rawAddress: false;
    unitLabel: false;
    directContact: false;
  };
};

export function distanceBandMeters(distanceMeters: number | null | undefined): number | null {
  if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(distanceMeters)) {
    return null;
  }

  return Math.ceil(Math.max(0, distanceMeters) / COARSE_DISTANCE_BAND_METERS) * COARSE_DISTANCE_BAND_METERS;
}

export function coarseAreaLabel(input: {
  areaLabel?: string | null;
  neighbourhoodName?: string | null;
  fallback?: string;
}): string {
  const candidate = input.areaLabel?.trim() || input.neighbourhoodName?.trim() || input.fallback || "Neighbourhood area";
  return sanitizePublicLocationText(candidate);
}

export function coarseLocationDto(input: {
  areaLabel?: string | null;
  neighbourhoodName?: string | null;
  distanceMeters?: number | null;
  pickupAreaLabel?: string | null;
}): CoarseLocationDto {
  const neighbourhood = input.neighbourhoodName ? sanitizePublicLocationText(input.neighbourhoodName) : null;

  return {
    areaLabel: coarseAreaLabel({
      areaLabel: input.areaLabel,
      neighbourhoodName: input.neighbourhoodName,
    }),
    neighbourhood,
    distanceBandMeters: distanceBandMeters(input.distanceMeters),
    pickupAreaLabel: input.pickupAreaLabel ? sanitizePublicLocationText(input.pickupAreaLabel) : null,
    privacy: {
      exactCoordinates: false,
      rawAddress: false,
      unitLabel: false,
      directContact: false,
    },
  };
}

export function sanitizePublicLocationText(value: string): string {
  let sanitized = value.trim();
  for (const pattern of RAW_ADDRESS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "area");
  }

  sanitized = sanitized
    .replace(/\s+/g, " ")
    .replace(/\barea\s+area\b/gi, "area")
    .replace(/\s+,/g, ",")
    .trim();

  return sanitized || "Neighbourhood area";
}

export function locationPrivacyLeaks(value: unknown): string[] {
  const leaks = new Set<string>();
  const forbiddenKeys = new Set([
    "homelocation",
    "home_location",
    "targetlocation",
    "target_location",
    "pickuplocation",
    "pickup_location",
    "latitude",
    "longitude",
    "lat",
    "lng",
    "unitlabel",
    "unit_label",
    "publicaddress",
    "public_address",
    "postcode",
    "postalcode",
    "postal_code",
    "email",
    "phone",
  ]);

  function visit(candidate: unknown, path: string) {
    if (typeof candidate === "string") {
      for (const pattern of RAW_ADDRESS_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(candidate)) {
          leaks.add(path || "value");
          pattern.lastIndex = 0;
        }
      }
      return;
    }

    if (!candidate || typeof candidate !== "object") {
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, entry] of Object.entries(candidate as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (forbiddenKeys.has(normalizedKey) && entry !== false && entry !== null) {
        leaks.add(path ? `${path}.${key}` : key);
      }
      visit(entry, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "");
  return [...leaks].sort();
}
