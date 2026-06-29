import { NextResponse } from "next/server";

import { agentActionPlanRequestSchema, type AgentActor } from "@/server/agent/contracts";
import { runAgentActionPlanDraft } from "@/server/agent/action-plan";
import { loadRuntimeEnv } from "@/server/db/env";
import { resolveDemoActorContext } from "@/server/demo/context";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid agent action-plan payload.",
      details: error,
    },
    { status: 400 },
  );
}

async function resolveOptionalActor(request: Request): Promise<AgentActor | null> {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return null;
  }

  const url = new URL(request.url);
  const contextResult = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!contextResult.ok) {
    return null;
  }

  return {
    userId: contextResult.context.user.id,
    householdId: contextResult.context.household.id,
    neighbourhoodId: contextResult.context.neighbourhood.id,
    demoScope: contextResult.context.demoScope,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/agent/action-plan",
    method: "POST",
    body: {
      itemTitle: "required item title",
      category: "grocery | fashion | household",
      daysUntilUseBy: "optional integer; deterministic input only",
      safetyStatus: "eligible | restricted | blocked | unknown",
      deterministicFacts: "array of already-computed facts; no raw files or contact details",
      idempotencyKey: "optional stable key for persistence",
      persist: "boolean, defaults true",
    },
    authority:
      "AI drafts/explains only. Deterministic UseBy code remains authority for safety, eligibility, trust, payment, privacy, reservation capacity, and visibility.",
    fallback:
      "Returns a deterministic review draft when Fireworks/OpenAI-compatible agent config is unavailable.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return validationResponse("Request body must be JSON.");
  }

  const parsed = agentActionPlanRequestSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  const response = await runAgentActionPlanDraft(parsed.data, {
    actor: await resolveOptionalActor(request),
    sourceRoute: "/api/agent/action-plan",
  });

  return NextResponse.json(response, {
    status: response.provider.status === "generated" ? 201 : 200,
  });
}
