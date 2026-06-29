import { NextResponse } from "next/server";

import { listLendingListings } from "@/server/lending/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  lendingCatchResponse,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listLendingListings(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return lendingCatchResponse(error);
  }
}
