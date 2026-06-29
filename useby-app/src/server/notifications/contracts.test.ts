import { describe, expect, it } from "vitest";

import {
  REQUIRED_NOTIFICATION_COLUMNS,
  notificationIdempotencyKey,
  type NotificationCandidate,
} from "./contracts";

describe("notification contracts", () => {
  it("documents the table columns required by the CP8 notification runtime", () => {
    expect(REQUIRED_NOTIFICATION_COLUMNS).toEqual(
      expect.arrayContaining([
        "recipient_household_id",
        "recipient_merchant_id",
        "topic",
        "entity_type",
        "entity_id",
        "source",
        "metadata",
        "idempotency_key",
        "read_at",
      ]),
    );
    expect(REQUIRED_NOTIFICATION_COLUMNS).not.toContain("audience");
    expect(REQUIRED_NOTIFICATION_COLUMNS).not.toContain("channel_status");
  });

  it("uses recipient scope and source row identity for idempotency", () => {
    const baseCandidate: NotificationCandidate = {
      audience: "household",
      householdId: "household-a",
      sourceType: "booking",
      sourceId: "booking-a",
      eventType: "booking_pickup_reminder",
      title: "Pickup reminder",
      body: "Pickup details are ready in UseBy.",
      actionHref: "/bookings",
      reminderAt: null,
      metadata: {},
    };

    expect(notificationIdempotencyKey(baseCandidate)).toBe(
      "notification:booking_pickup_reminder:household:household-a:booking:booking-a",
    );
    expect(
      notificationIdempotencyKey({
        ...baseCandidate,
        householdId: "household-b",
      }),
    ).not.toBe(notificationIdempotencyKey(baseCandidate));
  });
});
