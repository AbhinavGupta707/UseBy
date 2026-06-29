import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { publicErrorMessage } from "@/server/db/introspection";
import { resolveDemoActorContext } from "@/server/demo/context";
import {
  isLocationRuntimeError,
  type LocationRuntimeError,
} from "@/server/locations/runtime";

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

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Invalid location payload.",
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

export function locationRuntimeErrorResponse(error: LocationRuntimeError) {
  return NextResponse.json(
    {
      ok: false,
      status: error.status === 503 ? "unavailable" : "error",
      error: error.message,
    },
    { status: error.status },
  );
}

export function locationCatchResponse(error: unknown) {
  if (isLocationRuntimeError(error)) {
    return locationRuntimeErrorResponse(error);
  }

  return NextResponse.json(
    { ok: false, status: "error", error: publicErrorMessage(error) },
    { status: 500 },
  );
}
