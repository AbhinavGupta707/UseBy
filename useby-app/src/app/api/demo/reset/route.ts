import { NextResponse } from "next/server";

import {
  RIVERSIDE_QUARTER_DEMO_WORLD,
  summarizeDemoWorld,
} from "@/server/fixtures/demo-world";
import { runRecomputeMatchesJob } from "@/server/jobs/recompute-matches";
import { buildDemoSeedPlan, runDemoSeedOperation } from "@/server/seed/demo-seed-adapter";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    operation: "reset",
    demoScope: RIVERSIDE_QUARTER_DEMO_WORLD.metadata.demoScope,
    seedBatchId: RIVERSIDE_QUARTER_DEMO_WORLD.metadata.seedBatchId,
    summary: summarizeDemoWorld(),
    plan: buildDemoSeedPlan("reset"),
  });
}

export async function POST() {
  const result = await runDemoSeedOperation("reset");
  const recompute = result.applied
    ? await runRecomputeMatchesJob({
        source: "/api/demo/reset",
        idempotencyKey: `${result.idempotencyKey}:demo-ready:${result.mutationTimestamp}`,
      })
    : null;
  const demoReady = recompute?.status === "succeeded";

  return NextResponse.json(
    {
      ok: result.applied && (recompute === null || demoReady),
      operation: "reset",
      demoReady,
      result,
      recompute,
    },
    { status: result.applied && (recompute === null || demoReady) ? 200 : 503 },
  );
}
