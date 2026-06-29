import { type NextRequest, NextResponse } from "next/server";
import { runRecomputeMatchesJob } from "../../../../server/jobs/recompute-matches";

export const dynamic = "force-dynamic";

type ManualRecomputeBody = {
  neighbourhoodId?: string;
  householdId?: string;
  idempotencyKey?: string;
};

function queryScope(request: NextRequest) {
  return {
    neighbourhoodId: request.nextUrl.searchParams.get("neighbourhoodId"),
    householdId: request.nextUrl.searchParams.get("householdId"),
    idempotencyKey: request.nextUrl.searchParams.get("idempotencyKey"),
  };
}

async function readBody(request: NextRequest): Promise<ManualRecomputeBody> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as ManualRecomputeBody)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const scope = queryScope(request);
  const result = await runRecomputeMatchesJob({
    source: "/api/jobs/recompute-matches:GET",
    neighbourhoodId: scope.neighbourhoodId,
    householdId: scope.householdId,
    idempotencyKey: scope.idempotencyKey,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export async function POST(request: NextRequest) {
  const query = queryScope(request);
  const body = await readBody(request);
  const result = await runRecomputeMatchesJob({
    source: "/api/jobs/recompute-matches:POST",
    neighbourhoodId: body.neighbourhoodId ?? query.neighbourhoodId,
    householdId: body.householdId ?? query.householdId,
    idempotencyKey: body.idempotencyKey ?? query.idempotencyKey,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}
