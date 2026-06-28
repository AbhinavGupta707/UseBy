import { NextResponse } from "next/server";
import { runSystemJobStub } from "../../../../server/jobs/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runSystemJobStub(
    "recompute-matches",
    "/api/jobs/recompute-matches",
  );

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export const POST = GET;
