import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { blockCreateSchema } from "@/server/moderation/contracts";
import { createBlock, listBlocks } from "@/server/moderation/runtime";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid block payload.",
      details: error,
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const contextResult = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!contextResult.ok) {
    return NextResponse.json(
      { ok: false, error: contextResult.message },
      { status: contextResult.status },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return validationResponse("Request body must be JSON.");
  }

  const parsed = blockCreateSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  const result = await createBlock(contextResult.context, parsed.data);
  if (result.status === "error") {
    return NextResponse.json(
      { ok: false, code: result.code, error: result.message },
      { status: 400 },
    );
  }

  if (result.status === "unavailable") {
    return NextResponse.json(
      { ok: false, status: "unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    block: result.block,
    audit: result.audit,
    trust: result.trust,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contextResult = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!contextResult.ok) {
    return NextResponse.json(
      { ok: false, error: contextResult.message },
      { status: contextResult.status },
    );
  }

  const result = await listBlocks(contextResult.context);
  if (result.status === "unavailable") {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        blocks: [],
        reason: result.reason,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    blocks: result.blocks,
    count: result.blocks.length,
  });
}
