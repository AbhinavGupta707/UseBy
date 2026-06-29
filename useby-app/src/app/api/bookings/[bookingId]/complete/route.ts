import { NextResponse } from "next/server";

import { bookingCompleteSchema } from "@/server/bookings/contracts";
import { completeBooking } from "@/server/bookings/runtime";
import {
  bookingCatchResponse,
  contextErrorResponse,
  demoContextFromRequest,
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

  const parsed = await parseJsonBody(request, bookingCompleteSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await completeBooking(contextResult.context, bookingId, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return bookingCatchResponse(error);
  }
}
