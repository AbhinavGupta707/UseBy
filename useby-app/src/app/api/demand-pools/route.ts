import { NextResponse } from "next/server";

import { demandPoolCreateSchema } from "@/server/demand-pools/contracts";
import {
  createDemandPool,
  listDemandPools,
} from "@/server/demand-pools/runtime";
import {
  contextErrorResponse,
  demandPoolCatchResponse,
  demoContextFromRequest,
  parseJsonBody,
} from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  try {
    const response = await listDemandPools(contextResult.context);
    return NextResponse.json(response);
  } catch (error) {
    return demandPoolCatchResponse(error);
  }
}

export async function POST(request: Request) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, demandPoolCreateSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await createDemandPool(contextResult.context, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return demandPoolCatchResponse(error);
  }
}
