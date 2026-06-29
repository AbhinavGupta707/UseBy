import { NextResponse } from "next/server";

import { listMerchantDemandPools } from "@/server/merchant/runtime";
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
    const response = await listMerchantDemandPools(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
