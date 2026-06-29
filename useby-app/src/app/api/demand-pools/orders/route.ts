import { NextResponse } from "next/server";

import { listDemandPoolOrders } from "@/server/demand-pools/runtime";
import {
  contextErrorResponse,
  demandPoolCatchResponse,
  demoContextFromRequest,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listDemandPoolOrders(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return demandPoolCatchResponse(error);
  }
}
