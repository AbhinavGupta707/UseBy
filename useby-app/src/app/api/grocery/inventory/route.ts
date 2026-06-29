import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import {
  isGroceryRuntimeError,
  listGroceryInventory,
} from "@/server/grocery/runtime";

export const dynamic = "force-dynamic";

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

  try {
    const response = await listGroceryInventory(contextResult.context);
    return NextResponse.json({
      ...response,
      context: {
        demoScope: contextResult.context.demoScope,
        household: contextResult.context.household,
        user: {
          id: contextResult.context.user.id,
          displayName: contextResult.context.user.displayName,
        },
        neighbourhood: contextResult.context.neighbourhood,
      },
    });
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Grocery inventory unavailable." },
      { status: 500 },
    );
  }
}
