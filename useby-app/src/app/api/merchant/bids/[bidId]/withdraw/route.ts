import { NextResponse } from "next/server";

import { merchantBidWithdrawSchema } from "@/server/demand-pools/contracts";
import { withdrawMerchantBid } from "@/server/merchant/runtime";
import {
  type BidRouteContext,
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
  parseJsonBody,
} from "../../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, routeContext: BidRouteContext) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, merchantBidWithdrawSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const { bidId } = await routeContext.params;
    const response = await withdrawMerchantBid(
      contextResult.context,
      bidId,
      parsed.data,
    );
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
