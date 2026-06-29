import { NextResponse } from "next/server";

import { pickupTransitionSchema } from "@/server/demand-pools/contracts";
import { transitionPickup } from "@/server/merchant/runtime";
import {
  type PickupRouteContext,
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
  parseJsonBody,
} from "../../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, routeContext: PickupRouteContext) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, pickupTransitionSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const { orderId } = await routeContext.params;
    const response = await transitionPickup(
      contextResult.context,
      orderId,
      "collected",
      parsed.data,
    );
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
