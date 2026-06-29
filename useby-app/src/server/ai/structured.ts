import { z } from "zod";

import {
  aiGuardrailSummary,
  forbiddenDecisionClaims,
  type AiGuardrailSummary,
} from "./guardrails";

export type StructuredAiStatus = "generated" | "fallback" | "unavailable";

export type StructuredAiReadiness = {
  status: "ready" | "disabled" | "unavailable";
  provider: string;
  model: string | null;
  configured: boolean;
  noKey: boolean;
  detail: string;
};

export type StructuredAiResult<T> = {
  status: StructuredAiStatus;
  provider: string;
  model: string | null;
  draft: T;
  reason: string | null;
  guardrails: AiGuardrailSummary;
};

export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
export type ActionPlanDraft = z.infer<typeof actionPlanDraftSchema>;
export type MatchDraft = z.infer<typeof matchDraftSchema>;

type Fetcher = typeof fetch;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const DEFAULT_FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "accounts/fireworks/models/kimi-k2p5";

const receiptItemSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.number().positive().max(999).default(1),
  unit: z.string().min(1).max(32).default("item"),
  storageHint: z.enum(["fridge", "freezer", "cupboard", "sealed", "opened", "unknown"]).default("unknown"),
  useByDate: z.string().max(32).nullable().default(null),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

export const receiptDraftSchema = z.object({
  items: z.array(receiptItemSchema).max(30),
  notes: z.array(z.string().max(160)).max(6).default([]),
  requiresReview: z.literal(true).default(true),
});

const actionCardDraftSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(280),
  actionType: z.enum(["use_first", "freeze", "share", "check_label", "plan_meal"]),
  priority: z.enum(["low", "medium", "high"]),
  reasonChips: z.array(z.string().min(1).max(32)).max(5),
});

export const actionPlanDraftSchema = z.object({
  summary: z.string().min(1).max(280),
  actionCards: z.array(actionCardDraftSchema).min(1).max(5),
  reviewNotes: z.array(z.string().max(160)).max(6).default([]),
  requiresReview: z.literal(true).default(true),
  deterministicAuthority: z.object({
    safety: z.literal("deterministic"),
    eligibility: z.literal("deterministic"),
    trust: z.literal("deterministic"),
    payment: z.literal("deterministic"),
    reservationCapacity: z.literal("deterministic"),
    visibility: z.literal("deterministic"),
  }),
});

export const matchDraftSchema = z.object({
  explanation: z.string().min(1).max(280),
  reasonChips: z.array(z.string().min(1).max(32)).max(5),
  pickupCopy: z.string().min(1).max(180),
  requiresReview: z.literal(true).default(true),
});

function read(source: Record<string, string | undefined>, name: string): string | null {
  const value = source[name]?.trim();
  return value ? value : null;
}

function enabled(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "enabled", "on"].includes(value.toLowerCase());
}

function providerName(source: Record<string, string | undefined>): string {
  return (
    read(source, "AI_AGENT_PROVIDER") ??
    read(source, "AI_PROVIDER") ??
    (read(source, "FIREWORKS_API_KEY") ? "fireworks" : "disabled")
  );
}

function providerApiKey(source: Record<string, string | undefined>): string | null {
  return (
    read(source, "AI_AGENT_API_KEY") ??
    read(source, "FIREWORKS_API_KEY") ??
    read(source, "OPENAI_API_KEY") ??
    read(source, "AI_GATEWAY_API_KEY")
  );
}

function providerModel(source: Record<string, string | undefined>): string {
  return (
    read(source, "AI_AGENT_MODEL") ??
    read(source, "FIREWORKS_CHAT_MODEL") ??
    read(source, "AI_MODEL") ??
    DEFAULT_MODEL
  );
}

function providerBaseUrl(source: Record<string, string | undefined>, provider: string): string {
  return (
    read(source, "AI_AGENT_API_BASE_URL") ??
    read(source, "FIREWORKS_BASE_URL") ??
    read(source, "AI_BASE_URL") ??
    (provider === "fireworks" ? DEFAULT_FIREWORKS_BASE_URL : DEFAULT_OPENAI_BASE_URL)
  );
}

