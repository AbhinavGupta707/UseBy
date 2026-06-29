import { type NextRequest, NextResponse } from "next/server";
import {
  MATCHES_CONTRACT,
  checkCp2Contracts,
  unavailableCp2Reason,
} from "../../../../server/actions/contracts";
import { loadRuntimeEnv } from "../../../../server/db/env";
import { listGroceryMatches } from "../../../../server/matching/recompute";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return NextResponse.json({
      status: "unavailable",
      matches: [],
      count: 0,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    });
  }

  const contracts = await checkCp2Contracts([
    MATCHES_CONTRACT,
    {
      table: "needs",
      requiredColumns: ["id", "category", "title", "quantity", "unit", "needed_by"],
    },
    {
      table: "item_instances",
      requiredColumns: ["id", "title", "quantity", "unit"],
    },
    {
      table: "households",
      requiredColumns: ["id", "coarse_location_label"],
    },
  ]);

  if (!contracts.available) {
    return NextResponse.json({
      status: "unavailable",
      matches: [],
      count: 0,
      reason: unavailableCp2Reason(contracts),
    });
  }

  const result = await listGroceryMatches({
    neighbourhoodId: request.nextUrl.searchParams.get("neighbourhoodId"),
    householdId: request.nextUrl.searchParams.get("householdId"),
  });

  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
  });
}
