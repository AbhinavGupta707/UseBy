import { NextResponse } from "next/server";

import { listNotifications } from "@/server/notifications/runtime";
import {
  contextErrorResponse,
  notificationCatchResponse,
  notificationResponse,
  notificationScopeFromRequest,
} from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scopeResult = await notificationScopeFromRequest(request);
  if (!scopeResult.ok) {
    return contextErrorResponse(scopeResult);
  }

  try {
    return notificationResponse(await listNotifications(scopeResult.context));
  } catch (error) {
    return notificationCatchResponse(error);
  }
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      status: "error",
      error: "Use /api/jobs/pickup-reminders to generate notifications from live rows.",
    },
    { status: 405 },
  );
}
