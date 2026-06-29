import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { resolveMerchantActorContext } from "@/server/merchant/context";
import {
  isMerchantRuntimeError,
  type MerchantRuntimeError,
} from "@/server/merchant/runtime";

export type BidRouteContext = {
  params: Promise<{
    bidId: string;
  }>;
};

export type PickupRouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export async function merchantContextFromRequest(request: Request) {
  const url = new URL(request.url);
  return resolveMerchantActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });
}

export function contextErrorResponse(result: { status: number; message: string }) {
  return NextResponse.json(
    { ok: false, status: "unavailable", error: result.message },
    { status: result.status },
  );
}

export function runtimeErrorResponse(error: MerchantRuntimeError) {
  return NextResponse.json(
    {
      ok: false,
      status: error.status === 503 ? "unavailable" : "error",
      error: error.message,
    },
    { status: error.status },
  );
}

export function unknownErrorResponse() {
  return NextResponse.json(
    { ok: false, status: "error", error: "Merchant runtime failed." },
    { status: 500 },
  );
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Request body must be JSON.",
        },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Invalid merchant payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export function merchantCatchResponse(error: unknown) {
  if (isMerchantRuntimeError(error)) {
    return runtimeErrorResponse(error);
  }

  return unknownErrorResponse();
}
