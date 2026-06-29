import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { groceryItemUpdateSchema } from "@/server/grocery/contracts";
import {
  isGroceryRuntimeError,
  updateGroceryItem,
} from "@/server/grocery/runtime";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid grocery item update payload.",
      details: error,
    },
    { status: 400 },
  );
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const { itemId } = await routeContext.params;
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

  const parsed = groceryItemUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  try {
    const response = await updateGroceryItem(
      contextResult.context,
      itemId,
      parsed.data,
    );
    return NextResponse.json(response);
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Grocery item update failed." },
      { status: 500 },
    );
  }
}
