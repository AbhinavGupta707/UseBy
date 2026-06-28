import { NextResponse } from "next/server";
import { runSystemJobStub } from "../../../../server/jobs/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runSystemJobStub(
    "expiry-decay",
    "/api/jobs/expiry-decay",
  );

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export const POST = GET;
