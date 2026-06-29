import { markNotificationRead } from "@/server/notifications/runtime";
import {
  contextErrorResponse,
  notificationCatchResponse,
  notificationResponse,
  notificationScopeFromRequest,
  type NotificationRouteContext,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: NotificationRouteContext) {
  const scopeResult = await notificationScopeFromRequest(request);
  if (!scopeResult.ok) {
    return contextErrorResponse(scopeResult);
  }

  const { notificationId } = await context.params;

  try {
    return notificationResponse(
      await markNotificationRead(scopeResult.context, notificationId),
    );
  } catch (error) {
    return notificationCatchResponse(error);
  }
}
