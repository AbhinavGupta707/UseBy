import { createHash } from "node:crypto";

import { loadRuntimeEnv } from "../db/env";
import { getTableAvailability, publicErrorMessage } from "../db/introspection";
import { executeSql, sqlParam, type SqlValue } from "../db/sql";
import type { StructuredAiResult } from "../ai/structured";
import type {
  AgentActor,
  AgentPersistenceStatus,
  AgentTraceMetadata,
} from "./contracts";

export type AgentRunRecordInput<T> = {
  workflow: "action_plan_draft" | "receipt_draft" | "match_draft";
  sourceRoute: string;
  idempotencyKey?: string | null;
  actor?: AgentActor | null;
  requestSummary: Record<string, unknown>;
  result: StructuredAiResult<T>;
  artifact: {
    kind: string;
    title: string;
    payload: Record<string, unknown>;
  };
  trace: AgentTraceMetadata;
};

const REQUIRED_AGENT_RUN_COLUMNS = [
  "id",
  "workflow",
  "status",
  "provider",
  "model",
  "provider_status",
  "trace_id",
  "trace_provider",
  "request_fingerprint",
  "deterministic_authority",
  "redaction_summary",
  "metadata",
  "created_at",
] as const;

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function fingerprintAgentRequest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function statusForRun(status: StructuredAiResult<unknown>["status"]) {
  if (status === "generated") {
    return "succeeded";
  }

  return status;
}

function redactionSummary() {
  return {
    rawPromptStored: false,
    rawReceiptTextStored: false,
    rawFileContentsStored: false,
    directContactFieldsStored: false,
    exactCoordinatesStored: false,
    secretValuesStored: false,
    persistedPayload: "draft artifact and metadata only",
  };
}

async function agentRunsUnavailable(): Promise<string | null> {
  const availability = await getTableAvailability("agent_runs");
  if (!availability.exists) {
    return "agent_runs table is not available; run `0007_agent_runtime_contracts` migration.";
  }

  const missing = REQUIRED_AGENT_RUN_COLUMNS.filter(
    (column) => !availability.columns.has(column),
  );
  return missing.length > 0 ? `agent_runs missing columns: ${missing.join(", ")}` : null;
}

