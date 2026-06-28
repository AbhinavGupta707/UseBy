import { NextResponse } from "next/server";

import {
  RIVERSIDE_QUARTER_DEMO_WORLD,
  summarizeDemoWorld,
} from "@/server/fixtures/demo-world";
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

  return NextResponse.json(
    {
      ok: result.applied,
      operation: "reset",
      result,
    },
    { status: result.applied ? 200 : 503 },
  );
}
