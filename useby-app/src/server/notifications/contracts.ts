import { getTableAvailability } from "../db/introspection";

export type NotificationAudience = "household" | "merchant";

export type NotificationStatus = "unread" | "read" | "archived";

export type NotificationChannelStatus =
  | "in_app_recorded"
  | "email_dry_run"
  | "email_unavailable"
  | "email_skipped";

export type NotificationCandidate = {
  audience: NotificationAudience;
  householdId?: string | null;
  merchantId?: string | null;
  neighbourhoodId?: string | null;
  sourceType:
    | "booking"
    | "lending_reservation"
    | "demand_pool"
    | "pool_order"
    | "pickup_task"
    | "store_drop_reservation";
  sourceId: string;
  eventType:
    | "booking_pickup_reminder"
    | "lending_pickup_reminder"
    | "demand_pool_awarded"
    | "pool_order_ready"
    | "pickup_task_ready"
    | "store_drop_pickup_reminder";
  title: string;
  body: string;
  actionHref: string;
  reminderAt: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationDto = {
  id: string;
  audience: NotificationAudience;
  householdId: string | null;
  merchantId: string | null;
  sourceType: NotificationCandidate["sourceType"];
  sourceId: string;
  eventType: NotificationCandidate["eventType"] | string;
  title: string;
  body: string;
  actionHref: string | null;
  status: NotificationStatus | string;
  channelStatus: NotificationChannelStatus | string | null;
  createdAt: string | null;
  readAt: string | null;
  metadata: Record<string, unknown>;
};

export const NOTIFICATIONS_TABLE = "notifications";

export const REQUIRED_NOTIFICATION_COLUMNS = [
  "id",
  "audience",
  "household_id",
  "merchant_id",
  "neighbourhood_id",
  "source_type",
  "source_id",
  "event_type",
  "title",
  "body",
  "action_href",
  "status",
  "channel_status",
  "reminder_at",
  "read_at",
  "metadata",
  "idempotency_key",
  "demo_scope_id",
  "is_demo",
  "created_at",
] as const;

export type NotificationTableContract = {
  available: boolean;
  reason?: string;
  missingColumns: string[];
};

export async function checkNotificationTable(): Promise<NotificationTableContract> {
  const availability = await getTableAvailability(NOTIFICATIONS_TABLE);
  if (!availability.exists) {
    return {
      available: false,
      reason:
        "notifications table is not available; expected columns: " +
        REQUIRED_NOTIFICATION_COLUMNS.join(", "),
      missingColumns: [...REQUIRED_NOTIFICATION_COLUMNS],
    };
  }

  const missingColumns = REQUIRED_NOTIFICATION_COLUMNS.filter(
    (column) => !availability.columns.has(column),
  );

  return {
    available: missingColumns.length === 0,
    reason:
      missingColumns.length > 0
        ? `notifications missing columns: ${missingColumns.join(", ")}`
        : undefined,
    missingColumns,
  };
}

export function notificationIdempotencyKey(candidate: NotificationCandidate): string {
  return [
    "notification",
    candidate.eventType,
    candidate.audience,
    candidate.householdId ?? candidate.merchantId ?? "system",
    candidate.sourceType,
    candidate.sourceId,
  ].join(":");
}
