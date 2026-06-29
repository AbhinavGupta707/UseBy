import { NextResponse } from "next/server";

import { bookingRequestSchema } from "@/server/bookings/contracts";
import { requestBooking } from "@/server/bookings/runtime";
import {
  bookingCatchResponse,
  contextErrorResponse,
  demoContextFromRequest,
  parseJsonBody,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, bookingRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await requestBooking(contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return bookingCatchResponse(error);
  }
}