export function getStructuredAiReadiness(
  source: Record<string, string | undefined> = process.env,
): StructuredAiReadiness {
  const provider = providerName(source);
  const model = providerModel(source);
  const configured = enabled(read(source, "AI_AGENT_ENABLED")) || provider !== "disabled";
  const hasKey = Boolean(providerApiKey(source));

  if (!configured) {
    return {
      status: "disabled",
      provider,
      model: null,
      configured: false,
      noKey: true,
      detail: "Agent AI is disabled. Deterministic draft fallbacks are returned.",
    };
  }

  if (!hasKey) {
    return {
      status: "unavailable",
      provider,
      model,
      configured: true,
      noKey: true,
      detail: "Agent AI provider is configured but no provider key is available.",
    };
  }

  return {
    status: "ready",
    provider,
    model,
    configured: true,
    noKey: false,
    detail: "OpenAI-compatible structured output is configured for draft generation only.",
  };
}

function textLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function fallbackReceiptDraft(rawText: string | undefined): ReceiptDraft {
  const items = textLines(rawText)
    .slice(0, 12)
    .map((line) => ({
      name: line.replace(/\s+\d+(?:\.\d{2})?$/, "").trim().slice(0, 120) || line.slice(0, 120),
      quantity: 1,
      unit: "item",
      storageHint: "unknown" as const,
      useByDate: null,
      confidence: "low" as const,
    }));

  return receiptDraftSchema.parse({
    items,
    notes: [
      items.length > 0
        ? "Review quantities, storage, and date labels before applying."
        : "Add receipt lines or OCR text to draft grocery items.",
    ],
    requiresReview: true,
  });
}

export function deterministicActionPlanDraft(input: {
  itemTitle: string;
  category?: string | null;
  daysUntilUseBy?: number | null;
  safetyStatus?: string | null;
  deterministicFacts?: string[];
}): ActionPlanDraft {
  const days = input.daysUntilUseBy;
  const urgent = typeof days === "number" && days <= 2;
  const needsLabel = input.safetyStatus === "unknown";
  const actionType = needsLabel ? "check_label" : urgent ? "use_first" : "plan_meal";
  const priority = needsLabel || urgent ? "high" : "medium";
  const dateChip = typeof days === "number" ? `${days}d left` : "date review";
  const categoryChip = input.category ?? "inventory";

  return actionPlanDraftSchema.parse({
    summary: `${input.itemTitle} has a deterministic draft plan ready for review.`,
    actionCards: [
      {
        title: needsLabel ? `Check ${input.itemTitle} label` : `Plan ${input.itemTitle}`,
        body: needsLabel
          ? "Confirm the package and date label before UseBy shows sharing or booking options."
          : "UseBy can suggest copy, but deterministic rules still decide eligibility and visibility.",
        actionType,
        priority,
        reasonChips: [categoryChip, dateChip, "review"],
      },
    ],
    reviewNotes: [
      "AI drafts are advisory only; deterministic UseBy rules remain authoritative.",
      ...(input.deterministicFacts ?? []).slice(0, 2),
    ],
    requiresReview: true,
    deterministicAuthority: deterministicAuthority(),
  });
}

function fallbackMatchDraft(): MatchDraft {
  return matchDraftSchema.parse({
    explanation:
      "This draft can explain an already-eligible match without changing safety or visibility rules.",
    reasonChips: ["eligible first", "coarse location", "review"],
    pickupCopy: "UseBy shows coarse pickup guidance only after deterministic checks pass.",
    requiresReview: true,
  });
}

function deterministicAuthority() {
  return {
    safety: "deterministic" as const,
    eligibility: "deterministic" as const,
    trust: "deterministic" as const,
    payment: "deterministic" as const,
    reservationCapacity: "deterministic" as const,
    visibility: "deterministic" as const,
  };
}

function jsonSchemaFor(name: string, description: string, schema: unknown) {
  return {
    type: "json_schema",
    json_schema: {
      name,
      description,
      schema,
      strict: true,
    },
  };
}

function guardrailText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const clone = { ...(value as Record<string, unknown>) };
  delete clone.deterministicAuthority;
  return JSON.stringify(clone);
}

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence?.[1]?.trim() ?? trimmed;
}

