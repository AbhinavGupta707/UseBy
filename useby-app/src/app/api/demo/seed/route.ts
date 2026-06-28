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
    operation: "seed",
    demoScope: RIVERSIDE_QUARTER_DEMO_WORLD.metadata.demoScope,
    seedBatchId: RIVERSIDE_QUARTER_DEMO_WORLD.metadata.seedBatchId,
    summary: summarizeDemoWorld(),
    plan: buildDemoSeedPlan("seed"),
  });
}

export async function POST() {
  const result = await runDemoSeedOperation("seed");

  return NextResponse.json(
    {
      ok: result.applied,
      operation: "seed",
      result,
    },
    { status: result.applied ? 200 : 503 },
  );
}
