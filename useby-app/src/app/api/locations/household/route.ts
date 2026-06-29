import { NextResponse } from "next/server";

import { householdLocationUpdateSchema } from "@/server/geocoding/contracts";
import { updateHouseholdLocation } from "@/server/locations/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  locationCatchResponse,
  parseJsonBody,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, householdLocationUpdateSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await updateHouseholdLocation(contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return locationCatchResponse(error);
  }
}
