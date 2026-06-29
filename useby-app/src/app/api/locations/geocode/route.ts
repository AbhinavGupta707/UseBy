import { NextResponse } from "next/server";

import { geocodePreviewSchema } from "@/server/geocoding/contracts";
import { previewGeocode } from "@/server/locations/runtime";
import { locationCatchResponse, parseJsonBody } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, geocodePreviewSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const response = await previewGeocode(parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return locationCatchResponse(error);
  }
}
