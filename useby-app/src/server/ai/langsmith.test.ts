import { describe, expect, it } from "vitest";
import { getLangSmithReadiness } from "./langsmith";

describe("LangSmith readiness", () => {
  it("is disabled when tracing is not enabled", () => {
    const readiness = getLangSmithReadiness({});

    expect(readiness.status).toBe("disabled");
    expect(readiness.configured).toBe(false);
    expect(readiness.noKey).toBe(true);
  });

  it("is unavailable when tracing is enabled without a key", () => {
    const readiness = getLangSmithReadiness({
      LANGSMITH_TRACING: "true",
      LANGSMITH_PROJECT: "useby-live",
    });

    expect(readiness.status).toBe("unavailable");
    expect(readiness.configured).toBe(true);
    expect(readiness.noKey).toBe(true);
    expect(readiness.detail).toContain("no API key");
  });

  it("accepts current LangSmith env names", () => {
    const readiness = getLangSmithReadiness({
      LANGSMITH_TRACING: "true",
      LANGSMITH_API_KEY: "test-key",
      LANGSMITH_PROJECT: "useby-live",
    });

    expect(readiness.status).toBe("configured");
    expect(readiness.tracingEnabled).toBe(true);
    expect(readiness.noKey).toBe(false);
    expect(readiness.project).toBe("useby-live");
  });

  it("accepts legacy LangChain tracing aliases", () => {
    const readiness = getLangSmithReadiness({
      LANGCHAIN_TRACING_V2: "true",
      LANGCHAIN_API_KEY: "test-key",
      LANGCHAIN_PROJECT: "useby-live",
    });

    expect(readiness.status).toBe("configured");
    expect(readiness.noKey).toBe(false);
    expect(readiness.project).toBe("useby-live");
  });
});
