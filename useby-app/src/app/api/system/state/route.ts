import { NextResponse } from "next/server";
import { getSystemState } from "../../../../lib/system-state/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getSystemState();
  return NextResponse.json(state, {
    status: state.status === "unavailable" ? 503 : 200,
  });
}
