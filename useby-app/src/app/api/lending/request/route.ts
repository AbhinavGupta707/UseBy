import { NextResponse } from "next/server";

import { lendingRequestSchema } from "@/server/lending/contracts";
import { requestLending } from "@/server/lending/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  lendingCatchResponse,
  parseJsonBody,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, lendingRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await requestLending(contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return lendingCatchResponse(error);
  }
}
