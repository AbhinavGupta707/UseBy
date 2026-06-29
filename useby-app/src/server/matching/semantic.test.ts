import { describe, expect, it } from "vitest";
import {
  rankSemanticallyAfterDeterministicFilters,
  type SemanticMatchCandidate,
} from "./semantic";

const passedFilters = {
  safety: true,
  privacy: true,
  distance: true,
  status: true,
  quantity: true,
  eligibility: true,
};

function candidate(
  id: string,
  overrides: Partial<SemanticMatchCandidate> = {},
): SemanticMatchCandidate {
  return {
    id,
    deterministicScore: 70,
    deterministicFilters: passedFilters,
    needText: "wraps for dinner",
    itemText: "unopened tortilla wraps",
    ...overrides,
  };
}

describe("semantic matching guardrails", () => {
  it("stays disabled and keeps deterministic order without embedding env", () => {
    const result = rankSemanticallyAfterDeterministicFilters([
      candidate("lower", { deterministicScore: 60 }),
      candidate("higher", { deterministicScore: 80 }),
    ], {
      env: {},
    });

    expect(result.status).toBe("disabled");
    expect(result.candidates.map((item) => item.id)).toEqual(["higher", "lower"]);
    expect(result.candidates.every((item) => item.semanticScore === null)).toBe(true);
  });

  it("refuses semantic ranking before all deterministic filters pass", () => {
    const result = rankSemanticallyAfterDeterministicFilters([
      candidate("unsafe", {
        deterministicScore: 95,
        deterministicFilters: {
          ...passedFilters,
          safety: false,
        },
      }),
      candidate("eligible", { deterministicScore: 70 }),
    ], {
      env: {
        AI_SEMANTIC_RANKING_ENABLED: "true",
        AI_EMBEDDING_PROVIDER: "openai",
        AI_EMBEDDING_MODEL: "text-embedding-3-small",
        OPENAI_API_KEY: "test-key",
      },
      scorer: (item) => (item.id === "unsafe" ? 1 : 0),
    });

    expect(result.status).toBe("rejected_guardrail");
    expect(result.reason).toContain("safety");
    expect(result.candidates.find((item) => item.id === "unsafe")?.semanticScore).toBeNull();
  });

  it("uses semantic score only as a secondary nudge after deterministic filters", () => {
    const result = rankSemanticallyAfterDeterministicFilters([
      candidate("strong-deterministic", { deterministicScore: 90 }),
      candidate("semantic-nudge", { deterministicScore: 88 }),
    ], {
      env: {
        AI_SEMANTIC_RANKING_ENABLED: "true",
        AI_EMBEDDING_PROVIDER: "openai",
        AI_EMBEDDING_MODEL: "text-embedding-3-small",
        OPENAI_API_KEY: "test-key",
      },
      scorer: (item) => (item.id === "semantic-nudge" ? 1 : 0),
    });

    expect(result.status).toBe("ranked");
    expect(result.candidates.map((item) => item.id)).toEqual([
      "semantic-nudge",
      "strong-deterministic",
    ]);
    expect(result.candidates.find((item) => item.id === "semantic-nudge")?.finalScore).toBe(93);
  });
});