function firstJsonObject(value: string): string {
  const start = value.indexOf("{");
  if (start < 0) {
    return value;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return value.slice(start);
}

function normalizeJsonLikeLiterals(value: string): string {
  let normalized = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      normalized += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      normalized += char;
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      normalized += char;
      inString = !inString;
      continue;
    }

    if (!inString) {
      const rest = value.slice(index);
      const replacement = rest.startsWith("True")
        ? "true"
        : rest.startsWith("False")
          ? "false"
          : rest.startsWith("None")
            ? "null"
            : null;

      if (replacement) {
        const before = value[index - 1] ?? "";
        const after = value[index + (replacement === "true" ? 4 : replacement === "false" ? 5 : 4)] ?? "";
        const boundaryBefore = !/[A-Za-z0-9_]/.test(before);
        const boundaryAfter = !/[A-Za-z0-9_]/.test(after);

        if (boundaryBefore && boundaryAfter) {
          normalized += replacement;
          index += replacement === "true" ? 3 : replacement === "false" ? 4 : 3;
          continue;
        }
      }
    }

    normalized += char;
  }

  return normalized;
}

function parseStructuredContent(content: unknown): unknown {
  if (typeof content !== "string") {
    return content;
  }

  const fenced = stripMarkdownFence(content);
  const objectCandidate = firstJsonObject(fenced);
  const candidates = [
    fenced,
    objectCandidate,
    normalizeJsonLikeLiterals(fenced),
    normalizeJsonLikeLiterals(objectCandidate),
  ];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function requestStructuredDraft<T>(
  options: {
    workflow: string;
    schema: z.ZodType<T>;
    schemaName: string;
    schemaDescription: string;
    jsonSchema: Record<string, unknown>;
    prompt: string;
    fallbackDraft: T;
    env?: Record<string, string | undefined>;
    fetcher?: Fetcher;
  },
): Promise<StructuredAiResult<T>> {
  const env = options.env ?? process.env;
  const readiness = getStructuredAiReadiness(env);

  if (readiness.status !== "ready") {
    return {
      status: "unavailable",
      provider: readiness.provider,
      model: readiness.model,
      draft: options.fallbackDraft,
      reason: readiness.detail,
      guardrails: aiGuardrailSummary(),
    };
  }

  const apiKey = providerApiKey(env);
  if (!apiKey) {
    return {
      status: "unavailable",
      provider: readiness.provider,
      model: readiness.model,
      draft: options.fallbackDraft,
      reason: "Agent provider key is unavailable.",
      guardrails: aiGuardrailSummary(),
    };
  }

  try {
    const response = await (options.fetcher ?? fetch)(
      `${providerBaseUrl(env, readiness.provider).replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: readiness.model ?? DEFAULT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You draft UseBy review artifacts only. Never decide safety, eligibility, trust, payment, reservation capacity, privacy, or visibility.",
            },
            {
              role: "user",
              content: options.prompt,
            },
          ],
          response_format: jsonSchemaFor(
            options.schemaName,
            options.schemaDescription,
            options.jsonSchema,
          ),
          temperature: 0.1,
          max_tokens: 900,
        }),
      },
    );

    if (!response.ok) {
      return {
        status: "fallback",
        provider: readiness.provider,
        model: readiness.model,
        draft: options.fallbackDraft,
        reason: `Agent provider returned HTTP ${response.status}.`,
        guardrails: aiGuardrailSummary(),
      };
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    const parsedContent = parseStructuredContent(content);
    const forbidden = forbiddenDecisionClaims(guardrailText(parsedContent));
    if (forbidden.length > 0) {
      return {
        status: "fallback",
        provider: readiness.provider,
        model: readiness.model,
        draft: options.fallbackDraft,
        reason: `Agent output attempted forbidden decision fields: ${forbidden.join(", ")}.`,
        guardrails: aiGuardrailSummary(),
      };
    }

    return {
      status: "generated",
      provider: readiness.provider,
      model: readiness.model,
      draft: options.schema.parse(parsedContent),
      reason: null,
      guardrails: aiGuardrailSummary(),
    };
  } catch (error) {
    return {
      status: "fallback",
      provider: readiness.provider,
      model: readiness.model,
      draft: options.fallbackDraft,
      reason: error instanceof Error ? error.message : `${options.workflow} draft failed.`,
      guardrails: aiGuardrailSummary(),
    };
  }
}

export function receiptDraftJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items", "notes", "requiresReview"],
    properties: {
      items: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "unit", "storageHint", "useByDate", "confidence"],
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            storageHint: {
              type: "string",
              enum: ["fridge", "freezer", "cupboard", "sealed", "opened", "unknown"],
            },
            useByDate: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
        },
      },
      notes: { type: "array", items: { type: "string" }, maxItems: 6 },
      requiresReview: { type: "boolean", enum: [true] },
    },
  };
}

export function actionPlanDraftJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "actionCards", "reviewNotes", "requiresReview", "deterministicAuthority"],
    properties: {
      summary: { type: "string" },
      actionCards: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "body", "actionType", "priority", "reasonChips"],
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            actionType: {
              type: "string",
              enum: ["use_first", "freeze", "share", "check_label", "plan_meal"],
            },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            reasonChips: { type: "array", items: { type: "string" }, maxItems: 5 },
          },
        },
      },
      reviewNotes: { type: "array", items: { type: "string" }, maxItems: 6 },
      requiresReview: { type: "boolean", enum: [true] },
      deterministicAuthority: {
        type: "object",
        additionalProperties: false,
        required: ["safety", "eligibility", "trust", "payment", "reservationCapacity", "visibility"],
        properties: {
          safety: { type: "string", enum: ["deterministic"] },
          eligibility: { type: "string", enum: ["deterministic"] },
          trust: { type: "string", enum: ["deterministic"] },
          payment: { type: "string", enum: ["deterministic"] },
          reservationCapacity: { type: "string", enum: ["deterministic"] },
          visibility: { type: "string", enum: ["deterministic"] },
        },
      },
    },
  };
}

export function matchDraftJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["explanation", "reasonChips", "pickupCopy", "requiresReview"],
    properties: {
      explanation: { type: "string" },
      reasonChips: { type: "array", items: { type: "string" }, maxItems: 5 },
      pickupCopy: { type: "string" },
      requiresReview: { type: "boolean", enum: [true] },
    },
  };
}

export async function draftReceiptItems(
  input: { rawText?: string; deterministicFacts?: string[] },
  options: { env?: Record<string, string | undefined>; fetcher?: Fetcher } = {},
) {
  const fallbackDraft = fallbackReceiptDraft(input.rawText);
  return requestStructuredDraft({
    workflow: "receipt_draft",
    schema: receiptDraftSchema,
    schemaName: "useby_receipt_draft",
    schemaDescription: "Receipt extraction draft for human review.",
    jsonSchema: receiptDraftJsonSchema(),
    prompt: [
      "Extract grocery item draft metadata from receipt OCR text.",
      "Return review-only data. Do not decide safety or eligibility.",
      "Deterministic facts:",
      ...(input.deterministicFacts ?? []).map((fact) => `- ${fact}`),
      "OCR text:",
      input.rawText ?? "",
    ].join("\n"),
    fallbackDraft,
    ...options,
  });
}

export async function draftActionPlan(
  input: Parameters<typeof deterministicActionPlanDraft>[0],
  options: { env?: Record<string, string | undefined>; fetcher?: Fetcher } = {},
) {
  const fallbackDraft = deterministicActionPlanDraft(input);
  return requestStructuredDraft({
    workflow: "action_plan_draft",
    schema: actionPlanDraftSchema,
    schemaName: "useby_action_plan_draft",
    schemaDescription: "Review-only action plan draft from deterministic facts.",
    jsonSchema: actionPlanDraftJsonSchema(),
    prompt: [
      `Draft action-card copy for item: ${input.itemTitle}.`,
      `Category: ${input.category ?? "unknown"}.`,
      `Days until use-by: ${input.daysUntilUseBy ?? "unknown"}.`,
      `Safety status from deterministic code: ${input.safetyStatus ?? "unknown"}.`,
      "Do not decide safety, eligibility, trust, payment, capacity, privacy, or visibility.",
      "Facts:",
      ...(input.deterministicFacts ?? []).map((fact) => `- ${fact}`),
    ].join("\n"),
    fallbackDraft,
    ...options,
  });
}

export async function draftMatchExplanation(
  input: { deterministicFacts: string[] },
  options: { env?: Record<string, string | undefined>; fetcher?: Fetcher } = {},
) {
  const fallbackDraft = fallbackMatchDraft();
  return requestStructuredDraft({
    workflow: "match_draft",
    schema: matchDraftSchema,
    schemaName: "useby_match_draft",
    schemaDescription: "Review-only explanation for an already eligible match.",
    jsonSchema: matchDraftJsonSchema(),
    prompt: [
      "Explain an already eligible UseBy match for a customer.",
      "Do not change filters or expose exact coordinates/contact details.",
      "Facts:",
      ...input.deterministicFacts.map((fact) => `- ${fact}`),
    ].join("\n"),
    fallbackDraft,
    ...options,
  });
}
