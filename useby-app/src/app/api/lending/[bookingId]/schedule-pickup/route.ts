import { NextResponse } from "next/server";

import { lendingSchedulePickupSchema } from "@/server/lending/contracts";
import { scheduleLendingPickup } from "@/server/lending/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  lendingCatchResponse,
  parseJsonBody,
  type RouteContext,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, routeContext: RouteContext) {
  const { bookingId } = await routeContext.params;
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, lendingSchedulePickupSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await scheduleLendingPickup(contextResult.context, bookingId, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return lendingCatchResponse(error);
  }
}
