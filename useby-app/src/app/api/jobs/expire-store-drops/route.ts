import { type NextRequest, NextResponse } from "next/server";

import { runExpireStoreDropsJob } from "@/server/jobs/expire-store-drops";

export const dynamic = "force-dynamic";

type ExpireStoreDropsBody = {
  neighbourhoodId?: string;
  idempotencyKey?: string;
};

function queryScope(request: NextRequest) {
  return {
    neighbourhoodId: request.nextUrl.searchParams.get("neighbourhoodId"),
    idempotencyKey: request.nextUrl.searchParams.get("idempotencyKey"),
  };
}

async function readBody(request: NextRequest): Promise<ExpireStoreDropsBody> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as ExpireStoreDropsBody)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const query = queryScope(request);
  const result = await runExpireStoreDropsJob({
    source: "/api/jobs/expire-store-drops:GET",
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
  const result = await runExpireStoreDropsJob({
    source: "/api/jobs/expire-store-drops:POST",
    neighbourhoodId: body.neighbourhoodId ?? query.neighbourhoodId,
    idempotencyKey: body.idempotencyKey ?? query.idempotencyKey,
  });

  return NextResponse.json(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

