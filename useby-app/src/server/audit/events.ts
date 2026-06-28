import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import {
  ASSUMED_SYSTEM_COLUMNS,
  SYSTEM_TABLES,
} from "../db/schema-contract";
import { executeSql, sqlParam } from "../db/sql";

export type AuditEventInput = {
  eventType: string;
  actorType?: "system" | "user" | "merchant" | "admin" | "job";
  actorId?: string | null;
  source: string;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditEventWriteResult = {
  available: boolean;
  recorded: boolean;
  id?: string | null;
  reason?: string;
};

export async function recordAuditEvent(
  input: AuditEventInput,
): Promise<AuditEventWriteResult> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      available: false,
      recorded: false,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const availability = await getTableAvailability(SYSTEM_TABLES.auditEvents);
    const required = ASSUMED_SYSTEM_COLUMNS.auditEvents;
    const missing = required.filter((column) => !availability.columns.has(column));

    if (!availability.exists || missing.length > 0) {
      return {
        available: false,
        recorded: false,
        reason: availability.exists
          ? `audit_events missing columns: ${missing.join(", ")}`
          : "audit_events table is not available",
      };
    }

    const result = await executeSql<{ id: string }>({
      sql: `
        insert into audit_events (
          event_type,
          actor_type,
          actor_id,
          source,
          entity_type,
          entity_id,
          idempotency_key,
          metadata,
          created_at
        )
        values (
          :eventType,
          :actorType,
          nullif(:actorId, '')::uuid,
          :source,
          nullif(:entityType, ''),
          nullif(:entityId, '')::uuid,
          nullif(:idempotencyKey, ''),
          :metadata::jsonb,
          now()
        )
        returning id::text as id
      `,
      parameters: [
        sqlParam("eventType", input.eventType),
        sqlParam("actorType", input.actorType ?? "system"),
        sqlParam("actorId", input.actorId ?? ""),
        sqlParam("source", input.source),
        sqlParam("entityType", input.entityType ?? ""),
        sqlParam("entityId", input.entityId ?? ""),
        sqlParam("idempotencyKey", input.idempotencyKey ?? ""),
        sqlParam("metadata", input.metadata ?? {}),
      ],
    });

    return {
      available: true,
      recorded: true,
      id: result.rows[0]?.id ?? null,
    };
  } catch (error) {
    return {
      available: false,
      recorded: false,
      reason: publicErrorMessage(error),
    };
  }
}
