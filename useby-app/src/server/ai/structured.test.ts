import { describe, expect, it } from "vitest";

import {
  draftActionPlan,
  draftReceiptItems,
  getStructuredAiReadiness,
} from "./structured";

describe("structured agent provider", () => {
  it("returns deterministic fallback when agent AI is disabled", async () => {
    const result = await draftActionPlan(
      {
        itemTitle: "Spinach",
        category: "grocery",
        daysUntilUseBy: 1,
        safetyStatus: "eligible",
        deterministicFacts: ["Use-by date is within 24 hours."],
      },
      {
        env: {},
      },
    );

    expect(result.status).toBe("unavailable");
    expect(result.provider).toBe("disabled");
    expect(result.draft.actionCards[0]?.actionType).toBe("use_first");
    expect(result.draft.deterministicAuthority.safety).toBe("deterministic");
    expect(result.guardrails.canSetPayment).toBe(false);
  });

  it("accepts Fireworks aliases for OpenAI-compatible structured output", () => {
    const readiness = getStructuredAiReadiness({
      FIREWORKS_API_KEY: "test-key",
      FIREWORKS_CHAT_MODEL: "accounts/fireworks/models/kimi-k2-instruct-0905",
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.provider).toBe("fireworks");
    expect(readiness.model).toBe("accounts/fireworks/models/kimi-k2-instruct-0905");
  });

  it("calls /chat/completions with response_format json schema", async () => {
    let body: { response_format?: unknown } | null = null;
    let url: string | null = null;
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      url = typeof input === "string" ? input : input.toString();
      body = JSON.parse(String(init?.body)) as { response_format?: unknown };

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Review this spinach plan before applying it.",
                  actionCards: [
                    {
                      title: "Use spinach first",
                      body: "Make this a review-only priority from deterministic date facts.",
                      actionType: "use_first",
                      priority: "high",
                      reasonChips: ["grocery", "1d left", "review"],
                    },
                  ],
                  reviewNotes: ["No safety or visibility decision was made by AI."],
                  requiresReview: true,
                  deterministicAuthority: {
                    safety: "deterministic",
                    eligibility: "deterministic",
                    trust: "deterministic",
                    payment: "deterministic",
                    reservationCapacity: "deterministic",
                    visibility: "deterministic",
                  },
                }),
              },
            },
          ],
        }),
      } as Response;
    };

    const result = await draftActionPlan(
      {
        itemTitle: "Spinach",
        category: "grocery",
        daysUntilUseBy: 1,
        safetyStatus: "eligible",
      },
      {
        env: {
          AI_AGENT_ENABLED: "true",
          AI_AGENT_PROVIDER: "fireworks",
          FIREWORKS_API_KEY: "test-key",
          FIREWORKS_BASE_URL: "https://api.fireworks.ai/inference/v1",
          FIREWORKS_CHAT_MODEL: "accounts/fireworks/models/kimi-k2-instruct-0905",
        },
        fetcher,
      },
    );

    expect(result.status).toBe("generated");
    expect(url).toBe("https://api.fireworks.ai/inference/v1/chat/completions");
    const requestedBody = body as unknown as { response_format?: unknown };
    expect(requestedBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "useby_action_plan_draft",
      },
    });
  });

  it("falls back when model output tries to decide forbidden state", async () => {
    const fetcher = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  eligible: true,
                  paymentStatus: "captured",
                }),
              },
            },
          ],
        }),
      }) as Response;

    const result = await draftActionPlan(
      {
        itemTitle: "Yogurt",
        category: "grocery",
        safetyStatus: "eligible",
      },
      {
        env: {
          AI_AGENT_ENABLED: "true",
          AI_AGENT_PROVIDER: "openai",
          OPENAI_API_KEY: "test-key",
          AI_AGENT_MODEL: "gpt-4o-mini",
        },
        fetcher,
      },
    );

    expect(result.status).toBe("fallback");
    expect(result.reason).toContain("eligibility");
    expect(result.reason).toContain("payment");
    expect(result.draft.deterministicAuthority.payment).toBe("deterministic");
  });

  it("builds receipt fallbacks without storing raw text in metadata", async () => {
    const result = await draftReceiptItems(
      {
        rawText: "Milk 2.40\nBread 1.20",
      },
      { env: {} },
    );

    expect(result.status).toBe("unavailable");
    expect(result.draft.items.map((item) => item.name)).toEqual(["Milk", "Bread"]);
    expect(result.draft.notes[0]).toContain("Review");
  });
});
