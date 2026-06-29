import type { ManualGroceryInput, StorageState } from "@/lib/grocery/types";
import type {
  AgentGuardrail,
  AgentProviderStatus,
  AgentRunsSnapshot,
  AgentRunStatus,
  AgentRunSummary,
  ReceiptAgentDraft,
  ReceiptDraftLine,
  ReceiptDraftRequest,
  RedactionStatus,
} from "./contracts";
import type { ProofStatus } from "@/lib/proof-ui/contracts";

type Fetcher = typeof fetch;

const RECEIPT_DRAFT_ENDPOINTS = [
  "/api/agent/receipt-draft",
  "/api/agent/receipt-action-plan",
] as const;

const AGENT_RUN_ENDPOINTS = [
  "/api/agent/runs",
  "/api/agent/agent-runs",
] as const;

export const AGENT_DTO_ASSUMPTIONS = [
  "POST /api/agent/receipt-draft accepts { flow, reviewMode, input } and returns a reviewable draft.",
  "POST /api/agent/action-plan accepts deterministic item facts and returns advisory action-card copy only.",
  "GET /api/agent/runs returns redacted run summaries only; trace ids are optional and shown only when present.",
  "AI may draft, explain, extract, or summarize. Deterministic routes still decide safety, eligibility, visibility, payment, trust, and capacity.",
];

export const DEFAULT_AGENT_GUARDRAILS: AgentGuardrail[] = [
  {
    key: "human_confirm",
    label: "Human confirmation",
    detail: "Drafted grocery changes are not saved until the customer reviews and confirms them.",
    status: "ok",
  },
  {
    key: "deterministic_rules",
    label: "Deterministic authority",
    detail: "Safety, eligibility, visibility, payment, trust, and capacity stay with UseBy code.",
    status: "ok",
  },
  {
    key: "privacy_redaction",
    label: "Privacy redaction",
    detail: "Proof surfaces avoid exact household coordinates, direct contacts, secrets, and raw uploaded files.",
    status: "ok",
  },
];

export async function requestReceiptAgentDraft(
  fetcher: Fetcher,
  input: ManualGroceryInput,
): Promise<ReceiptAgentDraft> {
  const request: ReceiptDraftRequest = {
    input,
    flow: "receipt_action_plan",
    reviewMode: "human_confirm_required",
  };
  let lastUnavailable: ReceiptAgentDraft | null = null;

  for (const endpoint of RECEIPT_DRAFT_ENDPOINTS) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        return normalizeReceiptDraft(body, endpoint, response.status, input);
      }

      lastUnavailable = localReceiptDraft(
        input,
        endpoint,
        response.status,
        response.status === 404
          ? "Agent draft route is not installed yet."
          : stringValue(findFirst(asRecord(body), ["message", "reason", "error"]), `Agent draft route returned HTTP ${response.status}.`),
      );

      if (response.status !== 404 && response.status !== 501 && response.status !== 503) {
        return lastUnavailable;
      }
    } catch (error) {
      lastUnavailable = localReceiptDraft(
        input,
        endpoint,
        null,
        error instanceof Error ? error.message : "Agent draft request failed.",
      );
      return lastUnavailable;
    }
  }

  return lastUnavailable ?? localReceiptDraft(
    input,
    RECEIPT_DRAFT_ENDPOINTS[0],
    404,
    "Agent draft route is not installed yet.",
  );
}

