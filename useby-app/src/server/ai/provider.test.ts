import { describe, expect, it } from "vitest";
import { generateAiCopy, getAiCopyReadiness } from "./provider";

const request = {
  task: "match_explanation" as const,
  audience: "household" as const,
  deterministicFacts: [
    "The item already passed package-safe food filters.",
    "The match is 120m away using coarse household locations.",
  ],
  fallbackText:
    "This package-safe grocery match passed deterministic filters and uses coarse locations only.",
};

describe("AI copy provider guardrails", () => {
  it("returns honest unavailable fallback when no provider key is present", async () => {
    const result = await generateAiCopy(request, {
      env: {
        AI_COPY_ENABLED: "true",
        AI_COPY_PROVIDER: "openai",
        AI_COPY_MODEL: "gpt-4o-mini",
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.text).toBe(request.fallbackText);
    expect(result.reason).toContain("no provider key");
    expect(result.guardrails.canSetEligibility).toBe(false);
    expect(result.guardrails.canSetTrust).toBe(false);
    expect(result.guardrails.canSetPayment).toBe(false);
    expect(result.guardrails.canSetSafety).toBe(false);
    expect(result.guardrails.canSetReservationCapacity).toBe(false);
    expect(result.guardrails.canSetVisibility).toBe(false);
  });

  it("does not expose AI as a decision authority even when provider is configured", () => {
    const readiness = getAiCopyReadiness({
      AI_COPY_ENABLED: "true",
      AI_COPY_PROVIDER: "openai",
      AI_COPY_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "test-key",
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.detail).toContain("copy");
    expect(readiness.detail).toContain("explanations");
    expect(readiness.detail).toContain("summaries");
  });

  it("treats Fireworks env aliases as an OpenAI-compatible provider", () => {
    const readiness = getAiCopyReadiness({
      AI_COPY_ENABLED: "true",
      FIREWORKS_API_KEY: "test-key",
      FIREWORKS_CHAT_MODEL: "accounts/fireworks/models/kimi-k2-instruct-0905",
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.provider).toBe("fireworks");
    expect(readiness.model).toBe("accounts/fireworks/models/kimi-k2-instruct-0905");
    expect(readiness.noKey).toBe(false);
  });

  it("uses the Fireworks base URL alias when AI_COPY_API_BASE_URL is absent", async () => {
    let requestedUrl: string | null = null;
    const fetcher = async (input: string | URL | Request) => {
      requestedUrl = typeof input === "string" ? input : input.toString();

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "This match is nearby and uses coarse location details only.",
              },
            },
          ],
        }),
      } as Response;
    };

    const result = await generateAiCopy(request, {
      env: {
        AI_COPY_ENABLED: "true",
        AI_COPY_PROVIDER: "fireworks",
        FIREWORKS_API_KEY: "test-key",
        FIREWORKS_BASE_URL: "https://api.fireworks.ai/inference/v1",
        FIREWORKS_CHAT_MODEL: "accounts/fireworks/models/kimi-k2-instruct-0905",
      },
      fetcher,
    });

    expect(result.status).toBe("generated");
    expect(requestedUrl).toBe("https://api.fireworks.ai/inference/v1/chat/completions");
  });

  it("falls back if generated content attempts forbidden decisions", async () => {
    const fetcher = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"eligible":true,"trustScore":100,"paymentStatus":"captured","safetyStatus":"approved","remainingCapacity":4,"visibility":"public"}',
              },
            },
          ],
        }),
      }) as Response;

    const result = await generateAiCopy(request, {
      env: {
        AI_COPY_ENABLED: "true",
        AI_COPY_PROVIDER: "openai",
        AI_COPY_MODEL: "gpt-4o-mini",
        OPENAI_API_KEY: "test-key",
      },
      fetcher,
    });

    expect(result.status).toBe("fallback");
    expect(result.text).toBe(request.fallbackText);
    expect(result.reason).toContain("eligibility");
    expect(result.reason).toContain("trust");
    expect(result.reason).toContain("payment");
    expect(result.reason).toContain("safety");
    expect(result.reason).toContain("reservation_capacity");
    expect(result.reason).toContain("visibility");
  });
});
