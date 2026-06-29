import { NextResponse } from "next/server";

import { demandPoolCancelCommitmentSchema } from "@/server/demand-pools/contracts";
import { cancelDemandPoolCommitment } from "@/server/demand-pools/runtime";
import {
  contextErrorResponse,
  demandPoolCatchResponse,
  demoContextFromRequest,
  parseJsonBody,
  type DemandPoolRouteContext,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, routeContext: DemandPoolRouteContext) {
  const contextResult = await demoContextFromRequest(request);
  if (!contextResult.ok) {
    return contextErrorResponse(contextResult);
  }

  const parsed = await parseJsonBody(request, demandPoolCancelCommitmentSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { poolId } = await routeContext.params;

  try {
    const response = await cancelDemandPoolCommitment(
      poolId,
      contextResult.context,
      parsed.data,
    );
    return NextResponse.json(response);
  } catch (error) {
    return demandPoolCatchResponse(error);
  }
}