export async function loadAgentRunsSnapshot(fetcher: Fetcher = fetch): Promise<AgentRunsSnapshot> {
  const checkedAt = new Date().toISOString();
  const endpoints: AgentRunsSnapshot["endpoints"] = [];

  for (const endpoint of AGENT_RUN_ENDPOINTS) {
    try {
      const response = await fetcher(endpoint, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      const bodyRecord = asRecord(body);
      const status = response.ok
        ? "ok"
        : response.status === 404 || response.status === 501 || response.status === 503
          ? "unavailable"
          : "error";

      endpoints.push({
        endpoint,
        status,
        httpStatus: response.status,
        message: response.ok
          ? "Agent run metadata route responded."
          : stringValue(findFirst(bodyRecord, ["message", "reason", "error"]), `HTTP ${response.status}`),
      });

      if (response.ok) {
        const runs = arrayValue(findFirst(bodyRecord, ["runs", "agentRuns", "agent_runs", "data"])).map(normalizeRun);
        return {
          checkedAt,
          status: runs.length > 0 ? "ok" : "warning",
          endpoints,
          runs,
          message: runs.length > 0
            ? "Agent run metadata is redacted and ready for proof review."
            : "Agent run route responded but did not return any run metadata yet.",
        };
      }
    } catch (error) {
      endpoints.push({
        endpoint,
        status: "error",
        httpStatus: null,
        message: error instanceof Error ? error.message : "Agent run metadata request failed.",
      });
      return {
        checkedAt,
        status: "error",
        endpoints,
        runs: [],
        message: "Agent run metadata could not be loaded.",
      };
    }
  }

  const registeredUnavailable = endpoints.find((endpoint) => endpoint.httpStatus !== 404 && endpoint.httpStatus !== 501);

  if (registeredUnavailable) {
    return {
      checkedAt,
      status: registeredUnavailable.status === "error" ? "error" : "unavailable",
      endpoints,
      runs: [],
      message: `Agent run metadata route is registered but unavailable: ${registeredUnavailable.message}`,
    };
  }

  return {
    checkedAt,
    status: "unavailable",
    endpoints,
    runs: [],
    message: "Agent run metadata routes are not installed yet. Do not claim LangSmith traces until a run returns a trace id.",
  };
}

export function normalizeReceiptDraft(
  value: unknown,
  endpoint: string,
  httpStatus: number | null,
  input: ManualGroceryInput,
): ReceiptAgentDraft {
  const record = asRecord(value);
  const draft = asRecord(findFirst(record, ["draft", "receiptDraft", "receipt_draft", "data"]));
  const run = normalizeRun(findFirst(record, ["run", "agentRun", "agent_run", "metadata"]) ?? record);
  const lines = arrayValue(findFirst(draft, ["lines", "items"]) ?? findFirst(record, ["lines", "items"]))
    .map((line, index) => normalizeDraftLine(line, index))
    .filter((line) => line.itemName.length > 0);

  return {
    run: {
      ...run,
      providerStatus: run.providerStatus === "not_requested" ? "generated" : run.providerStatus,
      redactionStatus: run.redactionStatus === "not_reported" ? "redacted" : run.redactionStatus,
    },
    lines: lines.length > 0 ? lines : localDraftLines(input),
    explanationFacts: safeStringArray(
      findFirst(draft, ["explanationFacts", "facts"]) ?? findFirst(record, ["explanationFacts", "facts"]),
      defaultExplanationFacts(input),
    ),
    aiRole: stringValue(
      findFirst(draft, ["aiRole", "role"]) ?? findFirst(record, ["aiRole", "role"]),
      "The agent drafted item names and date hints only. UseBy rules decide what can be saved or shared.",
    ),
    reviewRequired: booleanValue(findFirst(draft, ["reviewRequired", "review_required"]) ?? record.reviewRequired, true),
    sourceEndpoint: endpoint,
    message: stringValue(findFirst(record, ["message", "detail"]), `Draft loaded from ${endpoint} with HTTP ${httpStatus ?? "n/a"}.`),
  };
}

export function localReceiptDraft(
  input: ManualGroceryInput,
  endpoint: string,
  httpStatus: number | null,
  message: string,
): ReceiptAgentDraft {
  const now = new Date().toISOString();

  return {
    run: {
      id: `local-review-${stableHash(input.itemName + input.receiptLines + now).slice(0, 8)}`,
      flow: "receipt_action_plan",
      status: "unavailable",
      providerStatus: "unavailable",
      providerName: null,
      createdAt: now,
      updatedAt: now,
      langsmithTraceId: null,
      redactionStatus: "redacted",
      summary: "No provider draft was generated. This is a local review scaffold from customer-entered fields.",
      deterministicGuardrails: DEFAULT_AGENT_GUARDRAILS,
    },
    lines: localDraftLines(input),
    explanationFacts: defaultExplanationFacts(input),
    aiRole: "No AI provider output is being shown. Confirming saves through the deterministic grocery import route.",
    reviewRequired: true,
    sourceEndpoint: endpoint,
    message: `${message} Local review remains available, but provider status is unavailable.`,
  };
}

export function normalizeRun(value: unknown, index = 0): AgentRunSummary {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  const traceId = stringValue(
    findFirst(record, ["langsmithTraceId", "langsmith_trace_id", "traceId", "trace_id"]) ??
    findFirst(metadata, ["langsmithTraceId", "traceId"]),
    "",
  ) || null;
  const providerStatus = providerStatusValue(
    findFirst(record, ["providerStatus", "provider_status", "generationStatus", "generation_status"]) ??
    metadata.providerStatus,
  );
  const redactionStatus = redactionStatusValue(findFirst(record, ["redactionStatus", "redaction_status"]) ?? metadata.redactionStatus);

  return {
    id: stringValue(findFirst(record, ["id", "runId", "run_id"]), `agent-run-${index}`),
    flow: stringValue(findFirst(record, ["flow", "type", "workflow"]), "receipt_action_plan"),
    status: runStatusValue(findFirst(record, ["status", "state"]), providerStatus === "generated" ? "completed" : "unavailable"),
    providerStatus,
    providerName: stringValue(findFirst(record, ["providerName", "provider_name", "provider"]) ?? metadata.provider, "") || null,
    createdAt: dateString(findFirst(record, ["createdAt", "created_at", "startedAt", "started_at"])),
    updatedAt: dateString(findFirst(record, ["updatedAt", "updated_at", "finishedAt", "finished_at"])),
    langsmithTraceId: traceId,
    redactionStatus,
    summary: stringValue(
      findFirst(record, ["summary", "message", "detail"]),
      traceId
        ? "Run metadata includes a LangSmith trace id."
        : "Run metadata has no LangSmith trace id yet.",
    ),
    deterministicGuardrails: normalizeGuardrails(findFirst(record, ["deterministicGuardrails", "guardrails"])),
  };
}

function localDraftLines(input: ManualGroceryInput): ReceiptDraftLine[] {
  const directName = sanitizeVisibleText(input.itemName);
  const receiptNames = input.receiptLines
    .split(/\r?\n/)
    .map((line) => sanitizeVisibleText(line))
    .filter(Boolean)
    .slice(0, 5);
  const names = directName ? [directName] : receiptNames;

  return (names.length > 0 ? names : ["Review grocery item"]).map((name, index) => ({
    id: `draft-line-${index + 1}`,
    itemName: name,
    quantity: index === 0 ? input.quantity || "1" : "1",
    unit: index === 0 ? input.unit || "each" : "each",
    storageState: input.storageState,
    useByDate: index === 0 && input.expiryDate ? input.expiryDate : null,
    confidence: null,
    reviewStatus: input.expiryDate && name !== "Review grocery item" ? "ready" : "needs_review",
  }));
}

function normalizeDraftLine(value: unknown, index: number): ReceiptDraftLine {
  const record = asRecord(value);

  return {
    id: stringValue(findFirst(record, ["id", "lineId", "line_id"]), `draft-line-${index + 1}`),
    itemName: sanitizeVisibleText(stringValue(findFirst(record, ["itemName", "item_name", "name", "title"]))),
    quantity: stringValue(findFirst(record, ["quantity", "qty"]), "1"),
    unit: stringValue(record.unit, "each"),
    storageState: storageStateValue(findFirst(record, ["storageState", "storage_state"]), "cupboard"),
    useByDate: dateString(findFirst(record, ["useByDate", "use_by_date", "expiryDate", "expiry_date"])),
    confidence: numberValue(findFirst(record, ["confidence", "expiryConfidence", "expiry_confidence"])),
    reviewStatus: booleanValue(findFirst(record, ["ready", "isReady"]), false) ? "ready" : "needs_review",
  };
}

function normalizeGuardrails(value: unknown): AgentGuardrail[] {
  const guardrails = arrayValue(value)
    .map((entry) => {
      const record = asRecord(entry);
      const key = stringValue(findFirst(record, ["key", "id", "label"]));
      if (!key) {
        return null;
      }

      return {
        key,
        label: stringValue(record.label, key),
        detail: stringValue(findFirst(record, ["detail", "message"]), "Guardrail status was reported by the agent runtime."),
        status: proofStatusValue(record.status),
      } satisfies AgentGuardrail;
    })
    .filter((entry): entry is AgentGuardrail => Boolean(entry));

  return guardrails.length > 0 ? guardrails : DEFAULT_AGENT_GUARDRAILS;
}

function defaultExplanationFacts(input: ManualGroceryInput): string[] {
  const facts = [
    input.receiptLines.trim() ? "Receipt text was used only to draft reviewable item rows." : "Manual item fields supplied the review draft.",
    input.expiryDate ? "The visible label date is carried into the draft for review." : "Missing label dates remain review-required.",
    "Confirming calls the grocery import route; the agent does not create safety, match, or booking eligibility.",
  ];

  return facts;
}

function sanitizeVisibleText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted contact]")
    .replace(/\b(flat|unit|apt|apartment)\s+\w+/gi, "[redacted unit]")
    .trim()
    .slice(0, 96);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeStringArray(value: unknown, fallback: string[]): string[] {
  const strings = arrayValue(value)
    .map((entry) => sanitizeVisibleText(String(entry ?? "")))
    .filter(Boolean)
    .slice(0, 5);

  return strings.length > 0 ? strings : fallback;
}

function findFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function dateString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.slice(0, 24) : null;
}

function runStatusValue(value: unknown, fallback: AgentRunStatus): AgentRunStatus {
  const status = stringValue(value).toLowerCase();
  return [
    "drafted",
    "awaiting_review",
    "confirmed",
    "completed",
    "fallback",
    "unavailable",
    "error",
    "running",
  ].includes(status)
    ? (status as AgentRunStatus)
    : fallback;
}

function providerStatusValue(value: unknown): AgentProviderStatus {
  const status = stringValue(value).toLowerCase();
  return ["generated", "fallback", "unavailable", "not_requested"].includes(status)
    ? (status as AgentProviderStatus)
    : "not_requested";
}

function redactionStatusValue(value: unknown): RedactionStatus {
  const status = stringValue(value).toLowerCase();
  return ["redacted", "not_reported", "unsafe"].includes(status)
    ? (status as RedactionStatus)
    : "not_reported";
}

function proofStatusValue(value: unknown): ProofStatus {
  const status = stringValue(value).toLowerCase();
  return ["ok", "warning", "unavailable", "error", "unknown"].includes(status)
    ? (status as ProofStatus)
    : "unknown";
}

function storageStateValue(value: unknown, fallback: StorageState): StorageState {
  const state = stringValue(value).toLowerCase();
  return ["sealed", "opened", "fridge", "freezer", "cupboard", "cooked"].includes(state)
    ? (state as StorageState)
    : fallback;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(16);
}
