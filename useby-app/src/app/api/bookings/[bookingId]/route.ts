import { NextResponse } from "next/server";

import { getBookingDetail } from "@/server/bookings/runtime";
import {
  bookingCatchResponse,
  contextErrorResponse,
  demoContextFromRequest,
  type RouteContext,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, routeContext: RouteContext) {
  const { bookingId } = await routeContext.params;
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await getBookingDetail(contextResult.context, bookingId);
    return NextResponse.json(response);
  } catch (error) {
    return bookingCatchResponse(error);
  }
}
