import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam } from "../db/sql";

export type IdempotencyClaimInput = {
  key: string;
  scope: string;
  requestHash?: string;
  metadata?: Record<string, unknown>;
};

export type IdempotencyClaimResult = {
  available: boolean;
  claimed: boolean;
  existing: boolean;
  reason?: string;
};

export async function claimIdempotencyKey(
  input: IdempotencyClaimInput,
): Promise<IdempotencyClaimResult> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      available: false,
      claimed: false,
      existing: false,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const availability = await getTableAvailability(SYSTEM_TABLES.idempotencyKeys);
    const required = ASSUMED_SYSTEM_COLUMNS.idempotencyKeys;
    const missing = required.filter((column) => !availability.columns.has(column));

    if (!availability.exists || missing.length > 0) {
      return {
        available: false,
        claimed: false,
        existing: false,
        reason: availability.exists
          ? `idempotency_keys missing columns: ${missing.join(", ")}`
          : "idempotency_keys table is not available",
      };
    }

    const result = await executeSql<{ inserted: boolean }>({
      sql: `
        insert into idempotency_keys (
          idempotency_key,
          scope,
          request_hash,
          status,
          metadata,
          created_at,
          updated_at
        )
        values (
          :key,
          :scope,
          nullif(:requestHash, ''),
          'claimed',
          :metadata::jsonb,
          now(),
          now()
        )
        on conflict (idempotency_key) do nothing
        returning true as inserted
      `,
      parameters: [
        sqlParam("key", input.key),
        sqlParam("scope", input.scope),
        sqlParam("requestHash", input.requestHash ?? ""),
        sqlParam("metadata", input.metadata ?? {}),
      ],
    });

    const inserted = Boolean(result.rows[0]?.inserted);

    return {
      available: true,
      claimed: inserted,
      existing: !inserted,
    };
  } catch (error) {
    return {
      available: false,
      claimed: false,
      existing: false,
      reason: publicErrorMessage(error),
    };
  }
}
