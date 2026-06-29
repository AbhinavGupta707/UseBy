import {
  aiGuardrailSummary,
  forbiddenDecisionClaims,
  type AiGuardrailSummary,
} from "./guardrails";

export type AiRuntimeStatus = "ready" | "disabled" | "unavailable";

export type AiProviderReadiness = {
  status: AiRuntimeStatus;
  provider: string;
  model: string | null;
  configured: boolean;
  noKey: boolean;
  detail: string;
};

export type AiCopyTask = "action_copy" | "match_explanation" | "summary";

export type AiCopyRequest = {
  task: AiCopyTask;
  audience: "household" | "merchant" | "proof" | "system";
  deterministicFacts: string[];
  fallbackText: string;
  maxCharacters?: number;
};

export type AiCopyResult = {
  status: "generated" | "fallback" | "unavailable";
  provider: string;
  model: string | null;
  text: string;
  reason: string | null;
  guardrails: AiGuardrailSummary;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type Fetcher = typeof fetch;

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

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
  return read(source, "AI_COPY_PROVIDER") ?? read(source, "AI_PROVIDER") ?? "disabled";
}

function providerApiKey(source: Record<string, string | undefined>): string | null {
  return (
    read(source, "AI_COPY_API_KEY") ??
    read(source, "OPENAI_API_KEY") ??
    read(source, "AI_GATEWAY_API_KEY")
  );
}

export function getAiCopyReadiness(
  source: Record<string, string | undefined> = process.env,
): AiProviderReadiness {
  const provider = providerName(source);
  const model = read(source, "AI_COPY_MODEL") ?? read(source, "AI_MODEL") ?? DEFAULT_MODEL;
  const configured = enabled(read(source, "AI_COPY_ENABLED")) || provider !== "disabled";
  const hasKey = Boolean(providerApiKey(source));

  if (!configured) {
    return {
      status: "disabled",
      provider,
      model: null,
      configured: false,
      noKey: true,
      detail: "AI copy is disabled. Deterministic product copy is used.",
    };
  }

  if (!hasKey) {
    return {
      status: "unavailable",
      provider,
      model,
      configured: true,
      noKey: true,
      detail: "AI copy provider is configured but no provider key is available; fallback copy is returned.",
    };
  }

  return {
    status: "ready",
    provider,
    model,
    configured: true,
    noKey: false,
    detail: "AI copy provider is configured for copy, explanations, and summaries only.",
  };
}

function clampText(text: string, maxCharacters: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}.`;
}

function promptFor(request: AiCopyRequest): string {
  return [
    `Task: ${request.task}.`,
    `Audience: ${request.audience}.`,
    "Rewrite only the user-facing copy from deterministic facts.",
    "Do not decide eligibility, safety, trust, payment, reservation capacity, or visibility.",
    "Do not add exact coordinates, direct contact details, payment state, or safety certification.",
    "Facts:",
    ...request.deterministicFacts.map((fact) => `- ${fact}`),
  ].join("\n");
}

function fallback(
  request: AiCopyRequest,
  readiness: AiProviderReadiness,
  reason: string,
): AiCopyResult {
  return {
    status: readiness.status === "ready" ? "fallback" : "unavailable",
    provider: readiness.provider,
    model: readiness.model,
    text: clampText(request.fallbackText, request.maxCharacters ?? 480),
    reason,
    guardrails: aiGuardrailSummary(),
  };
}

function firstCompletionText(payload: ChatCompletionResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content : null;
}

export async function generateAiCopy(
  request: AiCopyRequest,
  options: {
    env?: Record<string, string | undefined>;
    fetcher?: Fetcher;
  } = {},
): Promise<AiCopyResult> {
  const env = options.env ?? process.env;
  const readiness = getAiCopyReadiness(env);

  if (readiness.status !== "ready") {
    return fallback(request, readiness, readiness.detail);
  }

  const apiKey = providerApiKey(env);
  if (!apiKey) {
    return fallback(request, readiness, "AI provider key is unavailable.");
  }

  const baseUrl = read(env, "AI_COPY_API_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL;
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
              "You polish UseBy product copy. You never make product decisions or change deterministic facts.",
          },
          {
            role: "user",
            content: promptFor(request),
          },
        ],
        temperature: 0.2,
        max_tokens: 180,
      }),
    });

    if (!response.ok) {
      return fallback(request, readiness, `AI provider returned HTTP ${response.status}.`);
    }

    const text = firstCompletionText((await response.json()) as ChatCompletionResponse);
    if (!text) {
      return fallback(request, readiness, "AI provider returned no copy.");
    }

    const forbidden = forbiddenDecisionClaims(text);
    if (forbidden.length > 0) {
      return fallback(
        request,
        readiness,
        `AI output attempted forbidden decision fields: ${forbidden.join(", ")}.`,
      );
    }

    return {
      status: "generated",
      provider: readiness.provider,
      model: readiness.model,
      text: clampText(text, request.maxCharacters ?? 480),
      reason: null,
      guardrails: aiGuardrailSummary(),
    };
  } catch (error) {
    return fallback(
      request,
      readiness,
      error instanceof Error ? error.message : "AI provider request failed.",
    );
  }
}
