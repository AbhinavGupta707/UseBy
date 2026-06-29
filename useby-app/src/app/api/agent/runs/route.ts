import { NextResponse } from "next/server";

import { loadRuntimeEnv } from "@/server/db/env";
import { getTableAvailability, publicErrorMessage } from "@/server/db/introspection";
import { executeSql } from "@/server/db/sql";

export const dynamic = "force-dynamic";

type AgentRunRow = {
  id: string;
  workflow: string;
  status: string;
  provider: string;
  model: string | null;
  provider_status: string;
  trace_id: string | null;
  trace_provider: string | null;
  source_route: string | null;
  created_at: string | null;
  finished_at: string | null;
};

function publicStatus(status: string, providerStatus: string) {
  if (status === "succeeded" || providerStatus === "generated") {
    return "completed";
  }

  if (status === "started") {
    return "running";
  }

  if (status === "failed") {
    return "error";
  }

  return status;
}

export async function GET() {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        runs: [],
        message: `Aurora env missing: ${env.missing.join(", ")}`,
      },
      { status: 503 },
    );
  }

  try {
    const availability = await getTableAvailability("agent_runs");
    if (!availability.exists) {
      return NextResponse.json(
        {
          ok: false,
          status: "unavailable",
          runs: [],
          message: "agent_runs table is not available; run the CP9 agent runtime migration.",
        },
        { status: 503 },
      );
    }

    const result = await executeSql<AgentRunRow>({
      sql: `
        select
          id::text,
          workflow,
          status::text,
          provider,
          model,
          provider_status,
          trace_id,
          trace_provider,
          source_route,
          created_at::text,
          finished_at::text
        from agent_runs
        order by created_at desc
        limit 25
      `,
    });

    return NextResponse.json({
      ok: true,
      status: "ok",
      message:
        result.rows.length > 0
          ? "Redacted agent run metadata loaded from Aurora."
          : "Agent runtime is installed; no agent runs have been recorded yet.",
      runs: result.rows.map((run) => ({
        id: run.id,
        flow: run.workflow,
        status: publicStatus(run.status, run.provider_status),
        providerStatus: run.provider_status,
        providerName: run.provider,
        model: run.model,
        createdAt: run.created_at,
        updatedAt: run.finished_at ?? run.created_at,
        langsmithTraceId: run.trace_id,
        redactionStatus: "redacted",
        summary: `${run.workflow} via ${run.source_route ?? "agent runtime"}`,
        deterministicGuardrails: [
          {
            key: "deterministic_authority",
            label: "Deterministic authority",
            detail:
              "AI output is audit metadata only; UseBy code decides safety, eligibility, trust, payment, capacity, and visibility.",
            status: "ok",
          },
          {
            key: "redacted_metadata",
            label: "Redacted metadata",
            detail: "Run list excludes prompts, secrets, exact coordinates, direct contact fields, and raw files.",
            status: "ok",
          },
        ],
        traceProvider: run.trace_provider,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        runs: [],
        message: publicErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
