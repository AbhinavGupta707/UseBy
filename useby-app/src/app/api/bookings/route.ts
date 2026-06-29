import { NextResponse } from "next/server";

import { listBookings } from "@/server/bookings/runtime";
import {
  bookingCatchResponse,
  contextErrorResponse,
  demoContextFromRequest,
} from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listBookings(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return bookingCatchResponse(error);
  }
}
