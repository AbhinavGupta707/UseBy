export type NotificationAudience = "household" | "merchant";

export type NotificationListItem = {
  id: string;
  audience: NotificationAudience;
  householdId: string | null;
  merchantId: string | null;
  sourceType: string;
  sourceId: string;
  eventType: string;
  title: string;
  body: string;
  actionHref: string | null;
  status: string;
  channelStatus: string | null;
  createdAt: string | null;
  readAt: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationListResponse = {
  ok: boolean;
  status: "ok" | "unavailable" | "error";
  result: {
    notifications: NotificationListItem[];
    unreadCount: number;
    scope: NotificationAudience;
  };
  reason?: string;
  missingColumns?: string[];
};
