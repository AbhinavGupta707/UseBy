import {
  getTableAvailability,
  type TableAvailability,
} from "../db/introspection";

export type Cp2TableContract = {
  table: string;
  requiredColumns: readonly string[];
  optionalColumns?: readonly string[];
};

export type Cp2ContractCheck = {
  available: boolean;
  missing: string[];
  tables: Record<string, { exists: boolean; missingColumns: string[] }>;
};

export const ACTION_CARDS_CONTRACT = {
  table: "action_cards",
  requiredColumns: [
    "id",
    "household_id",
    "neighbourhood_id",
    "item_instance_id",
    "card_type",
    "status",
    "priority",
    "title",
    "body",
    "rationale",
    "metadata",
    "idempotency_key",
    "created_at",
    "updated_at",
  ],
  optionalColumns: ["need_id", "expires_at", "demo_scope_id", "is_demo"],
} as const satisfies Cp2TableContract;

export const MATCHES_CONTRACT = {
  table: "matches",
  requiredColumns: [
    "id",
    "need_id",
    "item_instance_id",
    "neighbourhood_id",
    "requester_household_id",
    "owner_household_id",
    "status",
    "distance_meters",
    "score",
    "rationale",
    "metadata",
    "idempotency_key",
    "created_at",
    "updated_at",
  ],
  optionalColumns: ["expires_at", "demo_scope_id", "is_demo"],
} as const satisfies Cp2TableContract;

export const EXPIRY_OBSERVATIONS_CONTRACT = {
  table: "expiry_observations",
  requiredColumns: ["item_instance_id"],
  optionalColumns: [
    "observed_at",
    "expires_at",
    "use_by_date",
    "best_before_date",
    "confidence",
    "metadata",
  ],
} as const satisfies Cp2TableContract;

export const CP2_INPUT_CONTRACTS = [
  {
    table: "item_instances",
    requiredColumns: [
      "id",
      "owner_household_id",
      "neighbourhood_id",
      "category",
      "title",
      "quantity",
      "unit",
      "item_state",
      "storage_state",
      "safety_status",
      "expires_at",
      "use_by_date",
      "best_before_date",
      "location",
      "metadata",
    ],
  },
  {
    table: "needs",
    requiredColumns: [
      "id",
      "household_id",
      "neighbourhood_id",
      "category",
      "title",
      "quantity",
      "unit",
      "status",
      "needed_by",
      "location",
      "metadata",
    ],
  },
  {
    table: "households",
    requiredColumns: [
      "id",
      "neighbourhood_id",
      "public_label",
      "coarse_location_label",
      "home_location",
    ],
  },
] as const satisfies readonly Cp2TableContract[];

async function availabilityFor(
  contract: Cp2TableContract,
): Promise<{ availability: TableAvailability; missingColumns: string[] }> {
  const availability = await getTableAvailability(contract.table);
  const missingColumns = contract.requiredColumns.filter(
    (column) => !availability.columns.has(column),
  );

  return { availability, missingColumns };
}

export async function checkCp2Contracts(
  contracts: readonly Cp2TableContract[],
): Promise<Cp2ContractCheck> {
  const tables: Cp2ContractCheck["tables"] = {};
  const missing: string[] = [];

  for (const contract of contracts) {
    const { availability, missingColumns } = await availabilityFor(contract);
    tables[contract.table] = {
      exists: availability.exists,
      missingColumns,
    };

    if (!availability.exists) {
      missing.push(`${contract.table} table`);
    }

    for (const column of missingColumns) {
      missing.push(`${contract.table}.${column}`);
    }
  }

  return {
    available: missing.length === 0,
    missing,
    tables,
  };
}

export function unavailableCp2Reason(check: Cp2ContractCheck): string {
  if (check.available) {
    return "";
  }

  return `Checkpoint 2 schema is unavailable or incomplete: ${check.missing.join(", ")}`;
}
