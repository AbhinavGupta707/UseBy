import { type NextRequest, NextResponse } from "next/server";
import {
  ACTION_CARDS_CONTRACT,
  checkCp2Contracts,
  unavailableCp2Reason,
} from "../../../../server/actions/contracts";
import { listActionCards } from "../../../../server/actions/recompute";
import { loadRuntimeEnv } from "../../../../server/db/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return NextResponse.json({
      status: "unavailable",
      cards: [],
      count: 0,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    });
  }

  const contracts = await checkCp2Contracts([
    ACTION_CARDS_CONTRACT,
    {
      table: "item_instances",
      requiredColumns: ["id", "title", "quantity", "unit"],
    },
  ]);

  if (!contracts.available) {
    return NextResponse.json({
      status: "unavailable",
      cards: [],
      count: 0,
      reason: unavailableCp2Reason(contracts),
    });
  }

  const result = await listActionCards({
    neighbourhoodId: request.nextUrl.searchParams.get("neighbourhoodId"),
    householdId: request.nextUrl.searchParams.get("householdId"),
  });

  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
  });
}
