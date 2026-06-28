import { NextResponse } from "next/server";
import { getDbProof } from "../../../../lib/system-state/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const proof = await getDbProof();
  return NextResponse.json(proof, {
    status: proof.status === "unavailable" ? 503 : 200,
  });
}
