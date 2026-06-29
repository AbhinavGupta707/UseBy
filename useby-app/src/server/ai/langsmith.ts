export type LangSmithReadiness = {
  status: "configured" | "disabled" | "unavailable";
  configured: boolean;
  tracingEnabled: boolean;
  noKey: boolean;
  endpoint: string | null;
  project: string | null;
  detail: string;
};

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

export function getLangSmithReadiness(
  source: Record<string, string | undefined> = process.env,
): LangSmithReadiness {
  const tracingEnabled =
    enabled(read(source, "LANGSMITH_TRACING")) ||
    enabled(read(source, "LANGCHAIN_TRACING_V2"));
  const apiKey = read(source, "LANGSMITH_API_KEY") ?? read(source, "LANGCHAIN_API_KEY");
  const endpoint =
    read(source, "LANGSMITH_ENDPOINT") ??
    read(source, "LANGCHAIN_ENDPOINT") ??
    "https://api.smith.langchain.com";
  const project = read(source, "LANGSMITH_PROJECT") ?? read(source, "LANGCHAIN_PROJECT");

  if (!tracingEnabled) {
    return {
      status: "disabled",
      configured: false,
      tracingEnabled: false,
      noKey: true,
      endpoint,
      project,
      detail:
        "LangSmith tracing is disabled; future agent workflows should run without claiming trace evidence.",
    };
  }

  if (!apiKey) {
    return {
      status: "unavailable",
      configured: true,
      tracingEnabled: true,
      noKey: true,
      endpoint,
      project,
      detail:
        "LangSmith tracing is enabled but no API key is configured; agent traces should fall back to local audit rows only.",
    };
  }

  return {
    status: "configured",
    configured: true,
    tracingEnabled: true,
    noKey: false,
    endpoint,
    project,
    detail:
      "LangSmith env is configured for future agent traces; trace evidence appears after LangGraph agent workflows are installed.",
  };
}
