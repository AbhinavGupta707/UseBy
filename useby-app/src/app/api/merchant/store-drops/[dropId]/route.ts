import { NextResponse } from "next/server";

import { updateMerchantStoreDrop } from "@/server/merchant/store-drops";
import { merchantStoreDropCreateSchema } from "@/server/store-drops/contracts";
import {
  contextErrorResponse,
  merchantCatchResponse,
  merchantContextFromRequest,
  parseJsonBody,
  type StoreDropRouteContext,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  routeContext: StoreDropRouteContext,
) {
  const contextResult = await merchantContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const body = await parseJsonBody(request, merchantStoreDropCreateSchema);
  if (!body.ok) {
    return body.response;
  }

  try {
    const { dropId } = await routeContext.params;
    const response = await updateMerchantStoreDrop(
      contextResult.context,
      dropId,
      body.data,
    );
    return NextResponse.json(response);
  } catch (error) {
    return merchantCatchResponse(error);
  }
}
