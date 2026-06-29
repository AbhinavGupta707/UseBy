import { NextResponse } from "next/server";

import {
  createMerchantStoreDrop,
  listMerchantStoreDrops,
} from "@/server/merchant/store-drops";
import { merchantStoreDropCreateSchema } from "@/server/store-drops/contracts";
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
    const response = await listMerchantStoreDrops(contextResult.context);
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

  const body = await parseJsonBody(request, merchantStoreDropCreateSchema);
  if (!body.ok) {
    return body.response;
  }

  try {
    const response = await createMerchantStoreDrop(contextResult.context, body.data);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return merchantCatchResponse(error);
  }
}

