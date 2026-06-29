import { NextResponse } from "next/server";

import { transitionMerchantStoreDrop } from "@/server/merchant/store-drops";
import {
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
  type StoreDropRouteContext,
} from "../../../_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  routeContext: StoreDropRouteContext,
) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const { dropId } = await routeContext.params;
    const response = await transitionMerchantStoreDrop(
      contextResult.context,
      dropId,
      "pause",
    );
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}

