import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam } from "../db/sql";
import {
  DEMO_SCOPE,
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../fixtures/demo-world";
import { demoUuidFor } from "../demo/context";

export type MerchantActorContext = {
  demoScope: typeof DEMO_SCOPE;
  merchant: {
    id: string;
    slug: string;
    name: string;
    category: string;
  };
  location: {
    id: string;
    neighbourhoodId: string | null;
    name: string;
    publicAddress: string;
    pickupNotes: string | null;
  };
};

export type MerchantContextResult =
  | { ok: true; context: MerchantActorContext }
  | { ok: false; status: number; message: string };

export type MerchantContextInput = {
  headers?: Headers;
  searchParams?: URLSearchParams;
};

type MerchantContextRow = {
  merchant_id: string;
  slug: string;
  merchant_name: string;
  category: string;
  location_id: string;
  neighbourhood_id: string | null;
  location_name: string;
  public_address: string;
  pickup_notes: string | null;
};

const DEFAULT_DEMO_MERCHANT_ID = "merchant-river-pantry";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function knownDemoMerchants(): Set<string> {
  return new Set(
    RIVERSIDE_QUARTER_DEMO_WORLD.merchants.map((merchant) => merchant.demoId),
  );
}

function header(headers: Headers | undefined, name: string): string | null {
  const value = headers?.get(name)?.trim();
  return value ? value : null;
}

function query(searchParams: URLSearchParams | undefined, name: string): string | null {
  const value = searchParams?.get(name)?.trim();
  return value ? value : null;
}

function selectedValue(
  input: MerchantContextInput,
  queryNames: string[],
  headerNames: string[],
): string | null {
  for (const name of queryNames) {
    const value = query(input.searchParams, name);
    if (value) {
      return value;
    }
  }

  for (const name of headerNames) {
    const value = header(input.headers, name);
    if (value) {
      return value;
    }
  }

  return null;
}

function resolveMerchantId(selector: string | null): string | null {
  const value = selector ?? DEFAULT_DEMO_MERCHANT_ID;
  if (UUID_PATTERN.test(value)) {
    return value;
  }

  if (!knownDemoMerchants().has(value)) {
    return null;
  }

  return demoUuidFor(value);
}

export function selectMerchantContextIds(input: MerchantContextInput = {}) {
  const merchantSelector = selectedValue(
    input,
    ["demoMerchantId", "merchantId", "merchant"],
    ["x-useby-demo-merchant", "x-useby-merchant-id"],
  );
  const locationSelector = selectedValue(
    input,
    ["merchantLocationId", "locationId"],
    ["x-useby-merchant-location-id"],
  );

  return {
    merchantId: resolveMerchantId(merchantSelector),
    locationId: locationSelector && UUID_PATTERN.test(locationSelector)
      ? locationSelector
      : null,
    merchantSelector: merchantSelector ?? DEFAULT_DEMO_MERCHANT_ID,
    locationSelector,
  };
}

export async function resolveMerchantActorContext(
  input: MerchantContextInput = {},
): Promise<MerchantContextResult> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      ok: false,
      status: 503,
      message: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const selected = selectMerchantContextIds(input);
  if (!selected.merchantId) {
    return {
      ok: false,
      status: 400,
      message: `Unknown demo merchant selector: ${selected.merchantSelector}`,
    };
  }

  if (selected.locationSelector && !selected.locationId) {
    return {
      ok: false,
      status: 400,
      message: `Invalid merchant location selector: ${selected.locationSelector}`,
    };
  }

  try {
    const result = await executeSql<MerchantContextRow>({
      sql: `
        select
          m.id::text as merchant_id,
          m.slug,
          m.name as merchant_name,
          m.category,
          ml.id::text as location_id,
          ml.neighbourhood_id::text as neighbourhood_id,
          ml.name as location_name,
          ml.public_address,
          ml.pickup_notes
        from merchants m
        join merchant_locations ml
          on ml.merchant_id = m.id
          and ml.is_active = true
          and ml.deleted_at is null
          and (:locationId = '' or ml.id = :locationId::uuid)
        where m.id = :merchantId::uuid
          and m.deleted_at is null
        order by ml.created_at asc
        limit 1
      `,
      parameters: [
        sqlParam("merchantId", selected.merchantId),
        sqlParam("locationId", selected.locationId ?? ""),
      ],
    });

    const row = result.rows[0];
    if (!row) {
      return {
        ok: false,
        status: 404,
        message: "Merchant context is not seeded or the selected location is inactive.",
      };
    }

    return {
      ok: true,
      context: {
        demoScope: DEMO_SCOPE,
        merchant: {
          id: row.merchant_id,
          slug: row.slug,
          name: row.merchant_name,
          category: row.category,
        },
        location: {
          id: row.location_id,
          neighbourhoodId: row.neighbourhood_id,
          name: row.location_name,
          publicAddress: row.public_address,
          pickupNotes: row.pickup_notes,
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      message: publicErrorMessage(error),
    };
  }
}
