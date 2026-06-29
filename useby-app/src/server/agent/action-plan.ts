import { getLangSmithReadiness } from "../ai/langsmith";
import { draftActionPlan } from "../ai/structured";
import type { AgentActor, AgentActionPlanRequest, AgentTraceMetadata } from "./contracts";
import { recordAgentRun } from "./persistence";

type Fetcher = typeof fetch;

export type AgentActionPlanResponse = {
  ok: true;
  workflow: "action_plan_draft";
  provider: {
    status: "generated" | "fallback" | "unavailable";
    name: string;
    model: string | null;
    reason: string | null;
  };
  draft: Awaited<ReturnType<typeof draftActionPlan>>["draft"];
  guardrails: Awaited<ReturnType<typeof draftActionPlan>>["guardrails"];
  trace: AgentTraceMetadata;
  persistence: Awaited<ReturnType<typeof recordAgentRun>>;
};

function traceMetadata(env?: Record<string, string | undefined>): AgentTraceMetadata {
  const readiness = getLangSmithReadiness(env);

  return {
    provider: "langsmith",
    readiness: readiness.status,
    traceId: null,
    project: readiness.project,
    detail:
      readiness.status === "configured"
        ? "LangSmith is configured; trace id remains null until a real traced workflow records one."
        : readiness.detail,
  };
}

function requestSummary(input: AgentActionPlanRequest) {
  return {
    itemTitle: input.itemTitle,
    category: input.category ?? null,
    daysUntilUseBy: input.daysUntilUseBy ?? null,
    safetyStatus: input.safetyStatus ?? null,
    deterministicFactCount: input.deterministicFacts.length,
    persist: input.persist,
  };
}

export async function runAgentActionPlanDraft(
  input: AgentActionPlanRequest,
  options: {
    actor?: AgentActor | null;
    env?: Record<string, string | undefined>;
    fetcher?: Fetcher;
    sourceRoute?: string;
  } = {},
): Promise<AgentActionPlanResponse> {
  const result = await draftActionPlan(
    {
      itemTitle: input.itemTitle,
      category: input.category,
      daysUntilUseBy: input.daysUntilUseBy,
      safetyStatus: input.safetyStatus,
      deterministicFacts: input.deterministicFacts,
    },
    {
      env: options.env,
      fetcher: options.fetcher,
    },
  );
  const trace = traceMetadata(options.env);
  const sourceRoute = options.sourceRoute ?? "/api/agent/action-plan";
  const summary = requestSummary(input);

  const persistence = input.persist
    ? await recordAgentRun({
        workflow: "action_plan_draft",
        sourceRoute,
        idempotencyKey: input.idempotencyKey,
        actor: options.actor,
        requestSummary: summary,
        result,
        artifact: {
          kind: "action_plan_draft",
          title: `Action plan draft: ${input.itemTitle}`,
          payload: {
            draft: result.draft,
            providerStatus: result.status,
            guardrails: result.guardrails,
          },
        },
        trace,
      })
    : {
        recorded: false,
        status: "skipped" as const,
        runId: null,
        reason: "Persistence disabled by request.",
      };

  return {
    ok: true,
    workflow: "action_plan_draft",
    provider: {
      status: result.status,
      name: result.provider,
      model: result.model,
      reason: result.reason,
    },
    draft: result.draft,
    guardrails: result.guardrails,
    trace,
    persistence,
  };
}