export async function recordAgentRun<T>(
  input: AgentRunRecordInput<T>,
): Promise<AgentPersistenceStatus> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      recorded: false,
      status: "unavailable",
      runId: null,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  try {
    const unavailable = await agentRunsUnavailable();
    if (unavailable) {
      return {
        recorded: false,
        status: "unavailable",
        runId: null,
        reason: unavailable,
      };
    }

    const requestFingerprint = fingerprintAgentRequest(input.requestSummary);
    const runResult = await executeSql<{ id: string }>({
      sql: `
        insert into agent_runs (
          workflow,
          status,
          provider,
          model,
          provider_status,
          actor_user_id,
          actor_household_id,
          actor_merchant_id,
          neighbourhood_id,
          source,
          source_route,
          trace_id,
          trace_provider,
          request_fingerprint,
          idempotency_key,
          deterministic_authority,
          redaction_summary,
          metadata,
          demo_scope_id,
          is_demo,
          finished_at
        )
        values (
          :workflow,
          :status::agent_run_status,
          :provider,
          nullif(:model, ''),
          :providerStatus,
          nullif(:actorUserId, '')::uuid,
          nullif(:actorHouseholdId, '')::uuid,
          nullif(:actorMerchantId, '')::uuid,
          nullif(:neighbourhoodId, '')::uuid,
          'agent-api',
          :sourceRoute,
          nullif(:traceId, ''),
          :traceProvider,
          :requestFingerprint,
          nullif(:idempotencyKey, ''),
          :deterministicAuthority::jsonb,
          :redactionSummary::jsonb,
          :metadata::jsonb,
          nullif(:demoScope, ''),
          :isDemo,
          now()
        )
        on conflict (idempotency_key) where idempotency_key is not null do update set
          status = excluded.status,
          provider_status = excluded.provider_status,
          trace_id = excluded.trace_id,
          trace_provider = excluded.trace_provider,
          deterministic_authority = excluded.deterministic_authority,
          redaction_summary = excluded.redaction_summary,
          metadata = excluded.metadata,
          finished_at = now()
        returning id::text as id
      `,
      parameters: params({
        workflow: input.workflow,
        status: statusForRun(input.result.status),
        provider: input.result.provider,
        model: input.result.model ?? "",
        providerStatus: input.result.status,
        actorUserId: input.actor?.userId ?? "",
        actorHouseholdId: input.actor?.householdId ?? "",
        actorMerchantId: input.actor?.merchantId ?? "",
        neighbourhoodId: input.actor?.neighbourhoodId ?? "",
        sourceRoute: input.sourceRoute,
        traceId: input.trace.traceId ?? "",
        traceProvider: input.trace.provider,
        requestFingerprint,
        idempotencyKey: input.idempotencyKey ?? "",
        deterministicAuthority: {
          safety: "deterministic",
          eligibility: "deterministic",
          trust: "deterministic",
          payment: "deterministic",
          reservationCapacity: "deterministic",
          visibility: "deterministic",
        },
        redactionSummary: redactionSummary(),
        metadata: {
          requestSummary: input.requestSummary,
          reason: input.result.reason,
          traceReadiness: input.trace.readiness,
          traceProject: input.trace.project,
        },
        demoScope: input.actor?.demoScope ?? "",
        isDemo: Boolean(input.actor?.demoScope),
      }),
    });

    const runId = runResult.rows[0]?.id ?? null;
    if (!runId) {
      return {
        recorded: false,
        status: "failed",
        runId: null,
        reason: "Agent run insert returned no id.",
      };
    }

    await executeSql({
      sql: `
        delete from agent_tool_calls where agent_run_id = :runId::uuid
      `,
      parameters: params({ runId }),
    });
    await executeSql({
      sql: `
        delete from agent_artifacts where agent_run_id = :runId::uuid
      `,
      parameters: params({ runId }),
    });

    await executeSql({
      sql: `
        insert into agent_tool_calls (
          agent_run_id,
          sequence,
          tool_name,
          tool_type,
          status,
          input_metadata,
          output_metadata,
          finished_at
        )
        values
          (
            :runId::uuid,
            1,
            'deterministic_guardrails',
            'deterministic',
            'succeeded',
            :guardrailInput::jsonb,
            :guardrailOutput::jsonb,
            now()
          ),
          (
            :runId::uuid,
            2,
            'structured_chat_completion',
            'provider',
            :providerStatus,
            :providerInput::jsonb,
            :providerOutput::jsonb,
            now()
          )
      `,
      parameters: params({
        runId,
        providerStatus: input.result.status,
        guardrailInput: {
          deterministicAuthority: true,
        },
        guardrailOutput: input.result.guardrails,
        providerInput: {
          provider: input.result.provider,
          model: input.result.model,
          rawPromptStored: false,
        },
        providerOutput: {
          status: input.result.status,
          reason: input.result.reason,
        },
      }),
    });

    await executeSql({
      sql: `
        insert into agent_artifacts (
          agent_run_id,
          kind,
          title,
          payload,
          metadata
        )
        values (
          :runId::uuid,
          :kind,
          :title,
          :payload::jsonb,
          :metadata::jsonb
        )
      `,
      parameters: params({
        runId,
        kind: input.artifact.kind,
        title: input.artifact.title,
        payload: input.artifact.payload,
        metadata: {
          redactionLevel: "safe_metadata",
          sourceRoute: input.sourceRoute,
        },
      }),
    });

    return {
      recorded: true,
      status: "recorded",
      runId,
      reason: null,
    };
  } catch (error) {
    return {
      recorded: false,
      status: "failed",
      runId: null,
      reason: publicErrorMessage(error),
    };
  }
}
