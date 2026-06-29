import type { ManualGroceryInput, StorageState } from "@/lib/grocery/types";
import type { ProofStatus } from "@/lib/proof-ui/contracts";

export type AgentRunStatus =
  | "drafted"
  | "awaiting_review"
  | "confirmed"
  | "completed"
  | "fallback"
  | "unavailable"
  | "error"
  | "running";

export type AgentProviderStatus = "generated" | "fallback" | "unavailable" | "not_requested";

export type RedactionStatus = "redacted" | "not_reported" | "unsafe";

export type AgentGuardrail = {
  key: string;
  label: string;
  detail: string;
  status: ProofStatus;
};

export type AgentRunSummary = {
  id: string;
  flow: "receipt_action_plan" | "match_explanation" | "pool_assistant" | string;
  status: AgentRunStatus;
  providerStatus: AgentProviderStatus;
  providerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  langsmithTraceId: string | null;
  redactionStatus: RedactionStatus;
  summary: string;
  deterministicGuardrails: AgentGuardrail[];
};

export type ReceiptDraftLine = {
  id: string;
  itemName: string;
  quantity: string;
  unit: string;
  storageState: StorageState;
  useByDate: string | null;
  confidence: number | null;
  reviewStatus: "needs_review" | "ready";
};

export type ReceiptAgentDraft = {
  run: AgentRunSummary;
  lines: ReceiptDraftLine[];
  explanationFacts: string[];
  aiRole: string;
  reviewRequired: boolean;
  sourceEndpoint: string;
  message: string;
};

export type AgentRunsSnapshot = {
  checkedAt: string;
  status: ProofStatus;
  endpoints: {
    endpoint: string;
    status: ProofStatus;
    httpStatus: number | null;
    message: string;
  }[];
  runs: AgentRunSummary[];
  message: string;
};

export type ReceiptDraftRequest = {
  input: ManualGroceryInput;
  flow: "receipt_action_plan";
  reviewMode: "human_confirm_required";
};
