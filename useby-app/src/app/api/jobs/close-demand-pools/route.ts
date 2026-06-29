import { type NextRequest, NextResponse } from "next/server";

import { runCloseDemandPoolsJob } from "@/server/jobs/close-demand-pools";

export const dynamic = "force-dynamic";

type CloseDemandPoolsBody = {
  neighbourhoodId?: string;
  idempotencyKey?: string;
};

function queryScope(request: NextRequest) {
  return {
    neighbourhoodId: request.nextUrl.searchParams.get("neighbourhoodId"),
    idempotencyKey: request.nextUrl.searchParams.get("idempotencyKey"),
  };
}

async function readBody(request: NextRequest): Promise<CloseDemandPoolsBody> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as CloseDemandPoolsBody)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const query = queryScope(request);
  const result = await runCloseDemandPoolsJob({
    source: "/api/jobs/close-demand-pools:GET",
    neighbourhoodId: query.neighbourhoodId,
    idempotencyKey: query.idempotencyKey,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export async function POST(request: NextRequest) {
  const query = queryScope(request);
  const body = await readBody(request);
  const result = await runCloseDemandPoolsJob({
    source: "/api/jobs/close-demand-pools:POST",
    neighbourhoodId: body.neighbourhoodId ?? query.neighbourhoodId,
    idempotencyKey: body.idempotencyKey ?? query.idempotencyKey,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}
