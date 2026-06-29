import { NextResponse } from "next/server";

import { getMerchantDemandPool } from "@/server/merchant/runtime";
import {
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
} from "../../_shared";

export const dynamic = "force-dynamic";

type PoolRouteContext = {
  params: Promise<{
    poolId: string;
  }>;
};

export async function GET(request: Request, routeContext: PoolRouteContext) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const { poolId } = await routeContext.params;
    const response = await getMerchantDemandPool(contextResult.context, poolId);
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
