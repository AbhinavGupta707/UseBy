import { NextResponse } from "next/server";

import { getDemandPool } from "@/server/demand-pools/runtime";
import {
  contextErrorResponse,
  demandPoolCatchResponse,
  demoContextFromRequest,
  type DemandPoolRouteContext,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, routeContext: DemandPoolRouteContext) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const { poolId } = await routeContext.params;

  try {
    const response = await getDemandPool(poolId, contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return demandPoolCatchResponse(error);
  }
}
