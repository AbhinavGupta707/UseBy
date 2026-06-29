import { NextResponse } from "next/server";

import { listStoreDrops } from "@/server/store-drops/runtime";
import {
  contextErrorResponse,
  demoContextFromRequest,
  storeDropCatchResponse,
} from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listStoreDrops(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return storeDropCatchResponse(error);
  }
}
