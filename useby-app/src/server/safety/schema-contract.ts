import {
  getTableAvailability,
  type TableAvailability,
} from "../db/introspection";

export type RuntimeTableContract = {
  table: string;
  requiredColumns?: readonly string[];
  anyOfColumns?: readonly (readonly string[])[];
};

export type RuntimeContractCheck = {
  available: boolean;
  missing: string[];
  tables: Record<string, { exists: boolean; missingColumns: string[] }>;
  availability: Record<string, TableAvailability>;
};

export const CP3_TABLES = {
  bookings: "bookings",
  safetyAcknowledgements: "safety_acknowledgements",
  trustEvents: "trust_events",
  reports: "reports",
  blocks: "blocks",
} as const;

export const SAFETY_ACKNOWLEDGEMENTS_CONTRACT = {
  table: CP3_TABLES.safetyAcknowledgements,
  requiredColumns: ["metadata"],
  anyOfColumns: [
    ["household_id", "acknowledged_by_household_id", "requester_household_id"],
    ["acknowledgement_type", "kind", "type"],
    ["acknowledged_at", "created_at"],
  ],
} as const satisfies RuntimeTableContract;

export const BLOCKS_CONTRACT = {
  table: CP3_TABLES.blocks,
  requiredColumns: ["metadata"],
  anyOfColumns: [
    ["blocker_household_id", "source_household_id", "created_by_household_id"],
    ["blocked_household_id", "target_household_id"],
  ],
} as const satisfies RuntimeTableContract;

export const REPORTS_CONTRACT = {
  table: CP3_TABLES.reports,
  requiredColumns: ["metadata"],
  anyOfColumns: [
    ["reporter_household_id", "source_household_id", "created_by_household_id"],
    ["category", "report_type", "type"],
    ["status", "state"],
  ],
} as const satisfies RuntimeTableContract;

export const TRUST_EVENTS_CONTRACT = {
  table: CP3_TABLES.trustEvents,
  requiredColumns: ["metadata"],
  anyOfColumns: [
    ["household_id", "subject_household_id"],
    ["event_type", "kind", "type"],
    ["score_delta", "delta"],
  ],
} as const satisfies RuntimeTableContract;

export function firstAvailableColumn(
  availability: TableAvailability,
  candidates: readonly string[],
): string | null {
  return candidates.find((column) => availability.columns.has(column)) ?? null;
}

export async function checkRuntimeContracts(
  contracts: readonly RuntimeTableContract[],
): Promise<RuntimeContractCheck> {
  const tables: RuntimeContractCheck["tables"] = {};
  const availabilityByTable: RuntimeContractCheck["availability"] = {};
  const missing: string[] = [];

  for (const contract of contracts) {
    const availability = await getTableAvailability(contract.table);
    availabilityByTable[contract.table] = availability;

    const missingColumns = [
      ...(contract.requiredColumns ?? []).filter(
        (column) => !availability.columns.has(column),
      ),
      ...(contract.anyOfColumns ?? [])
        .filter((group) => !firstAvailableColumn(availability, group))
        .map((group) => `one of (${group.join(", ")})`),
    ];

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
    availability: availabilityByTable,
  };
}

export function unavailableCp3Reason(check: RuntimeContractCheck): string {
  if (check.available) {
    return "";
  }

  return `Checkpoint 3 schema is unavailable or incomplete: ${check.missing.join(", ")}`;
}
