import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { resolveDemoActorContext } from "@/server/demo/context";
import {
  isLendingRuntimeError,
  type LendingRuntimeError,
} from "@/server/lending/runtime";

export type RouteContext = {
  params: Promise<{
    bookingId: string;
  }>;
};

export async function demoContextFromRequest(request: Request) {
  const url = new URL(request.url);
  return resolveDemoActorContext({
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

export function runtimeErrorResponse(error: LendingRuntimeError) {
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
    { ok: false, status: "error", error: "Lending runtime failed." },
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
          error: "Invalid lending payload.",
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

export function lendingCatchResponse(error: unknown) {
  if (isLendingRuntimeError(error)) {
    return runtimeErrorResponse(error);
  }

  return unknownErrorResponse();
}
