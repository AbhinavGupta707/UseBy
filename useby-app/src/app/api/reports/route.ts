import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { reportCreateSchema } from "@/server/moderation/contracts";
import { createReport } from "@/server/moderation/runtime";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid report payload.",
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

  const parsed = reportCreateSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  const result = await createReport(contextResult.context, parsed.data);
  if (result.status === "unavailable") {
    return NextResponse.json(
      { ok: false, status: "unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    report: result.report,
    audit: result.audit,
    trust: result.trust,
  });
}
