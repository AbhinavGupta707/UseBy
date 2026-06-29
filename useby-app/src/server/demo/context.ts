import { createHash } from "node:crypto";

import { publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam } from "../db/sql";
import {
  DEMO_SCOPE,
  RIVERSIDE_QUARTER_DEMO_WORLD,
} from "../fixtures/demo-world";

export const DEFAULT_DEMO_HOUSEHOLD_DEMO_ID = "hh-atrium-2a";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DemoActorContext = {
  demoScope: typeof DEMO_SCOPE;
  household: {
    id: string;
    displayName: string;
    publicLabel: string;
    coarseLocationLabel: string;
  };
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  neighbourhood: {
    id: string;
    name: string;
    slug: string;
  };
};

export type DemoContextResult =
  | { ok: true; context: DemoActorContext }
  | { ok: false; status: number; message: string };

export type DemoContextInput = {
  headers?: Headers;
  searchParams?: URLSearchParams;
};

type DemoContextRow = {
  household_id: string;
  household_display_name: string;
  public_label: string;
  coarse_location_label: string;
  neighbourhood_id: string;
  neighbourhood_name: string;
  neighbourhood_slug: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
};

export function demoUuidFor(demoId: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`useby:${DEMO_SCOPE}:${demoId}`).digest("hex"),
    "hex",
  ).subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
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
  input: DemoContextInput,
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

function knownHouseholdDemoIds(): Set<string> {
  return new Set(RIVERSIDE_QUARTER_DEMO_WORLD.households.map((household) => household.demoId));
}

function knownUserDemoIds(): Set<string> {
  return new Set(
    RIVERSIDE_QUARTER_DEMO_WORLD.households.flatMap((household) => [
      household.demoId,
      `user:${household.demoId}`,
    ]),
  );
}

function resolveHouseholdId(selector: string | null): string | null {
  const value = selector ?? DEFAULT_DEMO_HOUSEHOLD_DEMO_ID;
  if (UUID_PATTERN.test(value)) {
    return value;
  }

  if (!knownHouseholdDemoIds().has(value)) {
    return null;
  }

  return demoUuidFor(value);
}

function resolveUserId(selector: string | null): string | null {
  if (!selector) {
    return null;
  }

  if (UUID_PATTERN.test(selector)) {
    return selector;
  }

  const demoId = selector.startsWith("user:") ? selector : `user:${selector}`;
  if (!knownUserDemoIds().has(demoId)) {
    return null;
  }

  return demoUuidFor(demoId);
}

export function selectDemoContextIds(input: DemoContextInput = {}) {
  const householdSelector = selectedValue(
    input,
    ["demoHouseholdId", "householdId", "household"],
    ["x-useby-demo-household", "x-useby-household-id"],
  );
  const userSelector = selectedValue(
    input,
    ["demoUserId", "userId", "user"],
    ["x-useby-demo-user", "x-useby-user-id"],
  );

  return {
    householdId: resolveHouseholdId(householdSelector),
    userId: resolveUserId(userSelector),
    householdSelector: householdSelector ?? DEFAULT_DEMO_HOUSEHOLD_DEMO_ID,
    userSelector,
  };
}

export async function resolveDemoActorContext(
  input: DemoContextInput = {},
): Promise<DemoContextResult> {
  const selected = selectDemoContextIds(input);

  if (!selected.householdId) {
    return {
      ok: false,
      status: 400,
      message: `Unknown demo household selector: ${selected.householdSelector}`,
    };
  }

  if (selected.userSelector && !selected.userId) {
    return {
      ok: false,
      status: 400,
      message: `Unknown demo user selector: ${selected.userSelector}`,
    };
  }

  try {
    const result = await executeSql<DemoContextRow>({
      sql: `
        select
          h.id::text as household_id,
          h.display_name as household_display_name,
          h.public_label,
          h.coarse_location_label,
          n.id::text as neighbourhood_id,
          n.name as neighbourhood_name,
          n.slug as neighbourhood_slug,
          u.id::text as user_id,
          u.display_name as user_display_name,
          u.email as user_email
        from households h
        join neighbourhoods n on n.id = h.neighbourhood_id
        join household_members hm
          on hm.household_id = h.id
          and hm.status = 'active'
        join users u on u.id = hm.user_id
        where h.demo_scope_id = :demoScope
          and h.deleted_at is null
          and h.id = :householdId::uuid
          and (:userId = '' or u.id = :userId::uuid)
        order by
          case hm.role when 'owner' then 0 else 1 end,
          hm.created_at asc
        limit 1
      `,
      parameters: [
        sqlParam("demoScope", DEMO_SCOPE),
        sqlParam("householdId", selected.householdId),
        sqlParam("userId", selected.userId ?? ""),
      ],
    });

    const row = result.rows[0];
    if (!row) {
      return {
        ok: false,
        status: 404,
        message: "Demo actor/household context is not seeded. Run /api/demo/reset first.",
      };
    }

    return {
      ok: true,
      context: {
        demoScope: DEMO_SCOPE,
        household: {
          id: row.household_id,
          displayName: row.household_display_name,
          publicLabel: row.public_label,
          coarseLocationLabel: row.coarse_location_label,
        },
        user: {
          id: row.user_id,
          displayName: row.user_display_name,
          email: row.user_email,
        },
        neighbourhood: {
          id: row.neighbourhood_id,
          name: row.neighbourhood_name,
          slug: row.neighbourhood_slug,
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
