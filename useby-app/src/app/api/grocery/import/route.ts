import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { groceryImportSchema } from "@/server/grocery/contracts";
import {
  importGroceryItems,
  isGroceryRuntimeError,
} from "@/server/grocery/runtime";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid grocery import payload.",
      details: error,
    },
    { status: 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/grocery/import",
    method: "POST",
    context:
      "Uses explicit demo actor/household selectors via query params or x-useby-demo-* headers until auth replaces this helper.",
    idempotency:
      "Provide idempotencyKey, or the route derives one from the normalized request and demo household.",
    recompute:
      "Returns affected item ids for the Lane 2B action-card/match recompute contract.",
  });
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

  const parsed = groceryImportSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  try {
    const response = await importGroceryItems(contextResult.context, parsed.data);
    return NextResponse.json(response, { status: response.idempotent ? 200 : 201 });
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Grocery import failed." },
      { status: 500 },
    );
  }
}
