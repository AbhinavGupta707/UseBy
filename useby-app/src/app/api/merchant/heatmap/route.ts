import { NextResponse } from "next/server";

import { getMerchantHeatmap } from "@/server/heatmap/merchant";
import {
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await getMerchantHeatmap(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}

