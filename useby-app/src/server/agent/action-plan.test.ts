import { describe, expect, it } from "vitest";

import { runAgentActionPlanDraft } from "./action-plan";

describe("agent action-plan workflow", () => {
  it("returns review-only fallback and skips persistence when requested", async () => {
    const response = await runAgentActionPlanDraft(
      {
        itemTitle: "Carrots",
        category: "grocery",
        daysUntilUseBy: 4,
        safetyStatus: "eligible",
        deterministicFacts: ["The item is private inventory until the user confirms a change."],
        persist: false,
      },
      {
        env: {
          LANGSMITH_TRACING: "true",
          LANGSMITH_API_KEY: "test-key",
          LANGSMITH_PROJECT: "useby-test",
        },
      },
    );

    expect(response.ok).toBe(true);
    expect(response.workflow).toBe("action_plan_draft");
    expect(response.provider.status).toBe("unavailable");
    expect(response.draft.requiresReview).toBe(true);
    expect(response.draft.deterministicAuthority.visibility).toBe("deterministic");
    expect(response.guardrails.canSetEligibility).toBe(false);
    expect(response.trace).toMatchObject({
      provider: "langsmith",
      readiness: "configured",
      traceId: null,
      project: "useby-test",
    });
    expect(response.persistence).toEqual({
      recorded: false,
      status: "skipped",
      runId: null,
      reason: "Persistence disabled by request.",
    });
  });
});
