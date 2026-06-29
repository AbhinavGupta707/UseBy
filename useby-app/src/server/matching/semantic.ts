export type DeterministicFilterSet = {
  safety: boolean;
  privacy: boolean;
  distance: boolean;
  status: boolean;
  quantity: boolean;
  eligibility: boolean;
};

export type SemanticMatchCandidate = {
  id: string;
  deterministicScore: number;
  deterministicFilters: DeterministicFilterSet;
  needText: string;
  itemText: string;
};

export type SemanticRankingReadiness = {
  status: "ready" | "disabled" | "unavailable";
  enabled: boolean;
  provider: string;
  model: string | null;
  noKey: boolean;
  detail: string;
};

export type SemanticRankedCandidate = SemanticMatchCandidate & {
  semanticScore: number | null;
  finalScore: number;
};

export type SemanticRankingResult =
  | {
      status: "ranked";
      readiness: SemanticRankingReadiness;
      candidates: SemanticRankedCandidate[];
      reason: null;
    }
  | {
      status: "disabled" | "unavailable" | "rejected_guardrail";
      readiness: SemanticRankingReadiness;
      candidates: SemanticRankedCandidate[];
      reason: string;
    };

type SemanticScorer = (candidate: SemanticMatchCandidate) => number;

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

function allFiltersPassed(candidate: SemanticMatchCandidate): boolean {
  return Object.values(candidate.deterministicFilters).every(Boolean);
}

function passThrough(
  candidates: SemanticMatchCandidate[],
  semanticScore: number | null = null,
): SemanticRankedCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      semanticScore,
      finalScore: candidate.deterministicScore,
    }))
    .sort((left, right) => right.finalScore - left.finalScore);
}

export function getSemanticRankingReadiness(
  source: Record<string, string | undefined> = process.env,
): SemanticRankingReadiness {
  const enabledByEnv = enabled(read(source, "AI_SEMANTIC_RANKING_ENABLED"));
  const provider =
    read(source, "AI_EMBEDDING_PROVIDER") ?? read(source, "AI_COPY_PROVIDER") ?? "disabled";
  const model = read(source, "AI_EMBEDDING_MODEL") ?? null;
  const hasKey = Boolean(
    read(source, "AI_EMBEDDING_API_KEY") ??
      read(source, "AI_COPY_API_KEY") ??
      read(source, "OPENAI_API_KEY") ??
      read(source, "AI_GATEWAY_API_KEY"),
  );

  if (!enabledByEnv) {
    return {
      status: "disabled",
      enabled: false,
      provider,
      model,
      noKey: true,
      detail: "Semantic ranking is disabled; deterministic score order remains authoritative.",
    };
  }

  if (!hasKey || !model) {
    return {
      status: "unavailable",
      enabled: true,
      provider,
      model,
      noKey: !hasKey,
      detail:
        "Semantic ranking is enabled but embedding provider key/model configuration is incomplete.",
    };
  }

  return {
    status: "ready",
    enabled: true,
    provider,
    model,
    noKey: false,
    detail:
      "Embedding provider is configured; ranking may be applied only after deterministic filters pass.",
  };
}

export function rankSemanticallyAfterDeterministicFilters(
  candidates: SemanticMatchCandidate[],
  options: {
    env?: Record<string, string | undefined>;
    scorer?: SemanticScorer;
  } = {},
): SemanticRankingResult {
  const readiness = getSemanticRankingReadiness(options.env ?? process.env);
  const rejected = candidates.filter((candidate) => !allFiltersPassed(candidate));

  if (rejected.length > 0) {
    return {
      status: "rejected_guardrail",
      readiness,
      candidates: passThrough(candidates),
      reason:
        "Semantic ranking refused candidates that had not passed safety, privacy, distance, status, quantity, and eligibility filters.",
    };
  }

  if (readiness.status !== "ready") {
    return {
      status: readiness.status,
      readiness,
      candidates: passThrough(candidates),
      reason: readiness.detail,
    };
  }

  if (!options.scorer) {
    return {
      status: "unavailable",
      readiness: {
        ...readiness,
        status: "unavailable",
        detail:
          "Embedding scorer is not installed in this lane; deterministic score order remains authoritative.",
      },
      candidates: passThrough(candidates),
      reason:
        "Embedding scorer is not installed in this lane; deterministic score order remains authoritative.",
    };
  }

  const ranked = candidates
    .map((candidate) => {
      const semanticScore = Math.max(0, Math.min(1, options.scorer!(candidate)));
      return {
        ...candidate,
        semanticScore,
        finalScore: Math.round((candidate.deterministicScore + semanticScore * 5) * 10) / 10,
      };
    })
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        right.deterministicScore - left.deterministicScore,
    );

  return {
    status: "ranked",
    readiness,
    candidates: ranked,
    reason: null,
  };
}
