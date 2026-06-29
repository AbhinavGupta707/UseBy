import { NextResponse } from "next/server";

import { getStoreDrop } from "@/server/store-drops/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  storeDropCatchResponse,
  type StoreDropRouteContext,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, routeContext: StoreDropRouteContext) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const { dropId } = await routeContext.params;

  try {
    const response = await getStoreDrop(dropId, contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return storeDropCatchResponse(error);
  }
}
