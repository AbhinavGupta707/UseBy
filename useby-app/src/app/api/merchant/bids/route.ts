import { NextResponse } from "next/server";

import { merchantBidInputSchema } from "@/server/demand-pools/contracts";
import {
  listMerchantBids,
  submitMerchantBid,
} from "@/server/merchant/runtime";
import {
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
  parseJsonBody,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listMerchantBids(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}

export async function POST(request: Request) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, merchantBidInputSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await submitMerchantBid(contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
