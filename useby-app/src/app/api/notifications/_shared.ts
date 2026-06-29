import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import { resolveMerchantActorContext } from "@/server/merchant/context";
import {
  householdScopeFromContext,
  merchantScopeFromContext,
  notificationRuntimeError,
  type NotificationScope,
} from "@/server/notifications/runtime";

export type NotificationRouteContext = {
  params: Promise<{
    notificationId: string;
  }>;
};

export async function notificationScopeFromRequest(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope")?.trim() === "merchant" ? "merchant" : "household";

  if (scope === "merchant") {
    const result = await resolveMerchantActorContext({
      headers: request.headers,
      searchParams: url.searchParams,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      context: merchantScopeFromContext(result.context),
    };
  }

  const result = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true as const,
    context: householdScopeFromContext(result.context),
  };
}

export function contextErrorResponse(result: { status: number; message: string }) {
  return NextResponse.json(
    { ok: false, status: "unavailable", error: result.message },
    { status: result.status },
  );
}

export function notificationResponse<T>(
  response: {
    ok: boolean;
    status: string;
    result: T;
    reason?: string;
    missingColumns?: string[];
  },
  successStatus = 200,
) {
  if (response.ok) {
    return NextResponse.json(response, { status: successStatus });
  }

  return NextResponse.json(response, {
    status: response.status === "unavailable" ? 503 : 404,
  });
}

export function notificationCatchResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      status: "error",
      error: notificationRuntimeError(error),
    },
    { status: 500 },
  );
}

export type { NotificationScope };
