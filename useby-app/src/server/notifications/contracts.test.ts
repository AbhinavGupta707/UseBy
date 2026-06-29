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
        "audience",
        "household_id",
        "merchant_id",
        "source_type",
        "source_id",
        "event_type",
        "channel_status",
        "idempotency_key",
        "read_at",
      ]),
    );
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
