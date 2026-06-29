import { NextResponse } from "next/server";

import { storeDropReserveSchema } from "@/server/store-drops/contracts";
import { reserveStoreDrop } from "@/server/store-drops/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  parseJsonBody,
  storeDropCatchResponse,
  type StoreDropRouteContext,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, routeContext: StoreDropRouteContext) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, storeDropReserveSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { dropId } = await routeContext.params;

  try {
    const response = await reserveStoreDrop(dropId, contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return storeDropCatchResponse(error);
  }
}
