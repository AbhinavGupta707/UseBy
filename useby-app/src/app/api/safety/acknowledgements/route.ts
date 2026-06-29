import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { safetyAcknowledgementCreateSchema } from "@/server/safety/contracts";
import {
  checkSafetyAcknowledgement,
  createSafetyAcknowledgement,
} from "@/server/safety/runtime";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid safety acknowledgement payload.",
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

  const parsed = safetyAcknowledgementCreateSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  const result = await createSafetyAcknowledgement(
    contextResult.context,
    parsed.data,
  );

  if (result.status === "unavailable") {
    return NextResponse.json(
      { ok: false, status: "unavailable", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    acknowledgement: result.acknowledgement,
    audit: result.audit,
    notice:
      "UseBy records acknowledgement only; it does not certify food safety or freshness.",
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

  const result = await checkSafetyAcknowledgement({
    householdId: contextResult.context.household.id,
    acknowledgementType: "food_handoff",
    itemId: url.searchParams.get("itemId"),
    bookingId: url.searchParams.get("bookingId"),
  });

  if (result.status === "unavailable") {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        acknowledged: false,
        reason: result.reason,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    acknowledged: result.acknowledged,
    acknowledgement: result.acknowledgement,
    notice:
      "UseBy records acknowledgement only; it does not certify food safety or freshness.",
  });
}
